'use strict';
// PARAM_SPEC drives both the page controls and the CLI flags; its groups only arrange the page.
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/antler-core.js');

test('every setting appears exactly once in PARAM_SPEC, in a known tier', () => {
  const keys = Core.PARAM_SPEC.flatMap((g) => g.items.map((it) => it.k));
  assert.equal(new Set(keys).size, keys.length, 'duplicate key');
  assert.deepEqual([...keys].sort(), Object.keys(Core.DEFAULTS).filter((k) => k !== 'preset').sort());
  for (const g of Core.PARAM_SPEC) assert.ok(['essentials', 'details', 'advanced', 'hidden'].includes(g.tier), g.group);
});

// Combined controls: ×1 is the species' own design; at their ends every species still builds one solid.
test('the combined controls scale what they stand for, and hold up at their ends', () => {
  const P = Core.presetParams('stag'), sk = (q) => Core.buildSkeleton(Object.assign({}, P, q));
  const beamR = (s) => s.branches.find((b) => b.kind === 'beam').rad[0];
  assert.ok(Math.abs(beamR(sk({ thickness: 1.5 })) / beamR(sk({})) - 1.5) < 0.02, 'Thickness scales the beam');
  const tine = (s) => s.branches.filter((b) => b.kind === 'tine').reduce((m, b) => Math.max(m, b.length), 0);
  assert.ok(tine(sk({ tineScale: 1.4 })) > tine(sk({})) * 1.2, 'Tine length lengthens the tines');
  for (const q of [{ tineScale: 1.8, thickness: 1.6, wildness: 2, texture: 2 }, { tineScale: 0.4, thickness: 0.6, wildness: 0, texture: 0 }])
    for (const name of ['elk', 'moose', 'spirit']) {
      const r = Core.validateMesh(Core.meshAntler(Core.buildSkeleton(Object.assign(Core.presetParams(name), q, { resolution: 1.5 })), 1.5));
      assert.ok(r.watertight && r.shells === 1 && r.volume > 0, `${name} ${JSON.stringify(q)}`);
    }
});

test('designs saved with a retired crown design open with the nearest one', () => {
  assert.equal(Core.resolveParams({ ringPattern: 'tiara' }).ringPattern, 'fleur');
  assert.equal(Core.resolveParams({ ringPattern: 'laurel' }).ringPattern, 'circlet');
  assert.equal(Core.resolveParams({ ringPattern: 'nonsense' }).ringPattern, Core.DEFAULTS.ringPattern);
});
