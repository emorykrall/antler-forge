'use strict';
const Core = require('../src/antler-core.js');

const MOUNTS = ['tunnel', 'clip', 'flat', 'none'];
const PRESETS = Object.keys(Core.PRESETS);
const RES = 1.0;

// A preset with a given base style and overrides, the way the page and CLI build one.
function design(preset, mount, extra) {
  return Object.assign(Core.presetParams(preset, Object.assign({}, Core.DEFAULTS, { mount })), extra || {});
}

// Size of the mesh as it lands on the plate (the STL turns it by fit.angle about Z).
function plateSize(mesh, angleDeg) {
  const a = angleDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), P = mesh.positions;
  const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) {
    const v = [P[i] * c - P[i + 1] * s, P[i] * s + P[i + 1] * c, P[i + 2]];
    for (let j = 0; j < 3; j++) { if (v[j] < bb[j]) bb[j] = v[j]; if (v[j] > bb[j + 3]) bb[j + 3] = v[j]; }
  }
  return { bbox: bb, size: [bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]] };
}

// Signed volume of a binary STL, from its stored vertex order.
function stlVolume(buf) {
  const dv = new DataView(buf), n = dv.getUint32(80, true);
  let vol = 0;
  for (let f = 0, o = 84; f < n; f++, o += 50) {
    const r = (k) => dv.getFloat32(o + 12 + k * 4, true);
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(r);
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return vol;
}

module.exports = { Core, MOUNTS, PRESETS, RES, design, plateSize, stlVolume };
