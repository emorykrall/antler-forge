'use strict';
// Realistic synthetic heads from the bundled FLAME model: random identity shapes, placed in the page's
// head frame (origin 28 mm behind and 22 mm above the midpoint of the face-side points, which match
// MediaPipe's 234/454), with forehead and temple skin points picked off the surface. Pass `mesh` to
// make-turn's frames() to render a head turn of it.
const fs = require('fs');
const path = require('path');
const HeadScan = require('../../src/head-scan.js');
const M = HeadScan.flameModel(fs.readFileSync(path.join(__dirname, '../../vendor/flame/flame_head.bin.wasm')));
const MAIN = 3931;              // the head; the two eyeballs follow it
const SIDE = [730, 2212];       // face-side points at cheekbone level, like MediaPipe 234 / 454
// directions (elevation, azimuth from the front, degrees) of the skin points, as for make-turn's forehead()
const SKIN_DIRS = [[15, -25], [15, 0], [15, 25], [26, -12], [26, 12], [28, 0], [22, -45], [22, 45], [12, -60], [12, 60], [2, -68], [2, 68]];

function gaussians(seed, n) {
  let s = seed >>> 0 || 1;
  const u = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u()));
}
function flameHead(beta) {
  const p = HeadScan.flameShape(M, beta);
  const o = [0, 1, 2].map((a) => (p[3 * SIDE[0] + a] + p[3 * SIDE[1] + a]) / 2);
  o[1] -= 28; o[2] += 22;
  const pos = [];
  for (let i = 0; i < MAIN; i++) for (let a = 0; a < 3; a++) pos.push(p[3 * i + a] - o[a]);
  const tri = [];
  for (let f = 0; f < M.F; f++) { const a = M.tri[3 * f], b = M.tri[3 * f + 1], c = M.tri[3 * f + 2]; if (a < MAIN && b < MAIN && c < MAIN) tri.push(a, b, c); }
  const skin = SKIN_DIRS.map(([el, az]) => {
    const e = (el * Math.PI) / 180, z = (az * Math.PI) / 180, u = [Math.sin(z) * Math.cos(e), Math.cos(z) * Math.cos(e), Math.sin(e)];
    let best = -1, bi = 0;
    for (let i = 0; i < MAIN; i++) {
      const v = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], len = Math.hypot(v[0], v[1], v[2]), c = (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / len;
      if (c > best) { best = c; bi = i; }
    }
    return [pos[3 * bi], pos[3 * bi + 1], pos[3 * bi + 2]];
  });
  return { mesh: { pos, tri }, skin };
}
module.exports = { M, MAIN, flameHead, gaussians };
