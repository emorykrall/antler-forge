'use strict';
// Crowns: every species × every base is ONE watertight solid, flat at Z = 0, that fits the P2S.
// The ring is sized to the head and never scales; open bases leave a real gap.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Core, PRESETS, RES, plateSize } = require('./helpers.js');

const BASES = ['closed', 'openBack', 'openFront'];
const crown = (preset, ringBase, extra) =>
  Object.assign(Core.presetParams(preset, Object.assign({}, Core.DEFAULTS, { style: 'crown', ringBase })), extra || {});

for (const preset of PRESETS) {
  for (const base of BASES) {
    test(`crown ${preset} · ${base}: one watertight solid that fits the P2S`, () => {
      const P = crown(preset, base);
      const sk = Core.buildSkeleton(P);
      const mesh = Core.meshAntler(sk, RES);
      const r = Core.validateMesh(mesh);
      assert.equal(r.openEdges, 0, 'open edges');
      assert.equal(r.nonManifoldEdges, 0, 'non-manifold edges');
      assert.equal(r.shells, 1, 'shells');
      assert.ok(r.volume > 0, 'positive volume');
      const { bbox, size } = plateSize(mesh, sk.fit.angle);
      for (const [i, bed] of [[0, P.bedX], [1, P.bedY], [2, P.bedZ]]) assert.ok(size[i] <= bed, `axis ${'XYZ'[i]} is ${size[i].toFixed(1)} mm`);
      assert.ok(bbox[2] >= 0 && bbox[2] < 0.05, `sits on the bed (min Z ${bbox[2]})`);
    });
  }
}

test('the ring is sized to the head and never scales with the antlers', () => {
  const at = (scale) => Core.buildSkeleton(crown('whitetail', 'closed', { scale, autoFit: false })).ring;
  const small = at(0.3), big = at(1.2);
  for (const k of ['inner', 'ia', 'ib', 'rs']) assert.equal(small[k], big[k], k);
  assert.deepEqual(small.head.r, big.head.r);
  const P = crown('whitetail', 'closed', { headCirc: 560, ringFit: 12 });
  assert.equal(Core.ringSpec(P).inner, 572);
});

test('comfort: nothing reaches inside the head surface, and the liner rests on it', () => {
  for (const base of ['closed', 'openBack']) {
    const sk = Core.buildSkeleton(crown('spirit', base));
    const mesh = Core.meshAntler(sk, RES), h = sk.head, p = mesh.positions;
    let deepest = 0, closest = Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const k = Math.hypot((p[i] - h.c[0]) / h.r[0], (p[i + 1] - h.c[1]) / h.r[1], (p[i + 2] - h.c[2]) / h.r[2]);
      deepest = Math.max(deepest, (1 - k) * h.r[1]); closest = Math.min(closest, Math.abs(k - 1) * h.r[1]);
    }
    assert.ok(deepest < 0.6, `${base}: ${deepest.toFixed(2)} mm inside the head`);
    assert.ok(closest < 0.5, `${base}: the liner should touch the head surface (closest ${closest.toFixed(2)} mm)`);
  }
});

test('open bases leave a gap at the back or the front', () => {
  for (const [base, centre] of [['openBack', [0, -1]], ['openFront', [0, 1]]]) {
    const sk = Core.buildSkeleton(crown('fawn', base, { ringGap: 80 }));
    const strands = sk.branches.filter((b) => b.kind === 'ring');
    // no strand point within 30° of the gap's centre
    for (const br of strands) for (const p of br.pts) {
      const ang = Math.acos((p[0] * centre[0] + p[1] * centre[1]) / Math.hypot(p[0], p[1]));
      assert.ok(ang > (30 * Math.PI) / 180, `${base}: strand at ${((ang * 180) / Math.PI).toFixed(0)}° from the gap centre`);
    }
  }
});
