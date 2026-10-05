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
    { capLength: 85, capBack: 60, capWidth: 24, capSpacing: 110, capPedicle: 24, capTie: false },
    { capShape: 'nasal', capSnoutWidth: 1.6, capTaper: 0, capTip: 30, capDroop: 1 }, { capShape: 'nasal', capLength: 85, capSnoutWidth: 0.6, capTaper: 1, capTip: 6, capDroop: 0 },
    { capShape: 'plate', capSnoutWidth: 1.6, capWidth: 24, capDroop: 1 }, { capShape: 'nasal', capLength: 30, capSnoutWidth: 0.6, capTip: 30, headCirc: 660 }];
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

// Straight down through the cap, wherever it stands tall enough to be hollow: one bone shell about CAP_T (2.6 mm) thick
// and nothing under it. (The shell's inside once followed the scan's own nose and palate under the cut, and that ragged
// inner face showed through the open front, pitted, and differently on the left and right.)
test('the skull cap is one even shell over a clean hollow, the same left and right', () => {
  const sk = cap('trial', { capShape: 'nasal' }), g = sk.spec, f = sk.fields[0].f, M = sk.toBand;
  const toPrint = (b) => { const q = [b[0] - M[12], b[1] - M[13], b[2] - M[14]]; return [q[0] * M[0] + q[1] * M[1] + q[2] * M[2], q[0] * M[4] + q[1] * M[5] + q[2] * M[6], q[0] * M[8] + q[1] * M[9] + q[2] * M[10]]; };
  let n = 0;
  for (let s = g.form.sB + 8; s < g.form.sF - 10; s += 6) for (let x = 0; x < 50; x += 6) {
    if (Math.abs(x - g.form.X) < 22 && Math.abs(s) < 22) continue;   // the pedicles and pegs
    if (g.form.backIn(x, s) < g.form.back().L + 2) continue;          // the back, rolled down onto the head (solid at its edge)
    const runs = [-1, 1].map((side) => {
      let r = '', prev = false;
      for (let h = 30; h >= 0.4; h -= 0.2) { const inside = f(...toPrint(g.fromSkull(side * x, s, h))) < 0; if (inside !== prev) r += inside ? '[' + h.toFixed(1) : ']' + h.toFixed(1); prev = inside; }
      return r;
    });
    assert.equal(runs[0], runs[1], `x ${x}, s ${s}: left and right differ`);
    const m = runs[1].match(/^\[([\d.]+)\]([\d.]+)$/);
    if (!m || +m[1] < 6) continue;   // a thin or solid edge, or outside the cap
    const t = +m[1] - +m[2]; n++;
    assert.ok(t > 2.2 && t < 7, `x ${x}, s ${s}: shell ${t.toFixed(1)} mm (${runs[1]})`);
  }
  assert.ok(n > 30, `checked ${n} columns`);
});

// The cap rests on the head (the head circumference's typical head, under the band's inner surface): its rim lies on
// it across and behind the antlers, and nothing reaches inside it; the band runs under the cap in a groove that follows it.
test('the skull cap sits on the head: the rim on it, nothing inside it, the band in a groove along it', () => {
  for (const headCirc of [520, 571.5, 640]) {
    const sk = cap('trial', { capShape: 'nasal', headCirc }), g = sk.spec, H = g.head, f = sk.fields[0].f, M = sk.toBand;
    const toPrint = (b) => { const q = [b[0] - M[12], b[1] - M[13], b[2] - M[14]]; return [q[0] * M[0] + q[1] * M[1] + q[2] * M[2], q[0] * M[4] + q[1] * M[5] + q[2] * M[6], q[0] * M[8] + q[1] * M[9] + q[2] * M[10]]; };
    const onHead = (x, y) => { const r = H.ryAt(y); return [x, y, H.zc + H.R * Math.sqrt(Math.max(0, 1 - (x / H.R) ** 2 - (y / r) ** 2))]; };
    const gap = (x, y) => {   // straight up from the head to the cap's first solid
      const p = onHead(x, y); for (let d = 0; d < 30; d += 0.25) if (f(...toPrint([p[0], p[1], p[2] + d])) < 0) return d; return Infinity;
    };
    const yB = g.form.sB + g.form.back().L + 4;   // just in from the back's rolled edge
    for (const y of [yB, g.form.sB / 2]) for (const x of [0, 15]) assert.ok(gap(x, y) > 12, `${headCirc}: hollow over the head at x ${x}, y ${y.toFixed(0)}`);
    let rim = 0;
    for (const p of g.rim) {
      if (p[1] > 0 || p[1] < g.form.sB + 4) continue;   // behind the antlers, where it should lie on the head
      const q = onHead(p[0], p[1]); assert.ok(p[2] - q[2] < 1.5, `${headCirc}: the rim at x ${p[0].toFixed(0)}, y ${p[1].toFixed(0)} is ${(p[2] - q[2]).toFixed(1)} mm off the head`); rim++;
    }
    assert.ok(rim > 4, 'checked the rim behind the antlers');
    for (const x of [-20, 0, 20]) {   // inside the head: empty; the band's groove: empty, and cap above it
      const p = onHead(x, 0);
      assert.ok(f(...toPrint([p[0], p[1], p[2] - 2])) > 0, `${headCirc}: nothing inside the head at x ${x}`);
      assert.ok(f(...toPrint([p[0], p[1], p[2] + g.band.t / 2])) > 0 && f(...toPrint([p[0], 0, p[2] + g.band.t + 1.5])) < 0, `${headCirc}: the band's groove at x ${x}`);
    }
  }
});

