'use strict';
// The skull cap (base style 'skull'): three parts, glued. The cap is a thin plate of bone shaped to the head: one
// watertight solid, flat on the bed, that fits the P2S; its pegs and the antlers' sockets never scale and always fit
// each other; and each antler stands on its pedicle exactly as it was built (same axes), so the D-shaped joint only
// goes together one way.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Core, design, plateSize } = require('./helpers.js');

const SPECIES = ['trial', 'lyre', 'spikes', 'feral', 'whitetail', 'eightpoint'];
const cap = (preset, extra) => Core.buildSkullCap(design(preset, 'skull', extra));
// the cap's field, in the band frame; and a point on the head the cap rests on, up mm off it
const probe = (sk) => {
  const M = sk.toBand, f = sk.fields[0].f, H = sk.spec.head;
  const toPrint = (b) => { const q = [b[0] - M[12], b[1] - M[13], b[2] - M[14]]; return [q[0] * M[0] + q[1] * M[1] + q[2] * M[2], q[0] * M[4] + q[1] * M[5] + q[2] * M[6], q[0] * M[8] + q[1] * M[9] + q[2] * M[10]]; };
  const solid = (b) => f(...toPrint(b)) < 0;
  const onHead = (x, s, up) => sk.spec.fromSkull(x, s, up);   // plate coordinates: x across, s along the head, up off it
  return { solid, onHead, H };
};

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
    assert.ok(r.volume < 70000, `a light cap (${(r.volume / 1000).toFixed(0)} cm³)`);
  });
}

test('the skull cap holds up across the ends of its settings, and Surprise me’s edges', () => {
  const cases = [{ capLength: 30, capBack: 20, capWidth: -6, capSpacing: 60, capPedicle: 4, capJag: 0 },
    { capLength: 110, capBack: 100, capWidth: 30, capSpacing: 110, capPedicle: 24, capJag: 1, capTie: false },
    { capSnoutWidth: 1.6, capTaper: 0, capJag: 1, hbWidth: 25.4 }, { capSnoutWidth: 0.6, capTaper: 1, capJag: 0.3, headCirc: 640 },
    { seed: 3 }, { seed: 4071, capJag: 0.9 }, { headCirc: 520, hbWidth: 12 }];
  for (const q of cases) {
    const sk = cap('buck', q), r = Core.validateMesh(Core.meshAntler(sk, 1.2));
    assert.ok(r.watertight && r.shells === 1 && r.volume > 0 && sk.fit.fits, JSON.stringify(q));
  }
});

test('the antlers stand capSpacing apart, on collars that rise from the plate', () => {
  const sk = cap('trial'), g = sk.spec;
  assert.ok(Math.abs(2 * g.fromSkull(g.form.X, 0, 0)[0] / g.P.capSpacing - 1) < 0.08, 'pedicles at the antler spacing');
  const up = (q) => g.Q[2] - g.B0[2];
  assert.ok(Math.abs(Core.PEG.h) > 0 && Math.hypot(...g.Q.map((v, i) => v - g.B0[i])) > g.P.capPedicle - 0.01, 'the pedicle stands capPedicle off the plate');
});

// The plate is thin and lies on the head: from the head up, a gap for hair, then about PLATE thickness of solid, then
// nothing; across its middle, front to back, the same. Thicker only over the band's channel and along the ridge.
test('the plate is thin and lies on the head, all over', () => {
  for (const headCirc of [520, 571.5, 640]) {
    const sk = cap('eightpoint', { headCirc }), g = sk.spec, { solid, onHead } = probe(sk);
    let n = 0;
    for (let s = -g.form.B + 12; s < g.form.F * 0.7; s += 6) for (let x = 0; x < g.form.wAt(s) - 10; x += 7) {
      if (Math.abs(s) < 26 || Math.hypot(x - g.form.X, s) < 30) continue;   // the band's channel and the collars
      if (g.slots.some((sl) => Math.abs(x - sl.x) < 4 && Math.abs(s - sl.s) < 10)) continue;   // and the ribbon slots
      let lo = null, hi = null;
      for (let up = 0; up < 14; up += 0.2) if (solid(onHead(x, s, up))) { if (lo === null) lo = up; hi = up; }
      assert.ok(lo !== null && lo > 0.3 && lo < 1.2, `${headCirc}: at x ${x}, s ${s} the plate starts ${lo} mm off the head`);
      assert.ok(hi - lo > 2.2 && hi - lo < 6.5, `${headCirc}: at x ${x}, s ${s} it is ${(hi - lo).toFixed(1)} mm thick`);
      n++;
    }
    assert.ok(n > 25, `checked ${n} places`);
  }
});

