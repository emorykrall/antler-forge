// A quick print to check the crown's head model against your real head before printing a crown: the head the crown is
// shaped to, from your tape measurements (headFromTape, comfort allowance included, as ringSpec makes it), as three
// thin flat pieces. The ring is the crown's inside at the tape line: slip it on where the tape went, its tab at the
// front. The two arches are the head over the top, front to back and ear to ear, from tape line to tape line: lay each
// over your head with the ring on; it should touch the top and reach the ring at both ends. Raised numbers on each tab
// give the measurement (inches) it was drawn from. Two STLs, each one plate: the ring, and the two arches.
// The arches' numbers are the model's arcs over the top, so with the circumference alone (typical proportions, the page's
// over-the-top box unticked) they say what those two measurements would have to be.
// Usage: node tools/head-gauge.js [design.json | circumference[,frontToBack,earToEar] (mm, or with an "in" suffix)]
//          [--fit comfort allowance mm] [--band width,thickness mm, default 4,3] [outDir, default dist/head-gauge]
// e.g.   node tools/head-gauge.js 22in,10.5in,10in      node tools/head-gauge.js 22in
const fs = require('fs');
const path = require('path');
const Core = require('../src/antler-core.js');

const argv = process.argv.slice(2), fitAt = argv.indexOf('--fit');
const fit = fitAt >= 0 ? Number(argv.splice(fitAt, 2)[1]) : null;
const bandAt = argv.indexOf('--band'), [W, T] = bandAt >= 0 ? argv.splice(bandAt, 2)[1].split(',').map(Number) : [4, 3];   // band width and thickness
const [src, outArg] = argv;
const mm = (s) => (/in$/i.test(s) ? parseFloat(s) * 25.4 : parseFloat(s));
let given = {};
if (src && /\.json$/i.test(src)) { const raw = JSON.parse(fs.readFileSync(src, 'utf8')); given = raw.params || raw; }
else if (src) { const [c, fb, ee] = src.split(',').map(mm); given = fb ? { headCirc: c, headArcFB: fb, headArcEE: ee, headMeasured: true } : { headCirc: c, headMeasured: false }; }
const P = Core.resolveParams(Object.assign({ headMeasured: true }, given, { style: 'crown', headSource: 'tape', ringTilt: 0 }, fit != null ? { ringFit: fit } : {}));
const out = path.resolve(outArg || path.join(__dirname, '..', 'dist', 'head-gauge'));

const g = Core.ringSpec(P), r = g.head.r, seat = g.C[2];   // the head (allowance included) and the tape line's height
const TAB = [16, 8];   // the label tab
const inch = (v) => String(Math.round((v / 25.4) * 10) / 10);
const d = P.ringFit / (2 * Math.PI), arcFB = Core.capArc(r[1] - d, r[2] - d), arcEE = Core.capArc(r[0] - d, r[2] - d);   // the model's arcs, allowance off

const part = (f, bb) => ({   // a part the mesher takes as one field (as the skull cap is)
  params: P, kind: 'skull', scale: 1, branches: [], fields: [{ f, bb }], mount: { type: 'cap' },
  texture: { groove: 0, grooves: 9, pearl: 0, knob: 0 }, fillet: 1, r0: 0,
});
// Raised numbers, seven-segment style (as in tools/fit-test.js): the distance in the XY plane to the strokes of str
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
  return segDist(strokes);
}
function segDist(segs) {   // distance in the XY plane to a list of segments
  return (px, py) => {
    let m = Infinity;
    for (const [a, b] of segs) { const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1, t = Math.max(0, Math.min(1, ((px - a[0]) * ex + (py - a[1]) * ey) / l2)); m = Math.min(m, Math.hypot(a[0] + t * ex - px, a[1] + t * ey - py)); }
    return m;
  };
}
// A band W wide whose inside edge is the curve (x(t), y(t)), t0…t1 (a half-ellipse's angle), its centre W/2 out from it
function band(A, B, t0, t1, closed) {
  const n = 240, pts = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n, x = A * Math.cos(t), y = B * Math.sin(t), nx = B * Math.cos(t), ny = A * Math.sin(t), l = Math.hypot(nx, ny);
    pts.push([x + (nx / l) * W / 2, y + (ny / l) * W / 2]);
  }
  const segs = pts.slice(1).map((p, i) => [pts[i], p]);
  if (closed) segs.push([pts[n], pts[0]]);
  const d = segDist(segs);
  return (x, y) => d(x, y) - W / 2;
}
const tab = (cx, cy) => (x, y) => { const qx = Math.abs(x - cx) - TAB[0] / 2 + 1.5, qy = Math.abs(y - cy) - TAB[1] / 2 + 1.5; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 1.5; };
// a flat piece T thick from a 2D shape, with raised numbers on its tab
const piece = (shape, label, bb) => part((x, y, z) => {
  const d = Math.max(shape(x, y), -z, z - T);
  return Math.min(d, Math.max(label(x, y) - 0.45, z - T - 0.6, T - 0.3 - z));
}, bb);

