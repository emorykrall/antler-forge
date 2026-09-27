// Inlines src/antler-core.js into the designer page.
// dist/antler-forge.html            -> body-only page for the Artifact publisher
// dist/antler-forge-standalone.html -> full document to open locally in any browser
// dist/site/                        -> standalone page + the local face tracker, for live try-on
// Usage: node tools/build-page.js [outDir]   (outDir defaults to dist/)
const fs = require('fs');
const path = require('path');
const repo = path.join(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(repo, 'dist'));
const core = fs.readFileSync(repo + '/src/antler-core.js', 'utf8');
const headScan = fs.readFileSync(repo + '/src/head-scan.js', 'utf8');
const src = fs.readFileSync(repo + '/src/designer.src.html', 'utf8');
const page = src.replace('/*__CORE__*/', () => core).replace('/*__HEADSCAN__*/', () => headScan);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(out + '/antler-forge.html', page);
const full = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  + '<style>body{margin:0}[hidden]{display:none!important}</style></head><body>\n' + page + '\n</body></html>\n';
fs.writeFileSync(out + '/antler-forge-standalone.html', full);
// site/ = standalone page + the local face tracker, for live try-on in a browser
const site = out + '/site';
fs.mkdirSync(site + '/vendor/face_mesh', { recursive: true });
fs.writeFileSync(site + '/index.html', full);
for (const f of fs.readdirSync(repo + '/vendor/face_mesh')) fs.copyFileSync(repo + '/vendor/face_mesh/' + f, site + '/vendor/face_mesh/' + f);
fs.copyFileSync(repo + '/tools/serve.js', site + '/serve.js');
// script-wrapped copies of the binary tracker files, so a double-clicked index.html (file://) still works
for (const f of fs.readdirSync(site + '/vendor/face_mesh')) {
  if (!f.endsWith('.wasm')) continue;
  const b64 = fs.readFileSync(site + '/vendor/face_mesh/' + f).toString('base64');
  fs.writeFileSync(site + '/vendor/face_mesh/' + f + '.b64.js', '(window.__AF_ASSETS=window.__AF_ASSETS||{})[' + JSON.stringify(f) + ']="' + b64 + '";\n');
}
console.log('built ' + path.relative(process.cwd(), out + '/antler-forge.html'), (page.length / 1024).toFixed(0) + ' KB');