// The back isn't sawn open: it rolls down onto the head along a rounded outline, closing the shell over the hollow,
// with no corners where it meets the side walls (they once pressed into the head).
test('the skull cap’s back is closed and rounded, resting on the head', () => {
  const sk = cap('trial', { capShape: 'nasal' }), g = sk.spec, f = sk.fields[0].f, M = sk.toBand, H = g.head;
  const toPrint = (b) => { const q = [b[0] - M[12], b[1] - M[13], b[2] - M[14]]; return [q[0] * M[0] + q[1] * M[1] + q[2] * M[2], q[0] * M[4] + q[1] * M[5] + q[2] * M[6], q[0] * M[8] + q[1] * M[9] + q[2] * M[10]]; };
  const onHead = (x, y) => [x, y, H.zc + H.R * Math.sqrt(Math.max(0, 1 - (x / H.R) ** 2 - (y / H.ryAt(y)) ** 2))];
  const solidAbove = (x, y, lo, hi) => { const p = onHead(x, y); for (let d = lo; d <= hi; d += 0.25) if (f(...toPrint([p[0], p[1], p[2] + d])) < 0) return true; return false; };
  // straight in from behind, low over the head, along the back: the cap's edge is there (no open arch to see into)
  for (const x of [0, 10, 20]) {
    let y = g.form.sB - 3; while (y < g.form.sB + 30 && !solidAbove(x, y, 0.3, 4)) y += 0.5;
    assert.ok(y < g.form.sB + 12, `x ${x}: the back reaches down to the head (first solid at y ${y.toFixed(1)})`);
  }
  // round the back corner: the cap's outline on the head behind the antlers moves in steadily (no corner sticking out)
  const outline = []; for (let y = g.form.sB; y < g.form.sB + 24; y += 2) { let x = 60; while (x > 0 && !solidAbove(x, y, 0.3, 3)) x -= 0.5; outline.push(x); }
  for (let i = 1; i < outline.length; i++) assert.ok(outline[i] >= outline[i - 1] - 0.6, `the outline turns in smoothly at the back: ${outline.join(' ')}`);
});

// Comfort: only the cap's smooth, rounded outer edge rests on the head. Inside it, nothing comes near the head (the scan's
// ragged eye-socket rims once dipped to it), and the band channel's sides stand off it, so the wide band takes that line.
test('the skull cap’s underside: only its rounded rim rests on the head', () => {
  const sk = cap('eightpoint', { capShape: 'nasal' }), g = sk.spec, f = sk.fields[0].f, M = sk.toBand, H = g.head, F = g.form;
  const toPrint = (b) => { const q = [b[0] - M[12], b[1] - M[13], b[2] - M[14]]; return [q[0] * M[0] + q[1] * M[1] + q[2] * M[2], q[0] * M[4] + q[1] * M[5] + q[2] * M[6], q[0] * M[8] + q[1] * M[9] + q[2] * M[10]]; };
  const onHead = (x, y, up) => [x, y, H.zc + H.R * Math.sqrt(Math.max(0, 1 - (x / H.R) ** 2 - (y / H.ryAt(y)) ** 2)) + up];
  let n = 0;
  for (let s = F.sB + F.back().L + 4; s < F.sO; s += 3) for (let x = 0; x < F.outline(s) - 7; x += 3) {
    const p = g.fromSkull(x, s, 0);
    if (Math.abs(p[1]) < (g.band.w + g.band.gap) / 2 + 5) continue;   // the band's channel (its sides are checked below)
    for (const up of [0.3, 1, 2]) { assert.ok(f(...toPrint(onHead(p[0], p[1], up))) > 0, `inside the rim, ${up} mm off the head at x ${x}, s ${s}`); n++; }
  }
  assert.ok(n > 100, `checked ${n} points`);
  const rib = (g.band.w + g.band.gap) / 2 + 1.2;   // the middle of the channel's side
  for (const x of [-25, 0, 25]) for (const y of [-rib, rib]) assert.ok(f(...toPrint(onHead(x, y, 0.4))) > 0, `the band channel's side stands off the head at x ${x}`);
  // the rim's edge is rounded: just off the head, the wall is narrower than higher up
  const wall = (s, up) => { let w = 0; for (let x = 20; x < 70; x += 0.1) { const p = g.fromSkull(x, s, 0); if (f(...toPrint(onHead(p[0], p[1], up))) < 0) w += 0.1; } return w; };
  for (const s of [-25, -10]) assert.ok(wall(s, 0.5) < wall(s, 3) - 0.3, `the rim is rounded at s ${s}: ${wall(s, 0.5).toFixed(1)} mm against ${wall(s, 3).toFixed(1)} mm`);
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