// Underneath: the headband's channel, as wide as the band (across the top, where the cap sits), open toward the head,
// with the plate over it; and the ribbon slots straight through, either side of it.
test('the band channel underneath, and the ribbon slots through the plate', () => {
  const sk = cap('trial', { hbWidth: 24 }), g = sk.spec, { solid, onHead } = probe(sk);
  const half = (g.band.w + g.band.gap) / 2;
  for (const x of [-25, 0, 25]) {
    assert.ok(!solid(onHead(x, 0, g.band.t / 2)) && !solid(onHead(x, half - 1, g.band.t / 2)), `the channel is open at x ${x}`);
    assert.ok(solid(onHead(x, half + 3, 1.5)), `the plate comes down beside it at x ${x}`);
    assert.ok(solid(onHead(x, 0, g.band.t + 1.5)), `the plate covers it at x ${x}`);
  }
  const both = cap('trial', { hbWidth: 24, capTieFront: true }), gb = both.spec, pb = probe(both);
  assert.equal(g.slots.length, 1, 'a slot behind the band each side by default');
  assert.deepEqual(gb.slots.map((sl) => Math.sign(sl.s)), [1, -1], 'and one in front too, when asked');
  for (const sl of gb.slots) {
    const at = (u, v) => [sl.x + sl.t[0] * u + sl.t[1] * v, sl.s + sl.t[1] * u - sl.t[0] * v];   // along it, and out toward the edge
    for (const up of [1, 2.5, 4]) assert.ok(!pb.solid(pb.onHead(sl.x, sl.s, up)), `the slot at s ${sl.s.toFixed(0)} goes through`);
    for (const v of [-4, 4]) { const [x, s] = at(0, v); assert.ok(pb.solid(pb.onHead(x, s, 2)), `with plate round it at s ${sl.s.toFixed(0)}`); }
    for (let u = -7; u <= 7; u += 3.5) { const [x, s] = at(u, 1.6 + 3.5); assert.ok(gb.form.sdf(x, s) < 0, 'a whole strip of plate between it and the edge'); }
    const [ex, es] = at(0, 1.6 + 9); assert.ok(gb.form.sdf(ex, es) > -2, 'near the edge');
    for (let u = -7; u <= 7; u += 1) { const [x, s] = at(u, 0); assert.ok(Math.hypot(x - gb.form.X, s) > gb.rp * 1.6, 'clear of the antler’s collar'); }
    for (const pn of gb.pins) assert.ok(Math.abs(pn.s - sl.s) > 8, 'clear of the bobby-pin grooves');
  }
  assert.equal(cap('trial', { capTie: false }).spec.slots.length, 0, 'no slots when they’re off');
});

// The edge: broken teeth all round (more with Jagged edge), coming to a point at the nose, curled just off the head.
// Ribbon slots, front and back, appear wherever they're asked for and the plate reaches far enough past the band; where
// it doesn't, the cap says which is missing (the page tells you what to lengthen).
test('ribbon slots appear when they’re asked for, or the cap says why not', () => {
  const cases = [{}, { capLength: 40 }, { capLength: 110 }, { capBack: 34 }, { capBack: 100 }, { capWidth: -6 }, { capWidth: 30 },
    { capSpacing: 60 }, { capSpacing: 110 }, { capJag: 1 }, { capJag: 0 }, { headCirc: 520 }, { headCirc: 640 }];
  for (const q of cases) for (const seed of [96, 3, 41]) {
    const g = cap('trial', Object.assign({ capTie: true, capTieFront: true, seed }, q)).spec;
    assert.deepEqual(g.slots.map((sl) => Math.sign(sl.s)), [1, -1], `${JSON.stringify(q)} seed ${seed}: ${g.slotsMissing}`);
  }
  const short = cap('trial', { capTie: true, capTieFront: true, capLength: 30, capBack: 20 }).spec;
  assert.deepEqual(short.slotsMissing, ['front', 'back'], 'a plate too short for them says so');
  assert.deepEqual(cap('trial', { capTie: false, capTieFront: false }).spec.slots, [], 'none when they’re off');
});

