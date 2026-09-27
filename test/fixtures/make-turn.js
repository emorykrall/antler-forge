'use strict';
// Fake head-turn frames from the synthetic head: for each view, the head frame's axes in image
// space, where its origin projects, the scale, and the person's outline (head plus a neck and
// shoulders) rasterised into a cropped mask, exactly as the page's capture records them.
const F = require('./make-head.js');
function body() {   // a neck and shoulders under the head, like a real outline
  const pos = [], tri = [], ring = (r, z, rx) => { const s = pos.length / 3; for (let i = 0; i < 24; i++) { const a = (2 * Math.PI * i) / 24; pos.push(Math.cos(a) * (rx || r), Math.sin(a) * r, z); } return s; };
  const levels = [[45, -70], [50, -150], [70, -175, 190], [80, -320, 200]].map(([r, z, rx]) => ring(r, z, rx));
  for (let l = 0; l + 1 < levels.length; l++) for (let i = 0; i < 24; i++) { const a = levels[l] + i, b = levels[l] + ((i + 1) % 24), c = levels[l + 1] + i, d = levels[l + 1] + ((i + 1) % 24); tri.push(a, c, b, b, c, d); }
  return { pos, tri };
}
function frames(opts) {
  const o = Object.assign({ s: 1.4, origin: [640, 360], k: 4 }, opts || {}), head = F.headMesh(), torso = body();
  const views = [];
  for (let yaw = -60; yaw <= 60; yaw += 10) views.push([yaw, 0]);
  for (const yaw of [-30, 0, 30]) views.push([yaw, 22]);
  return views.map(([yd, pd]) => {
    const y = (yd * Math.PI) / 180, p = (pd * Math.PI) / 180;
    const rot = (v) => { const a = [v[0] * Math.cos(y) + v[2] * Math.sin(y), v[1], -v[0] * Math.sin(y) + v[2] * Math.cos(y)]; return [a[0], a[1] * Math.cos(p) - a[2] * Math.sin(p), a[1] * Math.sin(p) + a[2] * Math.cos(p)]; };
    const side = rot([-1, 0, 0]), fwd = rot([0, 0, 1]), up = rot([0, 1, 0]);
    const half = 170 * o.s, x0 = o.origin[0] - half, y0 = o.origin[1] - half, w = Math.ceil((2 * half) / o.k), h = w, data = new Uint8Array(w * h);
    const cell = (P) => [(o.origin[0] + o.s * (side[0] * P[0] + fwd[0] * P[1] + up[0] * P[2]) - x0) / o.k - 0.5, (o.origin[1] + o.s * (side[1] * P[0] + fwd[1] * P[1] + up[1] * P[2]) - y0) / o.k - 0.5];
    for (const m of [head, torso]) for (let t = 0; t < m.tri.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => cell([m.pos[m.tri[t + k] * 3], m.pos[m.tri[t + k] * 3 + 1], m.pos[m.tri[t + k] * 3 + 2]]));
      const X0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), X1 = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const Y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), Y1 = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(d) < 1e-9) continue;
      for (let iy = Y0; iy <= Y1; iy++) for (let ix = X0; ix <= X1; ix++) {
        const l1 = ((b[1] - c[1]) * (ix - c[0]) + (c[0] - b[0]) * (iy - c[1])) / d, l2 = ((c[1] - a[1]) * (ix - c[0]) + (a[0] - c[0]) * (iy - c[1])) / d;
        if (l1 >= -0.01 && l2 >= -0.01 && l1 + l2 <= 1.01) data[iy * w + ix] = 1;
      }
    }
    return { yaw: yd, pitch: pd, side, fwd, up, o: o.origin.slice(), s: o.s, mask: { x0, y0, k: o.k, w, h, data } };
  });
}
function forehead() {   // skin points across the forehead, as the face tracker reports them
  const pts = [];
  for (const el of [15, 30, 45]) for (const az of [-25, 0, 25]) {
    const e = (el * Math.PI) / 180, a = (az * Math.PI) / 180, u = [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)], r = F.radius(u[0], u[1], u[2]);
    pts.push([u[0] * r, u[1] * r, u[2] * r]);
  }
  return pts;
}
module.exports = { frames, forehead };
