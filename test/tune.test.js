'use strict';
// Fine-tune: per-branch adjustments (turn about the branch's base, length, thickness, where it leaves its parent)
// saved in the design as `tweaks`, keyed by branch id. They change only their branch, survive a design file, are
// cleaned when read, are cleared by a species change, and every adjusted antler still prints as one solid.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Core, design } = require('./helpers.js');
const { sub, dot, norm } = Core._util;

const tip = (sk, id) => { const b = sk.branches.find((x) => x.id === id); return b.pts[b.pts.length - 1]; };

test('every branch has a unique id and knows its parent', () => {
  for (const name of Object.keys(Core.PRESETS)) {
    const sk = Core.buildSkeleton(Core.presetParams(name)), ids = sk.branches.map((b) => b.id);
    assert.equal(new Set(ids).size, ids.length, `${name}: ${ids.join(' ')}`);
    for (const b of sk.branches) if (b.id !== 'beam') assert.ok(ids.includes(b.parent), `${name}: ${b.id} has parent ${b.parent}`);
  }
});

test('an adjustment changes its own branch: turned, stretched, thickened, moved along the beam', () => {
  const P = design('buck', 'tunnel', { autoFit: false }), base = Core.buildSkeleton(P);
  const b0 = base.branches.find((b) => b.id === 't1');
  const sk = Core.buildSkeleton(Object.assign({}, P, { tweaks: { t1: { rot: [0.5, 0, 0], len: 1.5, thick: 1.4 } } }));
  const b1 = sk.branches.find((b) => b.id === 't1');
  assert.ok(Math.abs(b1.length / b0.length - 1.5) < 0.02, 'stretched');
  assert.ok(b1.rad[0] > b0.rad[0] * 1.2, 'thicker');
  const d0 = norm(sub(tip(base, 't1'), b0.pts[0])), d1 = norm(sub(tip(sk, 't1'), b1.pts[0]));
  assert.ok(dot(d0, d1) < Math.cos(0.3), 'turned');
  assert.deepEqual(tip(sk, 't2'), tip(base, 't2'), 'the other tines stay put');
  const moved = Core.buildSkeleton(Object.assign({}, P, { tweaks: { brow: { s: 0.25 } } }));
  assert.ok(moved.branches.find((b) => b.id === 'brow').s0 === 0.25, 'the brow tine leaves the beam where it was put');
});

test('adjustments survive a design file, junk is dropped, and a species change clears them', () => {
  const tweaks = { t0: { rot: [0.1, -0.2, 0.3], len: 1.2, thick: 0.9, s: 0.4 } };
  const P = Core.resolveParams(JSON.parse(JSON.stringify(Object.assign(design('buck', 'tunnel'), { tweaks }))));
  assert.deepEqual(P.tweaks, tweaks);
  const junk = Core.resolveParams({ tweaks: { 'nope': { len: 2 }, t0: { len: 99, rot: [9, 0] }, t1: 'x', t2: { len: 1 } } }).tweaks;
  assert.deepEqual(junk, { t0: { rot: [0, 0, 0], len: 2.5, thick: 1, s: null } });
  assert.deepEqual(Core.presetParams('trial', P).tweaks, {});
});

test('heavily adjusted antlers still print as one watertight solid, on every base style', () => {
  const tweaks = { beam: { rot: [0.3, -0.2, 0.25], len: 1.4, thick: 1.3 }, brow: { rot: [-0.8, 0.3, 0], len: 2, s: 0.3 }, t0: { rot: [1.2, 0, 0], len: 0.5, thick: 2 }, t1: { rot: [0, 1.5, 0], len: 2.2, thick: 0.5 }, 'beam/1': { len: 1.8, rot: [0, 0, 1] } };
  for (const [name, mount] of [['buck', 'tunnel'], ['mulebuck', 'skull'], ['spirit', 'clip'], ['moose', 'none']]) {
    const sk = Core.buildSkeleton(design(name, mount, { tweaks })), r = Core.validateMesh(Core.meshAntler(sk, 1.2));
    assert.ok(r.watertight && r.shells === 1 && r.volume > 0 && sk.fit.fits, `${name} · ${mount}: ${r.shells} shells`);
    assert.ok(sk.branches.every((b) => Math.min(...b.rad) >= 1.5), `${name}: tips at least 1.5 mm`);
  }
});
