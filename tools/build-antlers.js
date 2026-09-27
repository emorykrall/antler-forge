#!/usr/bin/env node
/*
 * build-antlers.js — command-line builder for watertight antler STLs.
 *
 * Uses the exact same geometry engine as the browser designer
 * (src/antler-core.js), so a design exported from the page builds identically.
 *
 *   node tools/build-antlers.js design.json                  # right + left STL, 0.5 mm voxels
 *   node tools/build-antlers.js design.json --res 0.35       # finer mesh
 *   node tools/build-antlers.js --preset elk --scale 0.7     # no design file needed
 *   node tools/build-antlers.js design.json --side right --out ./stl
 *   node tools/build-antlers.js --list-presets
 *
 * Any parameter can be overridden: --beamLength 260 --mount clip --hbWidth 15
 * Exit code is 1 if the mesh fails the watertight / manifold check.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Core = require('../src/antler-core.js');

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

  let params = {};
  if (args._[0]) {
    const raw = JSON.parse(fs.readFileSync(args._[0], 'utf8'));
    params = raw.params || raw;
  }
  if (args.preset) params = Core.presetParams(args.preset, params.mount ? params : null);
  const known = new Set(Object.keys(Core.DEFAULTS));
  for (const [k, v] of Object.entries(args)) {
    if (!known.has(k) || k === 'preset') continue;
    params[k] = v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v);
  }
  const P = Core.resolveParams(params);
  const res = Number(args.res || args.resolution || 0.5);
  const side = String(args.side || 'both');
  const outDir = path.resolve(String(args.out || '.'));
  const fil = Core.FILAMENTS[P.filament] || Core.FILAMENTS.bone;
  const base = String(args.name || `antler-${P.preset || 'custom'}-${fil.slug}`);
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
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  const f1 = (x) => x.toFixed(1);
  const fit = skel.fit;
  console.log(`design     ${(Core.PRESETS[P.preset] || {}).label || 'Custom'} · scale ${fit.scale.toFixed(2)}${fit.shrunk ? ` (shrunk from ${P.scale} to fit)` : ''} · base ${P.mount} · voxel ${res} mm`);
  console.log(`filament   ${fil.name}`);
  console.log(`size       ${f1(rep.size[0])} × ${f1(rep.size[1])} × ${f1(rep.size[2])} mm`);
  console.log(`mesh       ${rep.triangles.toLocaleString()} triangles, ${rep.vertices.toLocaleString()} vertices (${dt}s)`);
  console.log(`check      open edges ${rep.openEdges}, non-manifold edges ${rep.nonManifoldEdges}, shells ${rep.shells}, genus ${rep.genus}`);
  console.log(`volume     ${f1(rep.volume / 1000)} cm³  ≈ ${f1(rep.volume / 1000 * 1.24)} g PLA solid`);
  const fits = fit.fits;
  console.log(`printer    ${fits ? 'fits' : 'DOES NOT FIT'} ${P.bedX}×${P.bedY}×${P.bedZ} mm${fit.angle ? `, turned ${fit.angle}° on the plate` : ''}`);
  console.log(`watertight ${rep.watertight ? 'YES' : 'NO'}`);

  const written = [];
  if (side === 'both' || side === 'right') { const f = path.join(outDir, `${base}-right.stl`); fs.writeFileSync(f, Buffer.from(Core.toSTL(mesh, { name: base + ' right', rotZ: fit.angle }))); written.push(f); }
  if (side === 'both' || side === 'left') { const f = path.join(outDir, `${base}-left.stl`); fs.writeFileSync(f, Buffer.from(Core.toSTL(mesh, { mirror: true, name: base + ' left', rotZ: -fit.angle }))); written.push(f); }
  if (args.notes !== 'false') { const f = path.join(outDir, `${base}-print-notes.txt`); fs.writeFileSync(f, Core.printNotes(P, rep, fit)); written.push(f); }
  for (const f of written) console.log(`wrote      ${path.relative(process.cwd(), f) || f}`);
  return rep.watertight && rep.shells === 1 ? 0 : 1;
}

process.exitCode = main();
