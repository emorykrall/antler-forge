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
    assert.ok(r.volume < 90000, `a light cap (${(r.volume / 1000).toFixed(0)} cm³; it reaches well down the sides)`);
  });
}

test('the skull cap holds up across the ends of its settings, and Surprise me’s edges', () => {
  const cases = [{ capLength: 30, capBack: 20, capWidth: -6, capSpacing: 60, capPedicle: 4, capJag: 0 },
    { capLength: 110, capBack: 100, capWidth: 30, capSpacing: 110, capPedicle: 24, capJag: 1, capTie: false },
    { capSnoutWidth: 1.6, capTaper: 0, capJag: 1, hbWidth: 25.4 }, { capSnoutWidth: 0.6, capTaper: 1, capJag: 0.3, headCirc: 640 },
    { seed: 3 }, { seed: 4071, capJag: 0.9 }, { headCirc: 520, hbWidth: 12 },
    { capBand: 'wires', wireDia: 1.5, clearance: 0, capJag: 1, seed: 4071, wireEarGap: 0 }, { capBand: 'wires', wireDia: 5, clearance: 1.5, capWidth: -6, capSpacing: 60, capLength: 30, capBack: 20 },
    { capBand: 'wires', headCirc: 640, capWidth: 60, capSpacing: 110, capTie: true, capTieFront: true, capPins: true, wireEarGap: 80 },
    { capBand: 'wires', wireFront: -20, wireBack: 80, capJag: 1 }, { capBand: 'wires', wireFront: 100, wireBack: -20, wireDia: 5, capLength: 110, headCirc: 520 }];
  for (const q of cases) {
    const sk = cap('buck', q);
    for (const part of [sk, ...(sk.strips || [])]) {
      const r = Core.validateMesh(Core.meshAntler(part, part === sk ? 1.2 : 0.5));
      assert.ok(r.watertight && r.shells === 1 && r.volume > 0 && part.fit.fits, (part === sk ? 'cap ' : 'strip ') + JSON.stringify(q));
    }
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
  const sk = cap('trial', { hbWidth: 24, capTie: true, capWidth: 16 }), g = sk.spec, { solid, onHead } = probe(sk);
  const half = (g.band.w + g.band.gap) / 2;
  for (const x of [-25, 0, 25]) {
    assert.ok(!solid(onHead(x, 0, g.band.t / 2)) && !solid(onHead(x, half - 1, g.band.t / 2)), `the channel is open at x ${x}`);
    assert.ok(solid(onHead(x, half + 3, 1.5)), `the plate comes down beside it at x ${x}`);
    assert.ok(solid(onHead(x, 0, g.band.t + 1.5)), `the plate covers it at x ${x}`);
  }
  const both = cap('trial', { hbWidth: 24, capTie: true, capTieFront: true, capPins: true, capWidth: 16 }), gb = both.spec, pb = probe(both);
  assert.equal(cap('trial').spec.slots.length, 0, 'no slots by default');
  assert.equal(g.slots.length, 1, 'a slot behind the band each side, when asked');
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

test('both pegs on the cap have their flat facing the middle of the head, as both antlers’ sockets do', () => {
  for (const preset of ['trial', 'feral']) {
    const sk = cap(preset), g = sk.spec, { solid } = probe(sk);
    const { add, mul, sub, dot } = Core._util;
    for (const s of [1, -1]) {   // the wearer's right, then left (the left antler is the right one mirrored)
      const fl = (v) => [s * v[0], v[1], v[2]], Q = fl(g.Q), Z = fl(g.F.Z), mid = add(Q, mul(Z, Core.PEG.h / 2));
      let m = [-s, 0, 0]; m = sub(m, mul(Z, dot(m, Z))); m = mul(m, 1 / Math.hypot(...m));   // toward the midline, across the peg
      const r = (Core.PEG.flat + Core.PEG.r) / 2, side = s > 0 ? 'right' : 'left';
      assert.ok(!solid(add(mid, mul(m, r))), `${preset}: the ${side} peg's flat faces the middle`);
      assert.ok(solid(add(mid, mul(m, -r))), `${preset}: the ${side} peg's round side faces out`);
    }
  }
});

// A double-wire headband (capBand 'wires': two wires spreading over the top of the head, coming toward each other down
// to just above the ears): the cap splits round each wire. A round channel, half in the cap and half
// in a strip that glues up into a pocket in the cap's underside. The cap overlaps each strip all round (the only seam is
// underneath), two pins on each strip go into holes in its pocket, and the cap is no thicker over a wire than it needs.
const solidIn = (part) => {   // a part's field, in the band frame
  const M = part.toBand, f = part.fields[0].f;
  return (b) => { const q = [b[0] - M[12], b[1] - M[13], b[2] - M[14]]; return f(q[0] * M[0] + q[1] * M[1] + q[2] * M[2], q[0] * M[4] + q[1] * M[5] + q[2] * M[6], q[0] * M[8] + q[1] * M[9] + q[2] * M[10]) < 0; };
};
const wireCap = (preset, extra) => cap(preset, Object.assign({ capBand: 'wires', hbWidth: 24 }, extra));
// the band-frame point x across (plate coordinates), y from the wire's plane (+ toward the face), h off the head
const atW = (g, w, x, y, h) => { let s = w.sAt(x); for (let i = 0; i < 6; i++) { const d0 = w.dp(g.fromSkull(x, s, h)) - y, d1 = w.dp(g.fromSkull(x, s + 0.5, h)) - y; s -= d0 * 0.5 / (d1 - d0); } return g.fromSkull(x, s, h); };

for (const preset of ['trial', 'feral', 'eightpoint']) {
  test(`${preset} on a double wire: the cap and each strip are one watertight solid, flat on the bed, that fits the P2S`, () => {
    const sk = wireCap(preset);
    assert.equal(sk.strips.length, 2, 'a strip for each wire');
    for (const [name, part, res] of [['cap', sk, 1.0], ...sk.strips.map((st) => [`${st.wire || 'wire'} strip`, st, 0.5])]) {
      const mesh = Core.meshAntler(part, res), r = Core.validateMesh(mesh);
      assert.ok(r.openEdges === 0 && r.nonManifoldEdges === 0 && r.shells === 1 && r.volume > 0, `${name}: one watertight solid`);
      assert.ok(part.fit.fits, `${name} fits`);
      const { bbox, size } = plateSize(mesh, part.fit.angle);
      assert.ok(bbox[2] >= 0 && bbox[2] < 0.05, `${name} sits on the bed (min Z ${bbox[2]})`);
      if (part !== sk) assert.ok(Math.abs(size[2] - 2 * sk.spec.wire.hw) < 0.2, `the ${name} stands on its side (${size[2].toFixed(1)} mm tall)`);
    }
  });
}

test('on wires, the cap clamshells round each: channel clear, strip in its pocket, overlapped all round, pinned one way', () => {
  for (const extra of [{}, { wireEarGap: 0, capWidth: 60 }, { wireDia: 2, clearance: 0.6, wireFront: 40, wireBack: 10 }, { capJag: 1, seed: 11 }]) {
    const sk = wireCap('trial', extra), g = sk.spec, W = g.wire, P = g.P, k = g.form, top = solidIn(sk), tag = JSON.stringify(extra);
    assert.ok(Math.abs(W.D - (P.wireDia + P.clearance)) < 1e-9, 'the channel is the wire plus the Fit clearance');
    g.wires.forEach((w) => {
      const st = sk.strips.find((q) => q.wire === w.name), strip = solidIn(st), name = `${tag} ${w.name || 'the'} wire`;
      for (let x = -k.wAt(w.s0); x <= k.wAt(w.s0); x += 4) {
        if (!strip(atW(g, w, x, W.D / 2 + 1, W.hc - 1))) continue;   // only along the strip
        for (let a = 0; a < 6.28; a += 0.5) {   // the wire itself (with a little of its clearance) touches neither part
          const r = P.wireDia / 2 + 0.05, b = atW(g, w, x, r * Math.cos(a), W.hc + r * Math.sin(a));
          assert.ok(!top(b) && !strip(b), `${name} is clear at x ${x.toFixed(0)}`);
        }
        assert.ok(!top(atW(g, w, x, W.D / 2 + 1, W.hc - 1)), `${name}: strip and cap never overlap at x ${x.toFixed(0)}`);
        assert.ok(top(atW(g, w, x, 0, W.hc + W.D / 2 + 0.6)), `${name}: the cap over it at x ${x.toFixed(0)}`);
        for (const sy of [1, -1]) {   // the cap comes down outside the strip on both sides (the seam is underneath), with a glue gap
          const side = g.toSkull(atW(g, w, x, sy * (W.hw + 0.5), W.hc - 1.2));
          if (!strip(atW(g, w, x, sy * (W.hw - 0.3), W.hc - 1.2)) || -k.sdf(side[0], side[1]) < Core.WIRE.end + 1) continue;   // along the strip's sides, not its end corners
          assert.ok(!top(atW(g, w, x, sy * (W.hw + 0.05), W.hc - 1.2)), `${name}: a glue gap beside the strip at x ${x.toFixed(0)}`);
          assert.ok(top(atW(g, w, x, sy * (W.hw + Core.WIRE.fit + 0.5), W.hc - 1.2)), `${name}: the cap overlaps the strip at x ${x.toFixed(0)}`);
        }
      }
      for (const sx of [1, -1]) {   // the strip stops short of the edge, and the cap closes round its end (all but the wire's way out)
        const beside = (x) => atW(g, w, x, W.D / 2 + 1, W.hc - 1);
        let x = 0; while (strip(beside(x + 0.1 * sx))) x += 0.1 * sx;
        const b = beside(x), [bx, bs] = g.toSkull(b);
        assert.ok(k.sdf(bx, bs) < -Core.WIRE.end + 0.5, `${name}: the strip stops inside the edge`);
        let gap = 0; while (gap < 3 && !top(beside(x + gap * sx))) gap += 0.05;
        assert.ok(gap < 1, `${name}: the cap closes round the strip's end (${gap.toFixed(2)} mm on)`);
        assert.ok(!top(atW(g, w, x + (gap + 0.5) * sx, 0, W.hc)), `${name}: and the wire runs on out`);
      }
      // two pins on the strip, both on its front side, each in a hole in the cap
      let pins = 0;
      for (let x = -k.wAt(w.s0); x <= k.wAt(w.s0); x += 0.25) if (strip(atW(g, w, x, W.pinY, W.hc + 0.5))) {
        pins++; x += 3;
        assert.ok(!top(atW(g, w, x - 3, W.pinY, W.hc + 0.5)), `${name}: its pin stands in a hole`);
      }
      assert.equal(pins, 2, `${name}: two pins`);   // (one, on a strip too short for two)
      for (let x = -k.wAt(w.s0); x <= k.wAt(w.s0); x += 0.5) assert.ok(!strip(atW(g, w, x, -W.pinY, W.hc + 0.5)), `${name}: pins only on the front side`);
    });
  }
});

test('two wires cross the top where they’re set, and come down toward each other to their gap above the ears', () => {
  const sk = wireCap('trial'), g = sk.spec, top = solidIn(sk), W = g.wire;
  const [front, back] = g.wires;
  assert.deepEqual(g.wires.map((w) => w.name), ['front', 'back']);
  assert.equal(front.s0, g.P.wireFront); assert.equal(back.s0, -g.P.wireBack);
  for (const w of g.wires) {
    assert.ok(Math.abs(w.dp(g.fromSkull(0, w.s0, W.hc))) < 1e-6, `the ${w.name} wire crosses the top at ${w.s0} mm`);
    assert.ok(!top(g.fromSkull(0, w.s0, W.hc)) && top(g.fromSkull(0, w.s0, W.hc + W.D / 2 + 0.6)), `its channel is there, under the cap`);
  }
  // just above the ears (the tape line) they're wireEarGap apart; toward the sides the front wire comes back toward the
  // ears (as in the owner's photo), the back one stands nearly upright
  const z = g.rin - g.head.r[2], yOn = (w) => w.J[1] - (z - w.J[2]) * w.n[2] / w.n[1];
  assert.ok(Math.abs(yOn(front) - yOn(back) - g.P.wireEarGap) < 1e-6, 'wireEarGap apart above the ears');
  for (const w of g.wires) assert.ok(Math.abs(w.dp(w.J)) < 1e-9 && Math.abs(w.J[2] - z) < 1e-9, `the ${w.name} wire's plane reaches the tape line`);
  const y = (w, x) => g.fromSkull(x, w.sAt(x), W.hc)[1];
  assert.ok(y(front, 0) - y(front, 60) > 3, 'the front wire comes back toward the ears');
  assert.ok(Math.abs(y(back, 0) - y(back, 60)) < 3, 'the back wire stands nearly upright');
  const nearer = wireCap('trial', { wireEarGap: 10 }).spec.wires[0];
  assert.ok(nearer.sAt(60) < front.sAt(60) - 1, 'a smaller gap above the ears curves the front wire back further');
  // nothing else cut through the plate lands on a channel: the ribbon slots and the bobby-pin grooves stay clear
  const both = wireCap('trial', { capTie: true, capTieFront: true, capPins: true }).spec;
  for (const sl of both.slots) assert.ok(both.wd(sl.x, sl.s) > both.groW + 2, `the slot at s ${sl.s.toFixed(0)} is clear of the wires`);
  for (const pn of both.pins) assert.ok(both.wd(both.form.wAt(pn.s) - 1, pn.s) > both.groW + 3, `the bobby-pin groove at s ${pn.s.toFixed(0)} is clear of the wires`);
  // the cap is open underneath each wire all the way across, strip or no strip, so the wires lay in from below: nowhere
  // does a wire have to be threaded through a hole (owner, 2026-10-07)
  for (const extra of [{}, { capJag: 1, seed: 11 }, { capWidth: 60 }]) {
    const q = wireCap('trial', extra), gq = q.spec, tq = solidIn(q);
    for (const w of gq.wires) for (let x = -140; x <= 140; x += 0.5) for (let h = 0.1; h < gq.wire.hc - gq.wire.D / 2 + 0.2; h += 0.15) {
      assert.ok(!tq(atW(gq, w, x, 0, h)), `${JSON.stringify(extra)} ${w.name} wire: open underneath at x ${x}, ${h.toFixed(2)} mm up`);
    }
  }
  // a wire the plate doesn't reach gets no strip, and the cap says which
  const short = wireCap('trial', { wireFront: 100, capLength: 40 });
  assert.deepEqual(short.wiresMissing, ['front']); assert.equal(short.strips.length, 1);
});

test('over a wire, the cap is no thicker than it needs to be, and its roof stays whole', () => {
  const height = (sk, x, s) => { const g = sk.spec, t = solidIn(sk); let h = 0; for (let u = 0; u < 14; u += 0.05) if (t(g.fromSkull(x, s, u))) h = u; return h; };
  for (const preset of ['trial', 'feral']) {
    for (const sk of [wireCap(preset)]) {
      const g = sk.spec, W = g.wire;
      for (const w of g.wires) for (let x = -g.form.wAt(w.s0) + 3; x < g.form.wAt(w.s0) - 3; x += 1.5) {
        const s = w.sAt(x); if (-g.form.sdf(x, s) < 2) continue;
        const roof = height(sk, x, s) - (W.hc + W.D / 2);
        assert.ok(roof >= 0.95, `${preset} ${w.name || 'wire'}: roof over the wire at x ${x.toFixed(1)} ${roof.toFixed(2)} mm`);
        if (Math.abs(x) > 10 && Math.abs(x) < 20 && !sk.spec.slots.length) assert.ok(roof < 2, `${preset} ${w.name || 'wire'}: no thicker than it needs at x ${x.toFixed(1)}`);
      }
    }
  }
});

test('a flat band has no strips, and a wire design keeps its headband through a species change', () => {
  assert.equal(cap('trial').strips, undefined);
  assert.equal(Core.resolveParams({ capBand: 'wire' }).capBand, 'band', 'there is no single-wire cap');
  const P = Core.presetParams('feral', Core.presetParams('trial', null));
  const kept = Core.presetParams('feral', Object.assign(Core.presetParams('trial'), { mount: 'skull', capBand: 'wires', wireDia: 2.5, wireFront: 40, wireBack: 20, wireEarGap: 30, capPins: true }));
  assert.equal(P.capBand, 'band');
  assert.deepEqual([kept.capBand, kept.wireDia, kept.wireFront, kept.wireBack, kept.wireEarGap, kept.capPins], ['wires', 2.5, 40, 20, 30, true]);
  const strip = (wire) => ({ wire, report: { size: [120, 37, 9] } });
  const notes = Core.printNotes(kept, { size: [1, 1, 1], triangles: 1, volume: 1, watertight: true }, null, { cap: { report: { size: [120, 120, 48], volume: 50000 }, strips: [strip('front'), strip('back')] } });
  assert.match(notes, /five parts/); assert.match(notes, /front wire’s strip/); assert.match(notes, /back wire’s strip/); assert.doesNotMatch(notes, /groove under the cap/);
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
