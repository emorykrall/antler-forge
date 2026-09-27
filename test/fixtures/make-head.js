'use strict';
// A synthetic head for tests: an ellipsoid cranium (half-width 78, half-length 98, height 100 mm
// above its widest point) with a nose, two ears and an open neck. Exports it the way different
// scanning apps would: in different units, with different axes up, facing different ways.
const RX = 78, RY = 98, RZ = 100;
function headMesh() {
  const pos = [], tri = [], nu = 120, nv = 70;
  const radius = (x, y, z) => {   // star-shaped surface from the origin (the cranium's centre)
    const e = 1 / Math.hypot(x / RX, y / RY, z / (z > 0 ? RZ : 115));
    const bump = (cx, cy, cz, w, h) => h * Math.exp(-(((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) / (w * w)));
    return e * (1 + bump(0, 1, -0.45, 0.28, 0.2) + bump(1, 0, -0.25, 0.2, 0.12) + bump(-1, 0, -0.25, 0.2, 0.12));   // nose, ears
  };
  for (let j = 0; j <= nv; j++) {
    const ph = (Math.PI * 0.8 * j) / nv;   // stop short of the bottom: an open neck
    for (let i = 0; i < nu; i++) {
      const th = (2 * Math.PI * i) / nu, u = [Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)];
      const r = radius(u[0], u[1], u[2]);
      pos.push(u[0] * r, u[1] * r, u[2] * r);
    }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * nu + i, b = j * nu + ((i + 1) % nu), c = (j + 1) * nu + i, d = (j + 1) * nu + ((i + 1) % nu);
    tri.push(a, c, b, b, c, d);
  }
  return { pos, tri };
}
// file-space variants: [format, units scale (file units per mm), axis mapping from head frame]
function toFile(m, variant) {
  const { scale, map } = variant, out = [];
  for (let i = 0; i < m.pos.length; i += 3) { const v = map(m.pos[i], m.pos[i + 1], m.pos[i + 2]); out.push(v[0] * scale, v[1] * scale, v[2] * scale); }
  return { pos: out, tri: m.tri };
}
function obj(m) { return m.pos.reduce((s, _, i) => (i % 3 ? s : s + `v ${m.pos[i]} ${m.pos[i + 1]} ${m.pos[i + 2]}\n`), '') + m.tri.reduce((s, _, i) => (i % 3 ? s : s + `f ${m.tri[i] + 1} ${m.tri[i + 1] + 1} ${m.tri[i + 2] + 1}\n`), ''); }
function stl(m) {
  const n = m.tri.length / 3, b = Buffer.alloc(84 + n * 50); b.writeUInt32LE(n, 80);
  for (let f = 0; f < n; f++) for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) b.writeFloatLE(m.pos[m.tri[f * 3 + k] * 3 + a], 84 + f * 50 + 12 + k * 12 + a * 4);
  return b;
}
function ply(m) {
  return `ply\nformat ascii 1.0\nelement vertex ${m.pos.length / 3}\nproperty float x\nproperty float y\nproperty float z\nelement face ${m.tri.length / 3}\nproperty list uchar int vertex_indices\nend_header\n`
    + m.pos.reduce((s, _, i) => (i % 3 ? s : s + `${m.pos[i]} ${m.pos[i + 1]} ${m.pos[i + 2]}\n`), '') + m.tri.reduce((s, _, i) => (i % 3 ? s : s + `3 ${m.tri[i]} ${m.tri[i + 1]} ${m.tri[i + 2]}\n`), '');
}
module.exports = { RX, RY, RZ, headMesh, toFile, obj, stl, ply };
