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

test('crown shape settings at their extremes still give one watertight solid', () => {
  const extremes = [
    { ringAsym: 1, ringWander: 1 },
    { ringRise: 30, ringDrop: 30, ringDip: 35, ringSweepLift: 45, ringSweepReach: 100, ringLoopDepth: 30, ringTineLean: 1.5 },
    { ringRise: 0, ringDrop: 0, ringDip: 0, ringSweepLift: 0, ringSweepReach: 15, ringLoopDepth: 4, ringTaper: 0, ringWander: 0, ringTineLean: 0 },
  ];
  for (const ex of extremes) for (const base of ['closed', 'openBack']) {
    const r = Core.validateMesh(Core.meshAntler(Core.buildSkeleton(crown('whitetail', base, ex)), 1.5));
    assert.ok(r.watertight && r.shells === 1 && r.volume > 0, `${base} ${JSON.stringify(ex)}`);
  }
});

test('asymmetry 0 mirrors the band exactly; higher values let the sides differ', () => {
  const sides = (asym) => {
    const sk = Core.buildSkeleton(crown('spirit', 'closed', { ringAsym: asym }));
    const ring = sk.branches.filter((b) => b.kind === 'ring' || b.kind === 'tine').filter((b) => b.pts.length);
    const right = ring.filter((b) => b.pts[Math.floor(b.pts.length / 2)][0] > 0), left = ring.filter((b) => b.pts[Math.floor(b.pts.length / 2)][0] < 0);
    let worst = 0;
    for (const br of right) {   // each right-hand beam's closest mirror twin on the left
      let best = Infinity;
      for (const l of left) {
        if (l.pts.length !== br.pts.length) continue;
        best = Math.min(best, Math.max(...br.pts.map((p, i) => Math.hypot(p[0] + l.pts[i][0], p[1] - l.pts[i][1], p[2] - l.pts[i][2]))));
      }
      worst = Math.max(worst, best);
    }
    return worst;
  };
  assert.ok(sides(0) < 1e-9, 'mirrored');
  assert.ok(sides(1) > 1, 'asymmetric');
});

test('tape measurements: the head shape is recovered exactly, and measured crowns are sound', () => {
  const s = 0.38, cs = Math.sqrt(1 - s * s), per = (a, b) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  for (const [L, W, H] of [[195, 152, 90], [205, 140, 100], [185, 165, 80]]) {
    const ia = L / 2, ib = W / 2, Rz = H / (1 - s);
    const h = Core.headFromTape(per(ia, ib), Core.capArc(ia / cs, Rz), Core.capArc(ib / cs, Rz));
    assert.ok(Math.abs(2 * h.ia - L) < 0.5 && Math.abs(2 * h.ib - W) < 0.5 && Math.abs(h.dome - H) < 0.5, `${L}x${W} dome ${H}`);
  }
  for (const [fb, ee] of [[250, 230], [320, 290]]) {   // a flatter, narrower head and a taller, rounder one
    const P = crown('whitetail', 'openBack', { headMeasured: true, headArcFB: fb, headArcEE: ee });
    const sk = Core.buildSkeleton(P), r = Core.validateMesh(Core.meshAntler(sk, 1.5));
    assert.ok(r.watertight && r.shells === 1 && sk.fit.fits, `arcs ${fb}/${ee}`);
  }
});

test('every crown pattern, horror, natural or elven, is one sturdy watertight solid that fits', () => {
  for (const ringPattern of ['band', 'lattice', 'loops', 'weave', 'tiara', 'laurel', 'briar', 'sunburst', 'circlet', 'spines', 'lyre', 'fleur', 'whiplash', 'kokoshnik']) for (const ringCharacter of [0, 0.5, 1]) for (const ringBase of ['closed', 'openBack']) {
    const P = Object.assign(Core.presetParams('stag', Object.assign({}, Core.DEFAULTS, { style: 'crown' })), { ringPattern, ringCharacter, ringBase });
    const sk = Core.buildSkeleton(P), r = Core.validateMesh(Core.meshAntler(sk, 1.6));
    const tag = `${ringPattern} ${ringCharacter} ${ringBase}`;
    assert.ok(r.watertight && r.shells === 1 && r.volume > 0, `${tag}: one watertight solid`);
    assert.ok(sk.fit.fits, `${tag}: fits the P2S`);
    for (const br of sk.branches) {   // printed and worn: no thin strands, no spindly tines
      if (br.kind === 'ring') br.rad.forEach((rr, i) => { if (br.ss[i] < 0.8 || br.ss[i] === 0.2) assert.ok(rr >= 3 - 1e-9, `${tag}: strand radius ${rr.toFixed(2)} mm`); });
      if (br.kind === 'tine' && br.sculpt != null) assert.ok(br.rad[0] >= 3 - 1e-9, `${tag}: tine base ${br.rad[0].toFixed(2)} mm`);   // band tines and brow pieces
    }
  }
});
