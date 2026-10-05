// A small print to test the skull cap's peg-and-socket fit before printing the whole set: the cap's D-shaped peg on a
// little base (prints peg-up, as on the cap) and a plug with the antler's D-shaped socket (prints socket-down, as the
// antler's base does, so the first layer squashes its mouth the same way). Same geometry as the real parts (PEG, the
// socket's gap of half the Fit clearance all round, its depth and eased mouth). A flat on the plug's side marks the D's
// flat, so you can see which way it goes on; dots on its top tell the plugs apart (one per 0.1 mm of Fit clearance).
// Usage: node tools/fit-test.js [clearance mm, or several: 0.2,0.3,0.4; default 0.5] [outDir, default dist/fit-test]
const fs = require('fs');
const path = require('path');
const Core = require('../src/antler-core.js');

const clearances = String(process.argv[2] || '0.5').split(',').map(Number);
const out = path.resolve(process.argv[3] || path.join(__dirname, '..', 'dist', 'fit-test'));
const PEG = Core.PEG;

const part = (f, bb) => ({   // a part the mesher takes as one field (as the skull cap is)
  params: Core.resolveParams({}), kind: 'skull', scale: 1, branches: [], fields: [{ f, bb }], mount: { type: 'cap' },
  texture: { groove: 0, grooves: 9, pearl: 0, knob: 0 }, fillet: 1, r0: 0,
});
// the peg on a 24 × 24 × 3 mm base with rounded corners; the peg chamfered at the top, as on the cap
const BASE = 3;
const peg = part((x, y, z) => {
  const qx = Math.abs(x) - 9, qy = Math.abs(y) - 9;
  const base = Math.max(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 3, -z, z - BASE);
  const hq = z - BASE, rq = Math.hypot(x, y);
  const p = Math.max(rq - PEG.r + Math.max(0, hq - PEG.h + 0.8), -PEG.flat - x, hq - PEG.h, -hq - 1);
  return Math.min(base, p);
}, [-14, -14, -1, 14, 14, BASE + PEG.h + 2]);
// a round plug 2.6 mm thicker than the socket all round (the antler's base wall) and 2.2 mm over its top, a flat on its
// side on the D's flat side, dots on its top; the socket up into it from the bed, its mouth eased 0.8 mm
const plugFor = (clearance) => {
  const gap = clearance / 2, so = { r: PEG.r + gap, flat: PEG.flat + gap, depth: PEG.h + 0.8 };   // as mountSpec makes it
  const R = so.r + 2.6 + 0.4, H = so.depth + 2.2, dots = Math.max(1, Math.round(clearance * 10));
  const sk = part((x, y, z) => {
    let d = Math.max(Math.hypot(x, y) - R, -z, z - H, -x - (R - 1.2));
    const hole = Math.max(Math.hypot(x, y) - so.r - Math.max(0, 0.8 - z), -so.flat - x, z - so.depth);
    d = Math.max(d, -hole);
    for (let i = 0; i < dots; i++) { const dx = (i - (dots - 1) / 2) * 2.6; d = Math.max(d, -(Math.hypot(x - dx, y, z - H) - 0.9)); }   // dimples
    return d;
  }, [-R - 2, -R - 2, -1, R + 2, R + 2, H + 2]);
  return { sk, so, gap };
};

fs.mkdirSync(out, { recursive: true });
const write = (sk, file, name) => {
  const mesh = Core.meshAntler(sk, 0.4), r = Core.validateMesh(mesh);
  if (!(r.watertight && r.shells === 1 && r.volume > 0)) throw new Error(`${name}: not one watertight solid`);
  const f = path.join(out, file);
  fs.writeFileSync(f, Buffer.from(Core.toSTL(mesh, { name })));
  console.log(`${f}  ${r.size.map((v) => v.toFixed(1)).join(' × ')} mm`);
};
write(peg, 'fit-peg.stl', 'fit test peg');   // the peg doesn't change with the clearance
for (const c of clearances) {
  const { sk, so, gap } = plugFor(c), tag = `fit-${c.toFixed(2).replace('.', '_')}`;
  write(sk, `${tag}-socket.stl`, `${tag} socket`);
  console.log(`  Fit clearance ${c} mm: socket ${(2 * so.r).toFixed(2)} mm across (peg ${2 * PEG.r} mm), ${gap.toFixed(2)} mm gap all round, ${Math.max(1, Math.round(c * 10))} dots on top.`);
}
