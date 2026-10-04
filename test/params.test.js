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
  for (const q of [{ tineScale: 1.8, thickness: 1.6, wildness: 2, character: 0 }, { tineScale: 0.4, thickness: 0.6, wildness: 0, character: 1 }])
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

test('designs saved with the crown-only Character open with the same Form & finish', () => {
  assert.equal(Core.resolveParams({ ringCharacter: 0.8 }).character, 0.8);
});

test('missing values (null from JSON NaN, empty, booleans) fall back to the default; counts are whole', () => {
  assert.equal(Core.resolveParams({ beamLength: null }).beamLength, Core.DEFAULTS.beamLength);
  assert.equal(Core.resolveParams({ beamLength: '' }).beamLength, Core.DEFAULTS.beamLength);
  assert.equal(Core.resolveParams({ beamLength: true }).beamLength, Core.DEFAULTS.beamLength);
  assert.equal(Core.resolveParams({ tineCount: 2.5 }).tineCount, 3);
  assert.equal(Core.validateMesh({ positions: new Float32Array(0), indices: new Uint32Array(0) }).watertight, false, 'an empty mesh is not a solid');
});

// inCurlBias (species files only): above 1, the beam's inward turn gathers toward its end, so it runs out straight
// first; at 1 (the default) every species is as it was.
test('the beam turns in nearer its end as inCurlBias rises; 1 is the default', () => {
  const P = Object.assign(Core.presetParams('eightpoint'), { mount: 'tunnel', autoFit: false, wobble: 0, jitter: 0 });
  const beam = (q) => Core.buildSkeleton(Object.assign({}, P, q)).branches.find((b) => b.id === 'beam').pts;
  const out = (pts) => pts[Math.round(pts.length / 2)][0] - pts[0][0];   // how far out the beam is halfway along
  assert.ok(out(beam({ inCurlBias: 2.5 })) > out(beam({ inCurlBias: 1 })) + 3, 'straighter outward run before the turn');
  assert.equal(Core.resolveParams({}).inCurlBias, 1);
});

// beamArms (species files only): the species' own tangent arms on the beam, under any Fine-tuning. Cleaned when read
// (a list or the CLI's comma list), zero by default, and they bend the beam between its ends, which stay put.
test('a species can bend its beam with tangent arms, under the Fine-tuning', () => {
  assert.deepEqual(Core.resolveParams({}).beamArms, [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(Core.resolveParams({ beamArms: '0.5,-0.25,9,x' }).beamArms, [0.5, -0.25, Core.ARM_MAX, 0, 0, 0]);
  const P = Object.assign(Core.presetParams('eightpoint'), { mount: 'tunnel', autoFit: false });
  const beam = (q) => Core.buildSkeleton(Object.assign({}, P, q)).branches.find((b) => b.id === 'beam').pts;
  const a = beam({}), b = beam({ beamArms: [0, 0, 0, 0, 0, 0] }), m = Math.round(a.length / 2);
  assert.ok(Math.hypot(...a[0].map((v, i) => v - b[0][i])) < 1e-6 && Math.hypot(...a.at(-1).map((v, i) => v - b.at(-1)[i])) < 1e-6, 'same ends');
  assert.ok(Math.hypot(...a[m].map((v, i) => v - b[m][i])) > 5, 'bent between');
  const t = beam({ tweaks: { beam: { a1: [0, 0.3, 0] } } });
  assert.ok(Math.hypot(...t[m].map((v, i) => v - a[m][i])) > 1, 'Fine-tuning bends it further');
  assert.deepEqual(Core.resolveParams(Object.assign({}, P, { tweaks: {} })).beamArms, P.beamArms, 'Reset all leaves the species’ own bend');
});
