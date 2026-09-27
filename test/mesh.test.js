'use strict';
// Every preset × every base style meshes as ONE watertight, consistently wound solid,
// flat at Z = 0, that fits the Bambu P2S (256 mm cube) as one part with autoFit on.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Core, MOUNTS, PRESETS, RES, design, plateSize } = require('./helpers.js');

function checkSolid(P) {
  assert.equal(P.autoFit, true);
  const sk = Core.buildSkeleton(P);
  const mesh = Core.meshAntler(sk, RES);
  const r = Core.validateMesh(mesh);
  assert.equal(r.openEdges, 0, 'open edges');
  assert.equal(r.nonManifoldEdges, 0, 'non-manifold edges');
  assert.equal(r.shells, 1, 'shells');
  assert.ok(r.volume > 0, `volume ${r.volume} should be positive`);
  assert.ok(sk.fit.fits, 'skeleton fit reports it fits');
  const { bbox, size } = plateSize(mesh, sk.fit.angle);
  for (const [i, bed] of [[0, P.bedX], [1, P.bedY], [2, P.bedZ]]) {
    assert.ok(size[i] <= bed, `axis ${'XYZ'[i]} is ${size[i].toFixed(1)} mm, bed is ${bed} mm`);
  }
  assert.ok(bbox[2] >= 0 && bbox[2] < 0.05, `sits on the bed (min Z ${bbox[2]})`);
  return sk;
}

for (const preset of PRESETS) {
  for (const mount of MOUNTS) {
    test(`${preset} · ${mount}: one watertight solid that fits the P2S`, () => {
      checkSolid(design(preset, mount));
    });
  }
  // Default scales all fit already; the biggest scale forces the shrink-to-fit path.
  test(`${preset} at 1.6× scale: autoFit shrinks it onto the P2S`, () => {
    const sk = checkSolid(design(preset, 'tunnel', { scale: 1.6 }));
    if (preset !== 'fawn') assert.ok(sk.fit.shrunk, 'expected autoFit to shrink it');
  });
}

test('a part too wide for the bed is turned on the plate, and the turned part fits', () => {
  const sk = checkSolid(design('moose', 'tunnel', { scale: 1.1, bedX: 110 }));
  assert.notEqual(sk.fit.angle, 0, 'expected the part to be turned');
});

test('printed tip radius is at least 1.5 mm', () => {
  for (const preset of PRESETS) {
    const sk = Core.buildSkeleton(design(preset, 'tunnel', { scale: 0.2, tipDia: 2.5 }));
    for (const br of sk.branches) assert.ok(Math.min(...br.rad) >= 1.5, `${preset} ${br.kind} radius ${Math.min(...br.rad)}`);
  }
});

test('headband dimensions never scale', () => {
  const at = (scale) => Core.buildSkeleton(design('whitetail', 'clip', { scale, autoFit: false })).mount;
  const small = at(0.3), big = at(1.4);
  for (const k of ['tw', 'th', 'slot', 'floor', 'tunnelCZ']) assert.equal(small[k], big[k], k);
});