// The ring: the crown's inside at the tape line (half-width ib across, ia front to back, here along Y); the tab at the front
const ringBand = band(g.ib, g.ia, 0, 2 * Math.PI, true), ringTab = tab(0, g.ia + W + TAB[1] / 2 - 1);
const ring = piece((x, y) => Math.min(ringBand(x, y), ringTab(x, y)), textDist(inch(P.headCirc), 0, g.ia + W + TAB[1] / 2 - 1, 4.4),
  [-g.ib - W - 2, -g.ia - W - 2, -1, g.ib + W + 2, g.ia + W + TAB[1] + 2, T + 2]);

// An arch: the head's section over the top (half-axis A across, B up from its centre), from the tape line up; its ends
// cut flat at the tape line, its tab on top. Drawn with the tape line at y = 0.
const arch = (A, label) => {
  const a0 = Math.asin(seat / r[2]), b = band(A, r[2], a0, Math.PI - a0, false), top = r[2] - seat, ty = top + W + TAB[1] / 2 - 1;
  const ax = A * Math.cos(a0), t = tab(0, ty);
  return { top: ty + TAB[1] / 2, w: ax + W, sk: piece((x, y) => Math.min(Math.max(b(x, y + seat), -y), t(x, y)), textDist(label, 0, ty, 4.4),
    [-ax - W - 2, -2, -1, ax + W + 2, ty + TAB[1] / 2 + 2, T + 2]) };
};
const fb = arch(r[1], inch(arcFB)), ee = arch(r[0], inch(arcEE));

fs.mkdirSync(out, { recursive: true });
const write = (name, parts) => {
  const pos = [], idx = [];
  let vol = 0;
  for (const [sk, dx, dy, flip, what] of parts) {
    const mesh = Core.meshAntler(sk, 0.4), v = Core.validateMesh(mesh);
    if (!(v.watertight && v.shells === 1 && v.volume > 0)) throw new Error(`${what}: not one watertight solid`);
    vol += v.volume;
    const base = pos.length / 3, p = mesh.positions;
    for (let i = 0; i < p.length; i += 3) pos.push((flip ? -1 : 1) * p[i] + dx, (flip ? -1 : 1) * p[i + 1] + dy, p[i + 2]);   // flip: turned half round
    for (const i of mesh.indices) idx.push(i + base);
  }
  const f = path.join(out, name);
  fs.writeFileSync(f, Buffer.from(Core.toSTL({ positions: new Float32Array(pos), indices: new Uint32Array(idx) }, { name: 'antler forge head gauge' })));
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let j = 0; j < 2; j++) { lo[j] = Math.min(lo[j], pos[i + j]); hi[j] = Math.max(hi[j], pos[i + j]); }
  console.log(`${f}  ${(hi[0] - lo[0]).toFixed(0)} × ${(hi[1] - lo[1]).toFixed(0)} mm on the bed, ${(vol / 1000).toFixed(1)} cm³ (about ${Math.round((vol / 1000) * 1.24)} g PLA)`);
};
const ins = (v) => `${inch(v)} in (${v.toFixed(0)} mm)`;
console.log(`Head from the tape: ${ins(P.headCirc)} round, ${ins(arcFB)} front to back, ${ins(arcEE)} ear to ear${P.headMeasured ? '' : ' (typical proportions)'}, +${P.ringFit} mm comfort`);
console.log(`  modelled ${(2 * (g.ib - d)).toFixed(0)} mm wide × ${(2 * (g.ia - d)).toFixed(0)} mm long at the tape line (width ${(100 * g.ib / g.ia).toFixed(0)}% of length), top ${(r[2] - seat).toFixed(0)} mm above it`);
write('head-gauge-ring.stl', [[ring, 0, 0, false, 'ring']]);
write('head-gauge-arches.stl', [[fb.sk, 0, -fb.top - 3, false, 'front-to-back arch'], [ee.sk, 0, ee.top + 3, true, 'ear-to-ear arch']]);
