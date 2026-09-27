'use strict';
// Head scans: STL/OBJ/PLY in any common units and orientation import to the same head, and a crown
// fitted to a scan is one watertight solid that fits the P2S and stays outside the scanned head.
const test = require('node:test');
const assert = require('node:assert/strict');
const HeadScan = require('../src/head-scan.js');
const F = require('./fixtures/make-head.js');
const { Core } = require('./helpers.js');

const head = F.headMesh();
const VARIANTS = [
  ['scan.obj', { scale: 0.001, map: (x, y, z) => [-x, z, y] }, (m) => Buffer.from(F.obj(m))],   // metres, Y up, face +Z
  ['scan.stl', { scale: 1, map: (x, y, z) => [-x, -y, z] }, (m) => F.stl(m)],                     // mm, Z up, face -Y
  ['scan.ply', { scale: 0.1, map: (x, y, z) => [y, z, x] }, (m) => Buffer.from(F.ply(m))],        // cm, Y up, face +X
];
const imported = VARIANTS.map(([name, v, write]) => {
  const mesh = HeadScan.parse(write(F.toFile(head, v)), name);
  return { name, scan: HeadScan.build(mesh, HeadScan.guessOrientation(mesh, name)) };
});

test('every format, unit and orientation imports to the same head', () => {
  const per = (a, b) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  for (const { name, scan } of imported) {
    assert.ok(Math.abs(scan.circ - per(F.RX, F.RY)) < 12, `${name}: circumference ${scan.circ.toFixed(1)}`);
    assert.ok(Math.abs(scan.seat[0] - F.RX) < 6 && Math.abs(scan.seat[1] - F.RY) < 6, `${name}: seat ${scan.seat.map((x) => x.toFixed(1))}`);
    assert.ok(Math.abs(scan.dome - F.RZ) < 8, `${name}: dome ${scan.dome}`);
  }
  // the three imports agree with each other on the head's measurements (a centre found a few mm
  // apart describes the same surface with different radii, so compare the measurements themselves)
  const [x, ...rest] = imported.map((i) => i.scan);
  for (const y of rest) {
    assert.ok(Math.abs(x.circ - y.circ) < 3 && Math.abs(x.dome - y.dome) < 3, 'circumference and dome agree');
    assert.ok(Math.abs(x.seat[0] - y.seat[0]) < 2 && Math.abs(x.seat[1] - y.seat[1]) < 2, 'width and length agree');
  }
});

test('pack / unpack keeps the scan exactly', () => {
  const s = imported[0].scan, back = HeadScan.unpack(JSON.parse(JSON.stringify(HeadScan.pack(s))));
  assert.deepEqual(Array.from(back.r), Array.from(s.r));
});

test('crowns fitted to each import of the same head come out alike', () => {
  const vols = imported.map(({ name, scan }) => {
    Core.registerHeadScan(name, scan);
    const P = Object.assign(Core.presetParams('fawn', Object.assign({}, Core.DEFAULTS, { style: 'crown' })), { headSource: 'scan', headScan: name });
    return Core.validateMesh(Core.meshAntler(Core.buildSkeleton(P), 1.5)).volume;
  });
  const spread = (Math.max(...vols) - Math.min(...vols)) / Math.min(...vols);
  assert.ok(spread < 0.03, `crown volumes differ by ${(spread * 100).toFixed(1)}%`);
});

test('a crown fitted to a scan is one watertight solid, fits, and stays outside the head', () => {
  Core.registerHeadScan('test-head', imported[1].scan);
  for (const base of ['closed', 'openBack']) {
    const P = Object.assign(Core.presetParams('whitetail', Object.assign({}, Core.DEFAULTS, { style: 'crown', ringBase: base })), { headSource: 'scan', headScan: 'test-head' });
    const sk = Core.buildSkeleton(P), mesh = Core.meshAntler(sk, 1.2), r = Core.validateMesh(mesh);
    assert.ok(r.watertight && r.shells === 1 && r.volume > 0, `${base}: watertight single solid`);
    assert.ok(sk.fit.fits, `${base}: fits the P2S`);
    const c = sk.head.c, p = mesh.positions;
    let deepest = 0, closest = Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const dx = p[i] - c[0], dy = p[i + 1] - c[1], dz = p[i + 2] - c[2], gap = Math.hypot(dx, dy, dz) - sk.head.R(dx, dy, dz);
      deepest = Math.max(deepest, -gap); closest = Math.min(closest, Math.abs(gap));
    }
    assert.ok(deepest < 0.6, `${base}: ${deepest.toFixed(2)} mm inside the scanned head`);
    assert.ok(closest < 0.6, `${base}: the liner rests on the scanned head (closest ${closest.toFixed(2)} mm)`);
  }
});

test('a guided head turn rebuilds the head from its outlines', () => {
  const T = require('./fixtures/make-turn.js');
  const truth = HeadScan.build({ pos: Float32Array.from(head.pos), tri: Uint32Array.from(head.tri) }, { scale: 1, base: 'z-up' });
  const scan = HeadScan.fromHeadTurn(T.frames(), T.forehead());
  assert.equal(scan.source, 'head-turn');
  assert.ok(Math.abs(scan.circ - truth.circ) / truth.circ < 0.03, `circumference ${scan.circ.toFixed(1)} vs ${truth.circ.toFixed(1)}`);
  assert.ok(Math.abs(scan.seat[1] - truth.seat[1]) < 6, `length ${scan.seat[1].toFixed(1)} vs ${truth.seat[1].toFixed(1)}`);
  assert.ok(Math.abs(scan.dome - truth.dome) < 8, `dome ${scan.dome} vs ${truth.dome}`);
  // and it feeds the crown fitting like any imported scan
  Core.registerHeadScan('turn-head', scan);
  const P = Object.assign(Core.presetParams('fawn', Object.assign({}, Core.DEFAULTS, { style: 'crown' })), { headSource: 'scan', headScan: 'turn-head' });
  const r = Core.validateMesh(Core.meshAntler(Core.buildSkeleton(P), 1.5));
  assert.ok(r.watertight && r.shells === 1, 'watertight single solid');
});

test('a head turn needs enough views', () => {
  const T = require('./fixtures/make-turn.js');
  assert.throws(() => HeadScan.fromHeadTurn(T.frames().slice(0, 3), []), /not enough of the head turn/i);
});
