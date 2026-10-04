// Inlines src/antler-core.js into the designer page, in each edition.
// dist/antler-forge.html                 -> body-only page for the Artifact publisher
// dist/antler-forge-standalone.html      -> full document to open locally in any browser
// dist/yellowjackets.html, dist/yellowjackets-standalone.html -> the same two for the Yellowjackets edition
// dist/site/                             -> index.html + yellowjackets.html + the local face tracker, for live try-on
// Usage: node tools/build-page.js [outDir]   (outDir defaults to dist/)
//
// Editions: src/designer.src.html is the storybook page. Its marked blocks (<!--@name-->…<!--@/name--> or
// /*@name*/…/*@/name*/) are swapped for the same-named blocks in src/editions/<edition>.html.
const fs = require('fs');
const path = require('path');
const repo = path.join(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(repo, 'dist'));
const core = fs.readFileSync(repo + '/src/antler-core.js', 'utf8');
const headScan = fs.readFileSync(repo + '/src/head-scan.js', 'utf8');
const deerSkull = fs.readFileSync(repo + '/src/deer-skull.js', 'utf8');   // the skull cap's scan, for the edition that offers the cap
const src = fs.readFileSync(repo + '/src/designer.src.html', 'utf8');
const EDITIONS = [
  { name: 'storybook', file: null, out: 'antler-forge', site: 'index.html' },
  { name: 'yellowjackets', file: 'src/editions/yellowjackets.html', out: 'yellowjackets', site: 'yellowjackets.html', skull: true },
];

function edition(ed) {
  let page = src;
  if (ed.file) {
    const blocks = fs.readFileSync(path.join(repo, ed.file), 'utf8');
    for (const m of blocks.matchAll(/<!--@(\w+)-->([\s\S]*?)<!--@\/\1-->/g)) {
      const [, name, body] = m;
      const re = new RegExp(`(<!--@${name}-->|/\\*@${name}\\*/)[\\s\\S]*?(<!--@/${name}-->|/\\*@/${name}\\*/)`);
      if (!re.test(page)) throw new Error(`${ed.file}: the page has no block "${name}"`);
      page = page.replace(re, (all, a, b) => a + body + b);
    }
  }
  return page.replace('/*__SKULL__*/', () => (ed.skull ? deerSkull : '')).replace('/*__CORE__*/', () => core).replace('/*__HEADSCAN__*/', () => headScan);
}
const full = (page) => '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  + '<style>body{margin:0}[hidden]{display:none!important}</style></head><body>\n' + page + '\n</body></html>\n';

fs.mkdirSync(out, { recursive: true });
// site/ = the standalone pages + the local models (face tracker, head segmentation), for try-on and head scans
const site = out + '/site';
fs.mkdirSync(site, { recursive: true });
for (const ed of EDITIONS) {
  const page = edition(ed);
  fs.writeFileSync(`${out}/${ed.out}.html`, page);
  fs.writeFileSync(`${out}/${ed.out}-standalone.html`, full(page));
  fs.writeFileSync(`${site}/${ed.site}`, full(page));
  console.log('built ' + path.relative(process.cwd(), `${out}/${ed.out}.html`), (page.length / 1024).toFixed(0) + ' KB');
}
fs.copyFileSync(repo + '/tools/serve.js', site + '/serve.js');
for (const lib of fs.readdirSync(repo + '/vendor')) {
  const from = repo + '/vendor/' + lib, to = site + '/vendor/' + lib;
  if (!fs.statSync(from).isDirectory()) continue;
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    fs.copyFileSync(from + '/' + f, to + '/' + f);
    // script-wrapped copies of the binary files, so a double-clicked index.html (file://) still works
    if (f.endsWith('.wasm')) fs.writeFileSync(to + '/' + f + '.b64.js', '(window.__AF_ASSETS=window.__AF_ASSETS||{})[' + JSON.stringify(lib + '/' + f) + ']="' + fs.readFileSync(from + '/' + f).toString('base64') + '";\n');
  }
}