test('the plate’s jagged edge and its point', () => {
  const plain = cap('trial', { capJag: 0 }).spec.form, rough = cap('trial', { capJag: 1 }).spec.form;
  const wiggle = (f) => { let t = 0; for (let i = 1; i < f.half.length; i++) t += Math.hypot(f.half[i][0] - f.half[i - 1][0], f.half[i][1] - f.half[i - 1][1]); return t; };
  assert.ok(wiggle(rough) > wiggle(plain) * 1.3, `a longer, broken edge (${wiggle(plain).toFixed(0)} → ${wiggle(rough).toFixed(0)} mm)`);
  const f = cap('trial').spec.form;
  assert.ok(f.wAt(f.F - 2) < 3 && f.wAt(f.F * 0.5) > 15, 'it narrows to a point at the front');
  const a = cap('trial', { seed: 5 }).spec.form.half, b = cap('trial', { seed: 6 }).spec.form.half;
  assert.ok(a.length !== b.length || a.some((p, i) => Math.abs(p[0] - b[i][0]) > 0.5), 'a new seed, a new edge');
});

// Not quite symmetric, as no skull is: each side has its own teeth and width, and the point is off the middle a little.
test('the plate isn’t a mirror image', () => {
  const f = cap('trial').spec.form;
  let most = 0;
  for (let s = -f.B + 5; s < f.F - 10; s += 2) {
    const edge = (sg) => { let x = 0; while (x < 120 && f.sdf(sg * (x + 0.5), s) < 0) x += 0.5; return x; };
    most = Math.max(most, Math.abs(edge(1) - edge(-1)));
  }
  assert.ok(most > 3, `the two sides differ by up to ${most.toFixed(1)} mm`);
});

// A long nose follows the forehead (the head's own curve front to back), rather than diving into it.
test('a long nose lies on the forehead', () => {
  for (const capLength of [66, 110]) {
    const g = cap('trial', { capLength }).spec, H = g.head, r = H.r, c = [0, 0, H.top - r[2]];
    for (let s = 0.4 * capLength; s < 0.95 * capLength; s += 5) {
      const p = g.fromSkull(g.form.skew(s), s, 1.5), q = [(p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]];
      const off = (Math.hypot(...q) - 1) * Math.hypot(r[1], r[2]) / Math.SQRT2;   // near enough mm, off the head's own surface
      assert.ok(off > -0.5 && off < 4, `front reach ${capLength}: ${off.toFixed(1)} mm off the forehead at s ${s.toFixed(0)}`);
    }
  }
});

test('designs saved with the old cap’s settings still open', () => {
  const sk = cap('trial', { capShape: 'nasal', capTip: 14, capDroop: 0.5 }), r = Core.validateMesh(Core.meshAntler(sk, 1.4));
  assert.ok(r.watertight && r.shells === 1);
});

test('pegs and sockets never scale, and the socket clears the peg by half the Peg fit (0.2 mm, tested on the P2S)', () => {
  for (const scale of [0.3, 0.7, 1.4]) {
    const sk = Core.buildSkeleton(design('trial', 'skull', { scale, autoFit: false })), so = sk.mount.socket;
    assert.equal(so.r, Core.PEG.r + 0.1); assert.equal(so.flat, Core.PEG.flat + 0.1);
    const loose = Core.buildSkeleton(design('trial', 'skull', { scale, autoFit: false, pegFit: 0.4, clearance: 0.9 })).mount.socket;
    assert.equal(loose.r, Core.PEG.r + 0.2, 'Peg fit sets it; Fit clearance (the band) doesn’t');
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
