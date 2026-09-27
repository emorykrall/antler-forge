'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Core, RES, design, stlVolume } = require('./helpers.js');

test('right and mirrored left STLs both have positive volume', () => {
  const sk = Core.buildSkeleton(design('elk', 'tunnel'));
  const mesh = Core.meshAntler(sk, RES);
  const right = stlVolume(Core.toSTL(mesh, { rotZ: sk.fit.angle }));
  const left = stlVolume(Core.toSTL(mesh, { mirror: true, rotZ: -sk.fit.angle }));
  assert.ok(right > 0, `right volume ${right}`);
  assert.ok(left > 0, `left volume ${left}`);
  assert.ok(Math.abs(left - right) / right < 1e-3, 'mirror keeps the volume');
});
