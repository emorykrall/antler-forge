'use strict';
// The skull cap (base style 'skull'): three parts, glued. The cap is one watertight solid, flat on the bed, that
// fits the P2S; its pegs and the antlers' sockets never scale and always fit each other; and each antler stands
// on its pedicle exactly as it was built (same axes), so the D-shaped joint only goes together one way.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Core, design, plateSize } = require('./helpers.js');

const SPECIES = ['trial', 'lyre', 'spikes', 'feral', 'whitetail', 'moose'];
const cap = (preset, extra) => Core.buildSkullCap(design(preset, 'skull', extra));

for (const preset of SPECIES) {
  test(`${preset} skull cap: one watertight solid, flat on the bed, that fits the P2S`, () => {
    const sk = cap(preset), mesh = Core.meshAntler(sk, 1.0), r = Core.validateMesh(mesh);
    assert.equal(r.openEdges, 0, 'open edges');
    assert.equal(r.nonManifoldEdges, 0, 'non-manifold edges');
    assert.equal(r.shells, 1, 'shells');
    assert.ok(r.volume > 0, 'positive volume');
    assert.ok(sk.fit.fits, 'fits');
    const { bbox, size } = plateSize(mesh, sk.fit.angle);
    for (let i = 0; i < 3; i++) assert.ok(size[i] <= 256 - 12, `axis ${'XYZ'[i]} ${size[i].toFixed(0)} mm`);
    assert.ok(bbox[2] >= 0 && bbox[2] < 0.05, `sits on the bed (min Z ${bbox[2]})`);
    assert.ok(r.volume < 80000, `a light cap (${(r.volume / 1000).toFixed(0)} cm³)`);
  });
}

test('the skull cap holds up across its shapes and the ends of its settings', () => {
  const cases = [{ capShape: 'plate' }, { capShape: 'plate', capLength: 85, capWidth: 24 }, { capShape: 'nasal', capLength: 85 },
    { capLength: 30, capBack: 20, capWidth: -6, capSpacing: 60, capPedicle: 4 },
    { capLength: 85, capBack: 60, capWidth: 24, capSpacing: 110, capPedicle: 24, capTie: false }];
  for (const q of cases) {
    const sk = cap('buck', q), r = Core.validateMesh(Core.meshAntler(sk, 1.2));
    assert.ok(r.watertight && r.shells === 1 && r.volume > 0 && sk.fit.fits, JSON.stringify(q));
  }
});

test('the upper skull, to the nose (the Yellowjackets default), is a light cap too, its pedicles capSpacing apart', () => {
  const sk = cap('trial', { capShape: 'nasal' }), r = Core.validateMesh(Core.meshAntler(sk, 1.0));
  assert.ok(r.watertight && r.shells === 1 && sk.fit.fits);
  assert.ok(r.volume < 95000, `a light cap (${(r.volume / 1000).toFixed(0)} cm³)`);
  const g = sk.spec, span = 2 * Math.hypot(g.B0[0], g.B0[2]) * Math.sin(Math.atan2(g.B0[0], g.B0[2]));
  assert.ok(Math.abs(span - g.P.capSpacing) < 6, `pedicles ${span.toFixed(0)} mm apart`);
});

test('designs saved with the retired cap shapes open as a skull plate', () => {
  assert.equal(Core.resolveParams({ capShape: 'shield' }).capShape, 'plate');
  assert.equal(Core.resolveParams({ capShape: 'round' }).capShape, 'plate');
});

test('pegs and sockets never scale, and the socket clears the peg by half the Fit clearance', () => {
  for (const scale of [0.3, 0.7, 1.4]) {
    const sk = Core.buildSkeleton(design('trial', 'skull', { scale, autoFit: false })), so = sk.mount.socket;
    assert.equal(so.r, Core.PEG.r + 0.2); assert.equal(so.flat, Core.PEG.flat + 0.2);
    assert.ok(so.depth > Core.PEG.h, 'the socket is deeper than the peg');
    assert.ok(sk.mount.h > so.depth && sk.mount.rf >= so.r + 2.5, `the base walls the socket in (base ${sk.mount.rf.toFixed(1)} mm)`);
  }
});

test('each antler stands on its pedicle with the axes it was built with, and its socket takes the peg', () => {
  for (const extra of [{}, { splay: 12, rake: -8 }]) {
    const P = design('trial', 'skull', extra), g = Core.skullSpec(P), ant = Core.buildSkeleton(P), so = ant.mount.socket;
    const { dot, sub, add, mul } = Core._util;
    // points throughout the peg (band frame), carried into the antler's print frame, must lie inside its socket
    for (let h = 0.2; h < Core.PEG.h - 0.9; h += 1.4) for (let a = 0; a < 6.28; a += 0.4) for (const rr of [0, 2.5, 4.9]) {
      let x = rr * Math.cos(a), y = rr * Math.sin(a); if (x < -Core.PEG.flat) x = -Core.PEG.flat;
      const p = add(add(add(g.Q, mul(g.F.X, x)), mul(g.F.Y, y)), mul(g.F.Z, h)), q = sub(p, g.Q);
      const lx = dot(q, g.F.X), ly = dot(q, g.F.Y), lz = dot(q, g.F.Z);
      assert.ok(Math.hypot(lx, ly) < so.r && lx > -so.flat && lz < so.depth, `peg point (${lx.toFixed(1)}, ${ly.toFixed(1)}, ${lz.toFixed(1)}) outside the socket`);
    }
    // the antler's own up is the pedicle's axis
    assert.ok(Math.abs(Math.hypot(...g.F.Z) - 1) < 1e-9);
  }
});

test('the headband groove under the cap matches the band and never scales', () => {
  const at = (scale) => Core.skullSpec(design('trial', 'skull', { scale })).band;
  assert.deepEqual(at(0.3), at(1.4));
});

test('parts share plates only when they fit together; each part still fits on its own', () => {
  const P = Core.resolveParams({});
  const one = Core.platesFor(P, [{ name: 'right antler', w: 90, d: 120 }, { name: 'left antler', w: 90, d: 120 }, { name: 'skull cap', w: 117, d: 97 }]);
  assert.equal(one.length, 1, 'small parts print together');
  assert.equal(Core.platesText(one), '', 'and say nothing about it');
  const three = Core.platesFor(P, [{ name: 'right antler', w: 200, d: 180 }, { name: 'left antler', w: 200, d: 180 }, { name: 'skull cap', w: 117, d: 97 }]);
  assert.equal(three.length, 3, 'two big antlers and the cap: one plate each');
  const two = Core.platesFor(P, [{ name: 'right antler', w: 110, d: 180 }, { name: 'left antler', w: 110, d: 180 }, { name: 'skull cap', w: 117, d: 97 }]);
  assert.equal(two.length, 2, 'the antlers side by side, the cap on its own');
  const W = P.bedX - 12, D = P.bedY - 12;
  for (const pl of [...one, ...two, ...three]) for (const p of pl.parts) assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= W && p.y + p.d <= D, `${p.name} on the plate`);
  assert.match(Core.platesText(two), /^2 separate prints.*Print 1: right antler and left antler\. Print 2: skull cap\.$/);
});
