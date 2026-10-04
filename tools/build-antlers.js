#!/usr/bin/env node
/*
 * build-antlers.js — command-line builder for watertight antler STLs.
 *
 * Uses the exact same geometry engine as the browser designer
 * (src/antler-core.js), so a design exported from the page builds identically.
 *
 *   node tools/build-antlers.js design.json                  # right + left STL, at the design's mesh resolution
 *   node tools/build-antlers.js design.json --res 0.35       # finer mesh (a crown's head scan, saved beside it, is found)
 *   node tools/build-antlers.js --preset elk --scale 0.7     # no design file needed
 *   node tools/build-antlers.js design.json --side right --out ./stl
 *   node tools/build-antlers.js --preset elk --style crown --ringBase openBack --headCirc 571.5
 *   node tools/build-antlers.js --preset stag --style crown --scan my-head.obj   # crown fitted to a head scan
 *   node tools/build-antlers.js --list-presets
 *
 * Any parameter can be overridden: --beamLength 260 --mount clip --hbWidth 15
 * Exit code is 1 if the mesh fails the watertight / manifold check, 2 for bad arguments.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Core = require('../src/antler-core.js');
const HeadScan = require('../src/head-scan.js');

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const k = t.slice(2);
      const nxt = argv[i + 1];
      if (nxt === undefined || nxt.startsWith('--')) a[k] = true; else { a[k] = nxt; i++; }
    } else a._.push(t);
  }
  return a;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 17).map((l) => l.replace(/^ \*\s?/, '')).join('\n'));
    return 0;
  }
  if (args['list-presets']) {
    for (const [k, v] of Object.entries(Core.PRESETS)) console.log(`${k.padEnd(10)} ${v.label}`);
    return 0;
  }

  const fail = (msg) => { console.error(msg); return 2; };
  let params = {};
  if (args._[0]) {
    const raw = JSON.parse(fs.readFileSync(args._[0], 'utf8'));
    params = raw.params || raw;
  }
  if (args.preset !== undefined) {
    if (!Core.PRESETS[args.preset]) return fail(`Unknown species "${args.preset === true ? '' : args.preset}". Try --list-presets.`);
    params = Core.presetParams(args.preset, params.mount ? params : null);
  }
  if (!args.scan && params.style === 'crown' && params.headSource === 'scan') {   // a design fitted to a scan: the page's zip keeps it beside the design
    const dir = args._[0] ? path.dirname(args._[0]) : '.', guess = args._[0] ? args._[0].replace(/-design\.json$/i, '-head-scan.json') : null;
    const found = guess && guess !== args._[0] && fs.existsSync(guess) ? guess
      : (() => { const all = fs.readdirSync(dir).filter((f) => /-head-scan\.json$/i.test(f)); return all.length === 1 ? path.join(dir, all[0]) : null; })();
    if (!found) return fail('This crown is fitted to a head scan. Put its -head-scan.json (from the same zip) next to the design, or pass --scan <file>.');
    args.scan = found;
  }
  if (args.scan) {   // a head scan (STL/OBJ/PLY, or a scan saved from the page as .json) for a crown to fit
    const f = String(args.scan), buf = fs.readFileSync(f);
    let scan;
    if (/\.json$/i.test(f)) scan = HeadScan.unpack(JSON.parse(buf.toString('utf8')));
    else { const mesh = HeadScan.parse(buf, f); scan = HeadScan.build(mesh, HeadScan.guessOrientation(mesh, f)); }
    Core.registerHeadScan('cli-scan', scan);
    Object.assign(params, { style: 'crown', headSource: 'scan', headScan: 'cli-scan' });
    console.log(`scan       ${path.basename(f)}: ${(scan.circ / 25.4).toFixed(1)} in round at the tape line, ${(2 * scan.seat[0] / 25.4).toFixed(1)} × ${(2 * scan.seat[1] / 25.4).toFixed(1)} in`);
  }
  const known = new Set(Object.keys(Core.DEFAULTS));
  for (const [k, v] of Object.entries(args)) {
    if (!known.has(k) || k === 'preset') continue;
    params[k] = v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v);
  }
  const P = Core.resolveParams(params);
  const res = Number(args.res || args.resolution || P.resolution || 0.5);   // the page's own resolution unless told otherwise
  if (!(res >= 0.2 && res <= 3)) return fail(`--res must be a number of millimetres between 0.2 and 3 (got ${args.res || args.resolution}).`);
  const side = String(args.side || 'both');
  const outDir = path.resolve(String(args.out || '.'));
  const fil = Core.FILAMENTS[P.filament] || Core.FILAMENTS.bone;
  const crown = P.style === 'crown';
  const base = String(args.name || `${crown ? 'crown' : 'antler'}-${P.preset || 'custom'}-${fil.slug}`);
  fs.mkdirSync(outDir, { recursive: true });

  const t0 = Date.now();
  const skel = Core.buildSkeleton(P);
  let last = -1;
  const mesh = Core.meshAntler(skel, res, (p) => {
    const pct = Math.floor(p * 20);
    if (pct !== last && process.stderr.isTTY) { last = pct; process.stderr.write(`\rmeshing ${'█'.repeat(pct)}${'·'.repeat(20 - pct)} ${Math.round(p * 100)}%`); }
  });
  if (process.stderr.isTTY) process.stderr.write('\n');
  const rep = Core.validateMesh(mesh);
  rep.size = Core.plateSize(mesh, skel.fit.angle);   // as it sits on the plate
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  const f1 = (x) => x.toFixed(1);
  const fit = skel.fit;
  console.log(`design     ${(Core.PRESETS[P.preset] || {}).label || 'Custom'} · scale ${fit.scale.toFixed(2)}${fit.shrunk ? ` (shrunk from ${P.scale} to fit)` : ''} · ${crown ? `crown ${P.ringBase}, ${P.headSource === 'scan' ? 'fitted to the head scan' : `head ${P.headCirc} mm`}` : `base ${P.mount}`} · voxel ${res} mm`);
  console.log(`filament   ${fil.name}`);
  console.log(`size       ${f1(rep.size[0])} × ${f1(rep.size[1])} × ${f1(rep.size[2])} mm`);
  console.log(`mesh       ${rep.triangles.toLocaleString()} triangles, ${rep.vertices.toLocaleString()} vertices (${dt}s)`);
  console.log(`check      open edges ${rep.openEdges}, non-manifold edges ${rep.nonManifoldEdges}, shells ${rep.shells}, genus ${rep.genus}`);
  console.log(`volume     ${f1(rep.volume / 1000)} cm³  ≈ ${f1(rep.volume / 1000 * 1.24)} g PLA solid`);
  const fits = fit.fits;
  console.log(`printer    ${fits ? 'fits' : 'DOES NOT FIT'} ${P.bedX}×${P.bedY}×${P.bedZ} mm${fit.angle ? `, turned ${fit.angle}° on the plate` : ''}`);
  console.log(`watertight ${rep.watertight ? 'YES' : 'NO'}`);

  const written = [];
  if (crown) { const f = path.join(outDir, `${base}.stl`); fs.writeFileSync(f, Buffer.from(Core.toSTL(mesh, { name: base, rotZ: fit.angle }))); written.push(f); }   // one piece
  else if (side === 'both' || side === 'right') { const f = path.join(outDir, `${base}-right.stl`); fs.writeFileSync(f, Buffer.from(Core.toSTL(mesh, { name: base + ' right', rotZ: fit.angle }))); written.push(f); }
  if (!crown && (side === 'both' || side === 'left')) { const f = path.join(outDir, `${base}-left.stl`); fs.writeFileSync(f, Buffer.from(Core.toSTL(mesh, { mirror: true, name: base + ' left', rotZ: -fit.angle }))); written.push(f); }
  let cap = null, capOK = true;
  if (!crown && P.mount === 'skull') {   // the third part: the skull cap the antlers glue onto
    const csk = Core.buildSkullCap(P), cmesh = Core.meshAntler(csk, res), crep = Core.validateMesh(cmesh);
    crep.size = Core.plateSize(cmesh, csk.fit.angle);
    cap = { report: crep, fit: csk.fit };
    capOK = crep.watertight && crep.shells === 1 && csk.fit.fits;
    console.log(`skull cap  ${f1(crep.size[0])} × ${f1(crep.size[1])} × ${f1(crep.size[2])} mm · ${f1(crep.volume / 1000)} cm³ · open edges ${crep.openEdges}, shells ${crep.shells} · ${csk.fit.fits ? 'fits' : 'DOES NOT FIT'} · watertight ${crep.watertight ? 'YES' : 'NO'}`);
    const f = path.join(outDir, `${base}-skull.stl`); fs.writeFileSync(f, Buffer.from(Core.toSTL(cmesh, { name: base + ' skull cap', rotZ: csk.fit.angle }))); written.push(f);
  }
  if (args.notes !== 'false') { const f = path.join(outDir, `${base}-print-notes.txt`); fs.writeFileSync(f, Core.printNotes(P, rep, fit, cap ? { cap } : undefined)); written.push(f); }
  for (const f of written) console.log(`wrote      ${path.relative(process.cwd(), f) || f}`);
  return rep.watertight && rep.shells === 1 && capOK ? 0 : 1;
}

process.exitCode = main();
