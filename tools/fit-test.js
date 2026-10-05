// A small print to test the skull cap's peg-and-socket fit before printing the whole set: the cap's D-shaped peg on a
// little base (prints peg-up, as on the cap) and a plug with the antler's D-shaped socket (prints socket-down, as the
// antler's base does, so the first layer squashes its mouth the same way). Same geometry as the real parts (PEG, the
// socket's gap of half the Fit clearance all round, its depth and eased mouth). A flat on the plug's side marks the D's
// flat, so you can see which way it goes on. Raised numbers say what each is: the Fit clearance on each plug's top, the
// peg's width (mm) on its base. All in one STL, side by side (Bambu Studio: Split to objects, if you want them apart).
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
// Raised numbers, seven-segment style: the distance (in the XY plane) to the strokes of str, centred at (cx, cy), h tall
const SEG = { a: [[0, 1], [1, 1]], b: [[1, 1], [1, 0.5]], c: [[1, 0.5], [1, 0]], d: [[0, 0], [1, 0]], e: [[0, 0], [0, 0.5]], f: [[0, 0.5], [0, 1]], g: [[0, 0.5], [1, 0.5]] };
const DIGIT = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function textDist(str, cx, cy, h) {
  const w = 0.55 * h, gap = 0.35 * h, strokes = [];
  const widths = [...str].map((ch) => (ch === '.' ? 0.25 * h : w));
  let x = cx - (widths.reduce((a, b) => a + b, 0) + gap * (str.length - 1)) / 2;
  [...str].forEach((ch, i) => {
    if (ch === '.') strokes.push([[x + 0.12 * h, cy - h / 2], [x + 0.12 * h, cy - h / 2 + 0.01]]);
    else for (const sg of DIGIT[ch] || '') { const [p, q] = SEG[sg]; strokes.push([[x + p[0] * w, cy - h / 2 + p[1] * h], [x + q[0] * w, cy - h / 2 + q[1] * h]]); }
    x += widths[i] + gap;
  });
  return (px, py) => {
    let m = Infinity;
    for (const [a, b] of strokes) { const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1, t = Math.max(0, Math.min(1, ((px - a[0]) * ex + (py - a[1]) * ey) / l2)); m = Math.min(m, Math.hypot(a[0] + t * ex - px, a[1] + t * ey - py)); }
    return m;
  };
}
const raised = (dist, top, stroke = 0.9) => (x, y, z) => Math.max(dist(x, y) - stroke / 2, z - top - 0.6, top - 0.3 - z);

// the peg on a 24 × 24 × 3 mm base with rounded corners; the peg chamfered at the top, as on the cap; its width on the base
const BASE = 3, pegLabel = raised(textDist(String(2 * PEG.r), 0, -8.6, 4.2), BASE);
const peg = part((x, y, z) => {
  const qx = Math.abs(x) - 9, qy = Math.abs(y) - 9;
  const base = Math.max(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 3, -z, z - BASE);
  const hq = z - BASE, rq = Math.hypot(x, y);
  const p = Math.max(rq - PEG.r + Math.max(0, hq - PEG.h + 0.8), -PEG.flat - x, hq - PEG.h, -hq - 1);
  return Math.min(base, p, pegLabel(x, y, z));
}, [-14, -14, -1, 14, 14, BASE + PEG.h + 2]);
// a round plug 2.6 mm thicker than the socket all round (the antler's base wall) and 2.2 mm over its top, a flat on its
// side on the D's flat side; the socket up into it from the bed, its mouth eased 0.8 mm
const plugFor = (clearance) => {
  const gap = clearance / 2, so = { r: PEG.r + gap, flat: PEG.flat + gap, depth: PEG.h + 0.8 };   // as mountSpec makes it
  const R = so.r + 2.6 + 0.4, H = so.depth + 2.2, label = raised(textDist(String(clearance), 0.6, 0, 5), H);
  const sk = part((x, y, z) => {
    let d = Math.max(Math.hypot(x, y) - R, -z, z - H, -x - (R - 1.2));
    const hole = Math.max(Math.hypot(x, y) - so.r - Math.max(0, 0.8 - z), -so.flat - x, z - so.depth);
    d = Math.max(d, -hole);
    return Math.min(d, label(x, y, z));   // the Fit clearance, raised on top
  }, [-R - 2, -R - 2, -1, R + 2, R + 2, H + 2]);
  return { sk, so, gap, R };
};

// one STL: the peg, then the plugs in a row beside it (each checked as a solid on its own first)
fs.mkdirSync(out, { recursive: true });
const pos = [], idx = [];
const add = (sk, dx, name) => {
  const mesh = Core.meshAntler(sk, 0.4), r = Core.validateMesh(mesh);
  if (!(r.watertight && r.shells === 1 && r.volume > 0)) throw new Error(`${name}: not one watertight solid`);
  const base = pos.length / 3;
  for (let i = 0; i < mesh.positions.length; i += 3) pos.push(mesh.positions[i] + dx, mesh.positions[i + 1], mesh.positions[i + 2]);
  for (const i of mesh.indices) idx.push(i + base);
};
add(peg, 0, 'peg');
let x = 12;
for (const c of clearances) {
  const { sk, so, gap, R } = plugFor(c);
  x += R + 4; add(sk, x, `socket ${c}`); x += R;
  console.log(`  ${c}: Fit clearance ${c} mm, socket ${(2 * so.r).toFixed(2)} mm across (peg ${2 * PEG.r} mm), ${gap.toFixed(2)} mm gap all round`);
}
const f = path.join(out, `fit-test-${clearances.join('-')}.stl`);
fs.writeFileSync(f, Buffer.from(Core.toSTL({ positions: new Float32Array(pos), indices: new Uint32Array(idx) }, { name: 'antler forge fit test' })));
console.log(`${f}  ${(x + 2).toFixed(0)} × 24 mm on the bed, ${clearances.length + 1} pieces`);
