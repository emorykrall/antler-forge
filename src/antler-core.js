/*
 * antler-core.js — parametric antler geometry + watertight mesher.
 *
 * One source of truth shared by the browser designer and the Node CLI.
 * Geometry is modelled as a signed distance field: a flared pedicle base,
 * a knobbly burr, and tapered round-cone segments with oval sections,
 * gutters and pearling, smooth-unioned so tines grow out of the beam,
 * then polygonised with marching tetrahedra. Marching tetrahedra has no
 * ambiguous cases, so the output is always a closed, 2-manifold,
 * consistently oriented surface — i.e. a watertight STL.
 *
 * Units: millimetres. Print frame: Z up, bed at Z = 0, +X = outward
 * (away from the head's midline) for the RIGHT antler, +Y = forward.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AntlerCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- vectors */
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = vlen(a); return l > 1e-12 ? mul(a, 1 / l) : [0, 0, 1]; };
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const DEG = Math.PI / 180;
  function rotate(v, k, ang) { // Rodrigues, k unit
    const c = Math.cos(ang), s = Math.sin(ang), kd = dot(k, v), kx = cross(k, v);
    return [v[0] * c + kx[0] * s + k[0] * kd * (1 - c),
            v[1] * c + kx[1] * s + k[1] * kd * (1 - c),
            v[2] * c + kx[2] * s + k[2] * kd * (1 - c)];
  }
  const perp = (v, t) => sub(v, mul(t, dot(v, t)));

  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // cheap 3D value noise in [0,1]
  function hash3(x, y, z) {
    let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let fx = x - xi, fy = y - yi, fz = z - zi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), fx), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), fx), fy),
      l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), fx), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), fx), fy), fz);
  }

  /* ------------------------------------------------------------- parameters */
  // UI + CLI share this spec. `k` = key, `u` = unit. Groups and tiers only arrange the page:
  // 'essentials' is always shown, 'details' and 'advanced' are collapsed groups. Every key appears once.
  // `only` limits an item or group to one style ('headband' or 'crown'); the page hides the others.
  const PARAM_SPEC = [
    { group: 'Essentials', tier: 'essentials', items: [
      { k: 'style', label: 'Style', type: 'select', options: [['headband', 'Headband antlers'], ['crown', 'Crown']] },
      { k: 'scale', label: 'Size', min: 0.2, max: 1.6, step: 0.01, u: '×', hint: 'Scales the antlers; the headband channel and crown band keep their size' },
      { k: 'headSource', label: 'Head size from', type: 'select', only: 'crown', options: [['tape', 'Tape measurements'], ['scan', 'A 3D head scan']] },
      { k: 'headScan', label: 'Head scan', type: 'text', only: 'crown' },
      { k: 'headCirc', label: 'Head circumference', min: 457.2, max: 660.4, step: 3.175, u: 'mm', only: 'crown', hint: 'Measure around your forehead with a tape measure' },
      { k: 'headMeasured', label: 'Use over-the-top measurements', type: 'bool', only: 'crown', hint: 'Two more tape measurements give a closer fit to your head\'s shape' },
      { k: 'headArcFB', label: 'Front to back, over the top', min: 177.8, max: 406.4, step: 3.175, u: 'mm', only: 'crown', hint: 'With the tape still round your head: from its line at the middle of the forehead, over the top, to its line at the back' },
      { k: 'headArcEE', label: 'Ear to ear, over the top', min: 177.8, max: 406.4, step: 3.175, u: 'mm', only: 'crown', hint: 'From the tape line just above one ear, over the top, to the line above the other ear' },
      { k: 'ringBase', label: 'Crown base', type: 'select', only: 'crown', options: [['closed', 'Closed ring'], ['openBack', 'Open at the back'], ['openFront', 'Open at the front']] },
      { k: 'ringGap', label: 'Opening', min: 30, max: 140, step: 1, u: '°', only: 'crown' },
      { k: 'ringPos', label: 'Antler position', min: 20, max: 85, step: 1, u: '°', only: 'crown', hint: 'Degrees round from the centre of the forehead' },
      { k: 'beamLength', label: 'Beam length', min: 40, max: 450, step: 1, u: 'mm' },
      { k: 'beamSpread', label: 'Outward spread', min: -10, max: 95, step: 1, u: '°' },
      { k: 'beamCurl', label: 'Forward curl', min: -60, max: 180, step: 1, u: '°' },
      { k: 'tineCount', label: 'Tines on beam', min: 0, max: 9, step: 1, u: '' },
      { k: 'tineLength', label: 'Longest tine', min: 10, max: 240, step: 1, u: 'mm' },
      { k: 'browTine', label: 'Brow tine', type: 'bool' },
      { k: 'mount', label: 'Base style', type: 'select', only: 'headband', options: [['tunnel', 'Flared · slide-on'], ['clip', 'Flared · snap-on'], ['flat', 'Flared · glue-on'], ['none', 'Burr only, flat cut']] },
      { k: 'hbWidth', label: 'Headband width', min: 3, max: 40, step: 0.5, u: 'mm', only: 'headband', hint: 'Measure your band: the base is sized to fit it' },
    ] },
    { group: 'Beam', tier: 'details', items: [
      { k: 'baseDia', label: 'Base diameter', min: 8, max: 45, step: 0.5, u: 'mm' },
      { k: 'beamTaper', label: 'Taper along beam', min: 0, max: 0.8, step: 0.01, u: '' },
      { k: 'tipDia', label: 'Tip diameter', min: 2.5, max: 16, step: 0.5, u: 'mm', hint: '⅛ in or more survives handling' },
      { k: 'beamLean', label: 'Lean (back ↔ forward)', min: -80, max: 40, step: 1, u: '°' },
      { k: 'curlBias', label: 'Curl toward tip', min: 0.4, max: 3, step: 0.05, u: '×' },
      { k: 'beamInCurl', label: 'Tip inward curl', min: -120, max: 40, step: 1, u: '°' },
      { k: 'wobble', label: 'Kinks & wander', min: 0, max: 1, step: 0.05, u: '', hint: 'Low values read as sculpted, high as wild' },
    ] },
    { group: 'Tines', tier: 'details', items: [
      { k: 'tineDir', label: 'Tines point', type: 'select', options: [['up', 'Up'], ['forward', 'Forward'], ['alternate', 'Alternating'], ['outward', 'In / out'], ['spiral', 'Spiral']] },
      { k: 'tineStart', label: 'First tine at', min: 0.05, max: 0.9, step: 0.01, u: 'of beam', pct: true },
      { k: 'tineEnd', label: 'Last tine at', min: 0.1, max: 0.97, step: 0.01, u: 'of beam', pct: true },
      { k: 'tineCrest', label: 'Longest tine at', min: 0, max: 1, step: 0.05, u: '', pct: true, hint: 'Tine tips follow a smooth arch that peaks here' },
      { k: 'tineTaper', label: 'Arch falloff', min: 0, max: 0.9, step: 0.05, u: '' },
      { k: 'tineRhythm', label: 'Spacing rhythm', min: 0.5, max: 1.6, step: 0.05, u: '', hint: 'Below 1 packs tines closer toward the tip' },
      { k: 'tineAngle', label: 'Angle off beam', min: 15, max: 110, step: 1, u: '°' },
      { k: 'tineFan', label: 'Fan', min: -30, max: 40, step: 1, u: '°' },
      { k: 'tineCurve', label: 'Curve upward', min: -40, max: 90, step: 1, u: '°' },
      { k: 'tineInward', label: 'Lean inward', min: -20, max: 40, step: 1, u: '°' },
      { k: 'tineThick', label: 'Tine thickness', min: 0.35, max: 1, step: 0.01, u: '× beam' },
    ] },
    { group: 'Brow, crown & forks', tier: 'details', items: [
      { k: 'browDir', label: 'Brow points', type: 'select', options: [['forward', 'Forward'], ['up', 'Up']] },
      { k: 'browLength', label: 'Brow length', min: 10, max: 180, step: 1, u: 'mm' },
      { k: 'browAngle', label: 'Brow angle', min: 20, max: 115, step: 1, u: '°' },
      { k: 'browPos', label: 'Brow height', min: 0.02, max: 0.3, step: 0.01, u: 'of beam', pct: true },
      { k: 'crownCount', label: 'Crown points', min: 0, max: 9, step: 1, u: '' },
      { k: 'crownShape', label: 'Crown shape', type: 'select', options: [['cup', 'Cup'], ['fan', 'Fan / palm']] },
      { k: 'crownLength', label: 'Crown length', min: 10, max: 140, step: 1, u: 'mm' },
      { k: 'palmation', label: 'Palmation (webbing)', min: 0, max: 1, step: 0.05, u: '' },
      { k: 'forkDepth', label: 'Fork levels', min: 0, max: 3, step: 1, u: '' },
      { k: 'forkAngle', label: 'Fork angle', min: 10, max: 70, step: 1, u: '°' },
      { k: 'forkTines', label: 'Fork the tines too', type: 'bool' },
    ] },
    { group: 'Surface', tier: 'details', items: [
      { k: 'ovality', label: 'Oval cross-section', min: 0, max: 0.45, step: 0.01, u: '' },
      { k: 'grooveDepth', label: 'Gutter depth', min: 0, max: 2, step: 0.05, u: 'mm' },
      { k: 'grooveCount', label: 'Gutters around', min: 3, max: 18, step: 1, u: '' },
      { k: 'pearling', label: 'Pearling near base', min: 0, max: 3, step: 0.05, u: 'mm' },
      { k: 'burr', label: 'Burr (coronet)', type: 'bool' },
      { k: 'burrSize', label: 'Burr size', min: 1, max: 8, step: 0.25, u: 'mm' },
      { k: 'fillet', label: 'Junction fillet', min: 0.5, max: 10, step: 0.25, u: 'mm' },
      { k: 'smoothing', label: 'Surface smoothing', min: 0, max: 8, step: 1, u: '' },
    ] },
    { group: 'Ring', tier: 'details', only: 'crown', items: [
      { k: 'ringThick', label: 'Band thickness', min: 5, max: 16, step: 0.5, u: 'mm' },
      { k: 'ringStrands', label: 'Beams', min: 1, max: 3, step: 1, u: '', hint: '1: the band · 2: plus a sweep from the brow past each antler · 3: plus open loops' },
      { k: 'ringWeave', label: 'Loops', min: 1, max: 5, step: 1, u: '' },
      { k: 'ringTines', label: 'Tines on the band', min: 0, max: 18, step: 1, u: '' },
      { k: 'ringTineStyle', label: 'Band tines', type: 'select', options: [['spike', 'Upswept spikes'], ['fork', 'Forked'], ['sweep', 'Swept back'], ['cluster', 'Clusters'], ['paddle', 'Paddles'], ['tendril', 'Tendrils'], ['button', 'Buttons']] },
      { k: 'ringTineLength', label: 'Band tine length', min: 5, max: 90, step: 1, u: 'mm' },
      { k: 'ringFront', label: 'Brow piece', type: 'select', options: [['none', 'None'], ['point', 'Point'], ['shovel', 'Shovel']], hint: 'At the centre of the forehead (not on a crown open at the front)' },
    ] },
    { group: 'Crown shape', tier: 'details', only: 'crown', items: [
      { k: 'ringSculpt', label: 'Sculpted', min: 0, max: 1, step: 0.05, u: '', hint: '0 is wild, grown bone; 1 is smooth, flowing and elven-sculpted' },
      { k: 'ringPattern', label: 'Pattern', type: 'select', options: [['band', 'Band'], ['lattice', 'Almond lattice'], ['loops', 'Calligraphic loops'], ['weave', 'Woven filigree']], hint: 'How the band’s strands part and meet' },
      { k: 'ringDip', label: 'Brow dip', min: 0, max: 35, step: 1, u: 'mm', hint: 'How far the band comes down to a point on the forehead' },
      { k: 'ringRise', label: 'Temple rise', min: 0, max: 30, step: 1, u: 'mm', hint: 'How high the band lifts where the antlers stand' },
      { k: 'ringDrop', label: 'Back drop', min: 0, max: 30, step: 1, u: 'mm', hint: 'How low the band settles at the back' },
      { k: 'ringSweepLift', label: 'Sweep lift', min: 0, max: 45, step: 1, u: 'mm', hint: 'How high the sweep climbs past each antler' },
      { k: 'ringSweepReach', label: 'Sweep reach', min: 15, max: 100, step: 1, u: '°', hint: 'How far the sweep runs on past each antler' },
      { k: 'ringLoopDepth', label: 'Loop depth', min: 4, max: 30, step: 1, u: 'mm' },
      { k: 'ringTaper', label: 'Band taper', min: 0, max: 0.8, step: 0.05, u: '', hint: 'Heavy at the front, thinner toward the back' },
      { k: 'ringTineLean', label: 'Tine lean', min: 0, max: 1.5, step: 0.05, u: '', hint: 'Upright, or flowing back with the beams' },
      { k: 'ringWander', label: 'Organic variation', min: 0, max: 1, step: 0.05, u: '', hint: 'How much the beams wander and the tines vary' },
      { k: 'ringAsym', label: 'Asymmetry', min: 0, max: 1, step: 0.05, u: '', hint: '0 mirrors the left and right sides exactly' },
    ] },
    { group: 'Variation', tier: 'details', items: [
      { k: 'jitter', label: 'Natural variation', min: 0, max: 1, step: 0.05, u: '' },
      { k: 'seed', label: 'Variation seed', min: 1, max: 9999, step: 1, u: '' },
    ] },
    { group: 'Crown fit', tier: 'advanced', only: 'crown', items: [
      { k: 'ringFit', label: 'Comfort allowance', min: 0, max: 30, step: 1, u: 'mm', hint: 'Added to the head circumference for hair and ease' },
      { k: 'ringTilt', label: 'Tilt', min: 0, max: 25, step: 1, u: '°', hint: 'How much higher the front sits than the back' },
    ] },
    { group: 'Base & headband fit', tier: 'advanced', only: 'headband', items: [
      { k: 'baseFlare', label: 'Flare', min: 1, max: 3.2, step: 0.05, u: '×' },
      { k: 'baseHeight', label: 'Pedicle height', min: 4, max: 40, step: 0.5, u: 'mm' },
      { k: 'padLength', label: 'Footprint along band', min: 14, max: 80, step: 1, u: 'mm' },
      { k: 'hbThick', label: 'Headband thickness', min: 1, max: 10, step: 0.1, u: 'mm' },
      { k: 'hbRadius', label: 'Headband curve radius', min: 50, max: 140, step: 1, u: 'mm' },
      { k: 'clearance', label: 'Fit clearance', min: 0, max: 1.5, step: 0.05, u: 'mm' },
      { k: 'wall', label: 'Wall around band', min: 1.2, max: 5, step: 0.1, u: 'mm' },
      { k: 'bandAngle', label: 'Position on band', min: 10, max: 70, step: 1, u: '° from top' },
      { k: 'splay', label: 'Extra splay', min: -30, max: 45, step: 1, u: '°' },
      { k: 'rake', label: 'Extra rake back', min: -30, max: 45, step: 1, u: '°' },
    ] },
    { group: 'Printer · Bambu P2S', tier: 'advanced', items: [
      { k: 'filament', label: 'Filament', type: 'select', options: [['bone', 'PLA Matte · Bone White'], ['oak', 'PLA Wood · White Oak']] },
      { k: 'autoFit', label: 'Shrink to fit the printer', type: 'bool', hint: 'Each antler prints as one piece, turned for the smallest footprint' },
      { k: 'resolution', label: 'Mesh resolution', type: 'select', options: [['1.0', 'Draft'], ['0.7', 'Standard'], ['0.5', 'Fine'], ['0.35', 'Extra fine']] },
      { k: 'bedX', label: 'Bed width', min: 100, max: 500, step: 1, u: 'mm', hint: 'P2S: 10.1 × 10.1 × 10.1 in' },
      { k: 'bedY', label: 'Bed depth', min: 100, max: 500, step: 1, u: 'mm' },
      { k: 'bedZ', label: 'Max height', min: 100, max: 500, step: 1, u: 'mm' },
    ] },
  ];

  // Angles are in the HEAD frame: 0° spread = straight up from the crown of the head,
  // regardless of where the base sits on the band.
  const DEFAULTS = {
    preset: 'whitetail',
    beamLength: 310, baseDia: 28, beamTaper: 0.46, tipDia: 5, beamLean: -26, beamCurl: 118, curlBias: 1.45, beamSpread: 66, beamInCurl: -108, wobble: 0.12,
    tineCount: 3, tineDir: 'up', tineStart: 0.34, tineEnd: 0.76, tineLength: 120, tineCrest: 0.4, tineTaper: 0.4, tineRhythm: 0.9, tineAngle: 80, tineFan: 14, tineCurve: 20, tineInward: 10, tineThick: 0.72,
    browTine: true, browDir: 'up', browLength: 44, browAngle: 74, browPos: 0.1,
    crownCount: 0, crownShape: 'cup', crownLength: 50, palmation: 0, forkDepth: 0, forkAngle: 32, forkTines: false,
    jitter: 0.08, seed: 7,
    ovality: 0.12, grooveDepth: 0.45, grooveCount: 9, pearling: 0.45, burr: true, burrSize: 3.5, fillet: 5, smoothing: 3,
    mount: 'tunnel', baseFlare: 1.65, baseHeight: 15, padLength: 44, hbWidth: 12, hbThick: 3, hbRadius: 85, clearance: 0.4, wall: 2.2,
    bandAngle: 34, splay: 0, rake: 0,
    filament: 'bone', autoFit: true, scale: 0.62, resolution: '0.5', bedX: 256, bedY: 256, bedZ: 256,
    style: 'headband', headSource: 'tape', headScan: '', headCirc: 571.5, headMeasured: false, headArcFB: 285.75, headArcEE: 254, ringBase: 'closed', ringGap: 70, ringPos: 50, ringFit: 10, ringTilt: 10,
    ringRise: 9, ringDrop: 7, ringSweepLift: 20, ringSweepReach: 55, ringLoopDepth: 14, ringTaper: 0.45, ringTineLean: 0.6, ringWander: 0.3, ringAsym: 0,
    ringThick: 9, ringStrands: 3, ringWeave: 2, ringDip: 18, ringTines: 8, ringTineStyle: 'spike', ringTineLength: 26, ringFront: 'point',
    ringSculpt: 0, ringPattern: 'band',   // designs saved before these existed keep their grown look; species set their own
  };

  // Tuned for silhouette first: a smooth curl, tine tips on one arch, calm surfaces.
  const PRESETS = {
    whitetail: { label: 'Whitetail', p: { ringSculpt: 0.85, ringPattern: 'loops' } },
    mule: { label: 'Mule deer', p: { ringSculpt: 0.8, ringPattern: 'loops', ringStrands: 3, ringWeave: 1, ringDip: 14, ringLoopDepth: 10, ringTines: 6, ringTineStyle: 'fork', ringTineLength: 30, ringFront: 'none', beamLength: 260, baseDia: 28, beamTaper: 0.34, tipDia: 5, beamLean: -14, beamCurl: 34, curlBias: 1.2, beamSpread: 56, beamInCurl: -62, tineCount: 0, browTine: true, browDir: 'up', browLength: 28, browAngle: 62, browPos: 0.08, forkDepth: 2, forkAngle: 50, tineCurve: 8, tineInward: 4, fillet: 3, scale: 0.64 } },
    elk: { label: 'Elk', p: { ringSculpt: 0.8, ringPattern: 'lattice', ringStrands: 2, ringWeave: 1, ringDip: 12, ringRise: 12, ringSweepReach: 75, ringTineLean: 1, ringTines: 6, ringTineStyle: 'sweep', ringTineLength: 40, ringFront: 'none', beamLength: 420, baseDia: 34, beamTaper: 0.42, tipDia: 6, beamLean: -46, beamCurl: 80, curlBias: 1.6, beamSpread: 44, beamInCurl: -52, wobble: 0.15, tineCount: 4, tineDir: 'forward', tineStart: 0.16, tineEnd: 0.74, tineLength: 150, tineCrest: 0.55, tineTaper: 0.35, tineRhythm: 0.95, tineAngle: 60, tineFan: 18, tineCurve: 34, tineInward: 6, tineThick: 0.7, browTine: true, browDir: 'forward', browLength: 130, browAngle: 80, browPos: 0.045, ovality: 0.16, grooveDepth: 0.55, pearling: 0.55, burrSize: 4.5, scale: 0.5 } },
    reindeer: { label: 'Reindeer', p: { ringSculpt: 0.7, ringPattern: 'band', ringStrands: 3, ringWeave: 2, ringDip: 8, ringSweepLift: 26, ringTines: 8, ringTineStyle: 'spike', ringTineLength: 22, ringFront: 'shovel', beamLength: 380, baseDia: 25, beamTaper: 0.32, tipDia: 5, beamLean: -50, beamCurl: 150, curlBias: 1.5, beamSpread: 40, beamInCurl: -58, wobble: 0.15, tineCount: 2, tineDir: 'alternate', tineStart: 0.3, tineEnd: 0.52, tineLength: 70, tineCrest: 0.5, tineTaper: 0.2, tineAngle: 58, tineFan: 0, tineCurve: 20, tineInward: 6, tineThick: 0.7, browTine: true, browDir: 'forward', browLength: 90, browAngle: 95, browPos: 0.07, crownCount: 4, crownShape: 'fan', crownLength: 55, palmation: 0.3, ovality: 0.26, grooveDepth: 0.35, pearling: 0.3, burrSize: 3.2, scale: 0.56 } },
    stag: { label: 'Red stag', p: { ringSculpt: 0.85, ringPattern: 'lattice', ringStrands: 3, ringWeave: 2, ringDip: 20, ringRise: 14, ringTines: 4, ringTineStyle: 'cluster', ringTineLength: 24, ringFront: 'point', beamLength: 360, baseDia: 32, beamTaper: 0.4, tipDia: 5.5, beamLean: -34, beamCurl: 70, curlBias: 1.3, beamSpread: 46, beamInCurl: -58, tineCount: 2, tineDir: 'forward', tineStart: 0.12, tineEnd: 0.4, tineLength: 110, tineCrest: 0.2, tineTaper: 0.2, tineAngle: 66, tineFan: 8, tineCurve: 36, tineInward: 8, tineThick: 0.72, browTine: true, browDir: 'forward', browLength: 112, browAngle: 82, browPos: 0.05, crownCount: 4, crownShape: 'cup', crownLength: 70, palmation: 0, ovality: 0.14, grooveDepth: 0.55, pearling: 0.6, burrSize: 4.5, scale: 0.53 } },
    moose: { label: 'Moose', p: { ringSculpt: 0.7, ringPattern: 'band', ringStrands: 1, ringWeave: 1, ringDip: 6, ringRise: 4, ringDrop: 4, ringTaper: 0.2, ringWander: 0.15, ringThick: 12, ringTines: 6, ringTineStyle: 'paddle', ringTineLength: 24, ringFront: 'none', beamLength: 170, baseDia: 32, beamTaper: 0.15, tipDia: 6, beamLean: -12, beamCurl: 25, curlBias: 1, beamSpread: 72, beamInCurl: -5, wobble: 0.1, tineCount: 1, tineDir: 'forward', tineStart: 0.22, tineEnd: 0.22, tineLength: 55, tineCrest: 0.5, tineTaper: 0, tineAngle: 70, tineFan: 0, tineCurve: 20, tineInward: 0, tineThick: 0.7, browTine: false, crownCount: 8, crownShape: 'fan', crownLength: 115, palmation: 1, ovality: 0.4, grooveDepth: 0.3, pearling: 0.3, burrSize: 4, fillet: 6, scale: 0.55 } },
    spirit: { label: 'Forest spirit', p: { ringSculpt: 0.75, ringPattern: 'weave', ringStrands: 3, ringWeave: 3, ringDip: 22, ringLoopDepth: 18, ringWander: 0.75, ringAsym: 0.3, ringTines: 10, ringTineStyle: 'tendril', ringTineLength: 34, ringFront: 'none', beamLength: 320, baseDia: 25, beamTaper: 0.52, tipDia: 4, beamLean: -10, beamCurl: 64, curlBias: 1.6, beamSpread: 52, beamInCurl: -96, wobble: 0.45, tineCount: 7, tineDir: 'spiral', tineStart: 0.14, tineEnd: 0.9, tineLength: 90, tineCrest: 0.35, tineTaper: 0.55, tineRhythm: 0.85, tineAngle: 50, tineFan: 20, tineCurve: 42, tineInward: 12, tineThick: 0.72, browTine: false, forkDepth: 1, forkAngle: 28, forkTines: true, jitter: 0.3, seed: 21, ovality: 0.08, grooveDepth: 0.3, pearling: 0.15, fillet: 6, scale: 0.55 } },
    fawn: { label: 'Fawn nubs', p: { ringSculpt: 0.7, ringPattern: 'band', ringStrands: 1, ringWeave: 1, ringDip: 6, ringRise: 3, ringDrop: 3, ringTaper: 0.1, ringWander: 0.15, ringTines: 12, ringTineStyle: 'button', ringTineLength: 8, ringFront: 'none', beamLength: 20, baseDia: 30, beamTaper: 0.3, tipDia: 18, baseHeight: 10, baseFlare: 1.6, beamLean: -10, beamCurl: 15, curlBias: 1, beamSpread: 30, beamInCurl: 0, wobble: 0.1, tineCount: 0, browTine: false, grooveDepth: 0.6, grooveCount: 11, pearling: 0.7, burrSize: 3, scale: 0.8 } },
  };

  function resolveParams(p) {
    const P = Object.assign({}, DEFAULTS, p || {});
    for (const g of PARAM_SPEC) for (const it of g.items) {
      if (it.type === 'text') P[it.k] = String(P[it.k] == null ? DEFAULTS[it.k] : P[it.k]).slice(0, 80);
      else if (it.type === 'bool') P[it.k] = !!P[it.k];
      else if (it.type === 'select') { P[it.k] = String(P[it.k]); if (!it.options.some((o) => o[0] === P[it.k])) P[it.k] = String(DEFAULTS[it.k]); }
      else { const x = Number(P[it.k]); P[it.k] = clamp(isFinite(x) ? x : DEFAULTS[it.k], it.min, it.max); }
    }
    if (P.tineEnd < P.tineStart) P.tineEnd = P.tineStart;
    return P;
  }

  function presetParams(name, base) {
    const pr = PRESETS[name] || PRESETS.whitetail;
    const keep = {}; // style, fit (headband or head size) and printer settings survive a species change
    if (base) for (const k of ['mount', 'hbWidth', 'hbThick', 'hbRadius', 'clearance', 'wall', 'resolution', 'bedX', 'bedY', 'bedZ', 'bandAngle', 'filament', 'autoFit', 'smoothing',
      'style', 'headSource', 'headScan', 'headCirc', 'headMeasured', 'headArcFB', 'headArcEE', 'ringBase', 'ringGap', 'ringPos', 'ringFit', 'ringTilt']) keep[k] = base[k];   // crown shape comes from the species
    return resolveParams(Object.assign({}, DEFAULTS, pr.p, keep, { preset: name }));
  }

  /* --------------------------------------------------------------- skeleton */
  const STEP = 2.5; // mm between centreline samples (before scaling)
  const MIN_R = 1.5; // smallest printed radius (mm)
  const sstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  // pointed ogive: 1 until uo, then closes like a real tine tip
  const ogive = (u, uo) => (u <= uo ? 1 : Math.pow(Math.max(0, Math.cos(((u - uo) / (1 - uo)) * Math.PI / 2)), 0.72));

  function sweep(start, dirFn, length, rFn) {
    const n = Math.max(3, Math.ceil(length / STEP));
    const pts = [start.slice()], rad = [rFn(0)], ss = [0];
    let p = start.slice();
    for (let i = 1; i <= n; i++) {
      const d = dirFn((i - 0.5) / n);
      p = add(p, mul(d, length / n));
      pts.push(p); rad.push(rFn(i / n)); ss.push(i / n);
    }
    return { pts, rad, ss, n, length };
  }
  function sampleAt(br, s) {
    const i = clamp(Math.round(s * br.n), 0, br.n);
    const a = br.pts[Math.max(0, i - 1)], b = br.pts[Math.min(br.n, i + 1)];
    return { p: br.pts[i], t: norm(sub(b, a)), r: br.rad[i] };
  }
  function parallelFrames(br) {
    const N = [], B = [], T = [];
    const m = br.pts.length;
    for (let i = 0; i < m; i++) {
      const a = br.pts[Math.max(0, i - 1)], b = br.pts[Math.min(m - 1, i + 1)];
      T.push(norm(sub(b, a)));
    }
    let n0 = perp([1, 0, 0], T[0]);
    if (vlen(n0) < 0.2) n0 = perp([0, 1, 0], T[0]);
    N.push(norm(n0)); B.push(cross(T[0], N[0]));
    for (let i = 1; i < m; i++) {
      let n = perp(N[i - 1], T[i]);
      n = vlen(n) < 1e-6 ? N[i - 1] : norm(n);
      N.push(n); B.push(cross(T[i], n));
    }
    br.T = T; br.N = N; br.B = B;
  }
  const safeCross = (a, b, fb) => { const c = cross(a, b); return vlen(c) > 1e-3 ? norm(c) : fb; };

  function buildAt(P, S) {
    const rnd = rng(P.seed * 7919 + 13);
    const J = P.jitter, W = P.wobble;
    const jit = (amt) => (rnd() * 2 - 1) * amt * J;
    const UP = [0, 0, 1];
    const so = (P.seed % 97) * 1.37;
    const branches = [];

    const L = P.beamLength, r0 = P.baseDia / 2, rt = Math.min(P.tipDia / 2, r0 * 0.8);

    /* ---- 1. plan every point that leaves the beam (needed for kinks + swelling) */
    const plan = [];
    if (P.browTine) plan.push({ kind: 'brow', s: clamp(P.browPos + jit(0.015), 0.02, 0.5), len: P.browLength * (1 + jit(0.2)), angle: (P.browAngle + jit(8)) * DEG, ref: P.browDir === 'up' ? UP : [0, 1, 0.12], curve: P.tineCurve * DEG, thick: P.tineThick });
    const refFor = (mode, i) => ({ up: UP, forward: [0, 1, 0.35], alternate: i % 2 ? [0, -1, 0.55] : [0, 1, 0.3], outward: i % 2 ? [-1, 0.2, 0.3] : [1, 0.2, 0.3] })[mode] || null;
    for (let i = 0; i < P.tineCount; i++) {
      const u = P.tineCount > 1 ? i / (P.tineCount - 1) : 0.5;
      const us = Math.pow(u, P.tineRhythm);                                   // spacing rhythm
      const dc = (u - P.tineCrest) / Math.max(P.tineCrest, 1 - P.tineCrest, 0.01);
      plan.push({ kind: 'tine', i, s: clamp(P.tineStart + (P.tineEnd - P.tineStart) * us + jit(0.03), 0.03, 0.95),
        len: Math.max(8, P.tineLength * (1 - P.tineTaper * dc * dc) * (1 + jit(0.2))),                  // tips on one arch
        angle: (P.tineAngle + P.tineFan * (0.5 - u) + jit(10)) * DEG,
        ref: refFor(P.tineDir, i), spiral: P.tineDir === 'spiral', twist: jit(18) * DEG, curve: (P.tineCurve + jit(8)) * DEG, thick: P.tineThick * (1 - 0.1 * u) });
    }
    const cc = P.crownCount, fan = P.crownShape === 'fan';
    for (let c = 0; c < cc; c++) {
      const u = cc > 1 ? c / (cc - 1) : 0.5;
      if (fan) plan.push({ kind: 'crown', s: 0.4 + 0.56 * u + jit(0.02), len: P.crownLength * (0.75 + 0.45 * Math.sin(Math.PI * (0.25 + 0.75 * u))) * (1 + jit(0.15)), angle: (92 - 62 * u + jit(8)) * DEG, fan: true, curve: P.tineCurve * DEG * 0.8, thick: 0.6 });
      else plan.push({ kind: 'crown', s: 0.8 + 0.14 * u, len: P.crownLength * (1 - 0.25 * u) * (1 + jit(0.2)), angle: (38 + jit(10)) * DEG, cupAngle: (c * 360 / cc + 25 + jit(25)) * DEG, curve: P.tineCurve * DEG * 0.6, thick: 0.66 });
    }

    /* ---- 2. main beam: lean/curl/spread, plus wander and a kink away from each tine */
    const lean = P.beamLean * DEG, curl = P.beamCurl * DEG, spread = P.beamSpread * DEG, incurl = P.beamInCurl * DEG;
    const kinkDeg = (3 + 7 * W) * DEG;
    const bdir = (s) => {
      const pitch = lean + curl * Math.pow(s, P.curlBias) + W * 16 * DEG * (vnoise(s * 3.3 + so, 1.7, 0.3) - 0.5);
      const yaw = spread + incurl * s + W * 16 * DEG * (vnoise(s * 3.3 + so, 5.1, 3.7) - 0.5);
      let d = norm([Math.sin(yaw), Math.cos(yaw) * Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]);
      for (const t of plan) {
        if (!t.ref || t.kind === 'crown') continue;
        const w = sstep((s - t.s + 0.015) / 0.05);
        if (w <= 0) continue;
        const ax = cross(d, t.ref); const al = vlen(ax);
        if (al > 1e-3) d = rotate(d, mul(ax, 1 / al), -kinkDeg * w);
      }
      return d;
    };
    const rBeam = (s) => {
      let r = r0 * (1 - P.beamTaper * s);
      for (const t of plan) {
        const k = t.kind === 'crown' ? 0.035 : 0.075 * t.thick;
        r *= 1 - k * sstep((s - t.s) / 0.04 + 0.5);                 // beam loses girth after each branch
        r *= 1 + 0.09 * Math.exp(-Math.pow((s - t.s + 0.012) / 0.028, 2)); // and swells just below it
      }
      r *= 1 + 0.05 * Math.exp(-Math.pow(s / 0.05, 2));            // flare into the burr
      return Math.max(rt, r * ogive(s, 0.8));
    };
    const beam = sweep([0, 0, 0], bdir, L, rBeam);
    beam.kind = 'beam'; beam.ov = P.ovality;
    branches.push(beam);

    /* ---- 3. tines */
    const TGT = norm([-Math.sin(P.tineInward * DEG), 0, Math.cos(P.tineInward * DEG)]); // tines bend up and slightly in
    const tineWob = (d0, axis, seed) => (u) => (W > 0 ? rotate(d0, axis, W * 10 * DEG * (vnoise(u * 2.6 + seed, seed * 0.37, 1.1) - 0.5)) : d0);
    function makeTine(parent, s, len, angle, side, curve, thick, kind, seed) {
      const { p, t, r } = sampleAt(parent, s);
      let sv = perp(side, t);
      if (vlen(sv) < 1e-3) sv = perp([0, 1, 0], t);
      sv = norm(sv);
      const d0 = norm(add(mul(t, Math.cos(angle)), mul(sv, Math.sin(angle))));
      let axis = cross(d0, TGT); const al = vlen(axis);
      axis = al > 1e-3 ? mul(axis, 1 / al) : null;
      const maxC = Math.acos(clamp(dot(d0, TGT), -1, 1));
      const c = curve >= 0 ? Math.min(curve, maxC * 0.95) : curve;
      const side2 = safeCross(d0, t, [1, 0, 0]);
      const wob = tineWob(d0, side2, seed || 1);
      const dirFn = (u) => { const d = wob(u); return axis ? rotate(d, axis, c * u) : d; };
      const rb = Math.max(r * thick, rt * 1.5);
      const br = sweep(p, dirFn, Math.max(len, 5), (u) => Math.max(rt, rb * (1 - 0.28 * u) * ogive(u, 0.42)));
      br.kind = kind || 'tine';
      br.F = side2;               // tines flatten in the plane they share with the beam
      br.ov = P.ovality;
      br.d0 = d0; br.baseT = t;
      return br;
    }

    const tines = [];
    let sideSum = [0, 0, 0];
    plan.forEach((t, idx) => {
      const { t: bt } = sampleAt(beam, t.s);
      let side;
      if (t.kind === 'crown' && t.fan) { side = perp([0, -0.4, 1], bt); if (vlen(side) < 0.2) side = perp([0, 1, 0], bt); }
      else if (t.kind === 'crown') { let b0 = perp([0, 1, 0], bt); if (vlen(b0) < 0.2) b0 = perp(UP, bt); side = rotate(norm(b0), bt, t.cupAngle); }
      else if (t.spiral) { let b0 = perp(UP, bt); if (vlen(b0) < 0.2) b0 = perp([0, 1, 0], bt); side = rotate(norm(b0), bt, t.i * 137.5 * DEG); }
      else side = rotate(norm(t.ref), bt, t.twist || 0);
      const br = makeTine(beam, t.s, t.len, t.angle, side, t.curve, t.thick, t.kind, idx + 1.3);
      if (t.kind === 'crown') { br.ov = P.ovality + P.palmation * 0.2; }
      sideSum = add(sideSum, perp(br.d0, bt));
      tines.push(br);
    });
    // beam flattens across the plane of its tines
    const mid = sampleAt(beam, 0.5).t;
    beam.F = vlen(sideSum) > 1e-3 ? safeCross(mid, norm(sideSum), [1, 0, 0]) : safeCross(sampleAt(beam, 0.2).t, sampleAt(beam, 0.8).t, [1, 0, 0]);
    if (fan && cc) beam.ov = P.ovality + P.palmation * 0.25;
    for (const t of tines) branches.push(t);

    function addForks(br, depth, sStart, sign) {
      if (depth <= 0) return;
      const sf = sStart + (1 - sStart) * (sStart === 0 ? 0.42 : 0.3);   // first split low, so the Ys read as equal
      const rem = br.length * (1 - sf);
      if (rem < 10) return;
      const { t } = sampleAt(br, sf);
      let side = perp([0.55 * sign, 0.75 * sign, 0.35], t);
      if (vlen(side) < 0.2) side = perp([sign, 0, 0], t);
      const child = makeTine(br, sf, rem * (0.9 + jit(0.2)), (P.forkAngle + jit(10)) * DEG, side, P.tineCurve * DEG * 0.15, 0.88, 'fork', depth * 3.1 + sf);
      branches.push(child);
      addForks(child, depth - 1, 0, -sign);
      addForks(br, depth - 1, sf, sign);
    }
    if (P.forkDepth > 0) {
      addForks(beam, P.forkDepth, P.browTine ? P.browPos + 0.1 : 0.15, 1);
      if (P.forkTines) for (let i = 0; i < tines.length; i++) if (tines[i].kind === 'tine') addForks(tines[i], Math.min(P.forkDepth, 2), 0, i % 2 ? 1 : -1);
    }

    if (P.style === 'crown') return placeCrown(P, S, { branches, beam, fan, r0 });

    /* ---- 4. scale, rotate from head frame into print frame, sit on the pedicle */
    const mount = mountSpec(P, r0 * S);
    const sp = (P.splay - P.bandAngle) * DEG, rk = P.rake * DEG;
    const rot = (v) => {
      const [x, y, z] = v;
      const y1 = y * Math.cos(rk) - z * Math.sin(rk), z1 = y * Math.sin(rk) + z * Math.cos(rk);
      return [x * Math.cos(sp) + z1 * Math.sin(sp), y1, -x * Math.sin(sp) + z1 * Math.cos(sp)];
    };
    const place = (v) => add(rot(mul(v, S)), [0, 0, mount.baseZ]);
    for (const br of branches) {
      br.pts = br.pts.map(place);
      br.rad = br.rad.map((r) => Math.max(r * S, MIN_R));   // no printed tip under 3 mm
      br.length *= S;
      br.F = rot(br.F || [1, 0, 0]);
      parallelFrames(br);
    }

    // palm: one flat plate whose outline wraps the beam and the lower part of each fan point
    let palm = null;
    const crowns = branches.filter((b) => b.kind === 'crown');
    if (fan && crowns.length && P.palmation > 0) {
      const n = norm(beam.F);
      const sm = sampleAt(beam, 0.65);
      const e1 = norm(perp(sm.t, n)), e2 = cross(n, e1);
      const pts = [];
      for (let s = 0.28; s <= 1.0001; s += 0.06) pts.push(sampleAt(beam, s).p);
      const reach = 0.22 + 0.33 * P.palmation;
      for (const c of crowns) { pts.push(sampleAt(c, reach).p); pts.push(sampleAt(c, reach * 0.5).p); }
      const uv = pts.map((p) => { const q = sub(p, sm.p); return [dot(q, e1), dot(q, e2)]; });
      palm = { o: sm.p, n, e1, e2, poly: hull2(uv), t0: sampleAt(beam, 0.6).r * (0.62 + 0.25 * P.palmation), pts };
    }

    let burr = null;
    if (P.burr) {
      const rm = P.burrSize * 0.55 * Math.max(0.6, S / 0.6);
      const R0 = beam.rad[0] * 0.97 + rm * 0.3;
      burr = { c: beam.pts[1], T: beam.T[0], N: beam.N[0], B: beam.B[0], R: R0, rm, amp: rm * 0.85,
        beads: Math.max(8, Math.round((2 * Math.PI * R0) / (rm * 1.7))), wild: 0.2 + 0.8 * P.jitter };
    }

    return {
      params: P, scale: S, branches, burr, palm, mount, r0: r0 * S,
      texture: { groove: P.grooveDepth, grooves: P.grooveCount, pearl: P.pearling },
      fillet: P.fillet,
    };
  }


  /* ------------------------------------------------------------------ crown */
  // A crown is one piece shaped to be worn. The head is modelled as an ellipsoid sized from the head
  // circumference (the faun's skull shape, scaled). A smooth liner rests on it all the way round, so
  // the weight spreads with no pressure points; woven strands, band tines and the two antlers ride
  // on the outside, and anything reaching inside the head surface is cut away with a soft edge.
  // Built in the head frame (+Y front, +X the wearer's right, +Z up, origin at the head's centre),
  // tilted so the front sits higher, then lowered onto the bed. It prints upright, on supports.
  const RING_ASPECT = 0.8, RING_SEAT = 0.38, LINER_R = 2.8, LINER_H = 4;
  const perimeter = (a, b) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));   // Ramanujan

  // Head shape from tape measurements. The head is an ellipsoid; the tape line round the forehead
  // cuts it at RING_SEAT of its height. The circumference and two arcs over the top (front to back
  // and ear to ear, each between the tape line's two sides) fix its length, width and dome height.
  function capArc(A, B) {   // over the top of a half-ellipse (half-width A, height B) above RING_SEAT·B
    const a0 = Math.asin(RING_SEAT), n = 96;
    let L = 0, px = A * Math.cos(a0), pz = B * RING_SEAT;
    for (let i = 1; i <= n; i++) {
      const a = a0 + ((Math.PI - 2 * a0) * i) / n, x = A * Math.cos(a), z = B * Math.sin(a);
      L += Math.hypot(x - px, z - pz); px = x; pz = z;
    }
    return L;
  }
  const tapeCache = new Map();
  function headFromTape(C, fb, ee) {
    const key = C + '|' + fb + '|' + ee;
    if (tapeCache.has(key)) return tapeCache.get(key);
    const s = RING_SEAT, cs = Math.sqrt(1 - s * s);
    const domeFor = (ia) => {   // the dome height that makes the front-to-back arc come out right
      let lo = 5, hi = 400;
      for (let i = 0; i < 48; i++) { const H = (lo + hi) / 2; if (capArc(ia / cs, H / (1 - s)) < fb) lo = H; else hi = H; }
      return (lo + hi) / 2;
    };
    let klo = 0.55, khi = 1.1, res = null;   // width : length, found so the ear-to-ear arc comes out right
    for (let i = 0; i < 40; i++) {
      const k = (klo + khi) / 2, ia = C / perimeter(1, k), ib = k * ia, H = domeFor(ia);
      res = { ia, ib, H, k };
      if (capArc(ib / cs, H / (1 - s)) < ee) klo = k; else khi = k;
    }
    const out = { ia: res.ia, ib: res.ib, dome: res.H, aspect: res.k, r: [res.ib / cs, res.ia / cs, res.H / (1 - s)] };
    tapeCache.set(key, out);
    return out;
  }

  // Head scans. A scan is stored as the head's radius in every direction from its centre (the origin
  // of the head frame): r[j * nt + i] at azimuth -π + 2πi/nt and polar angle πj/(np-1) from +Z.
  // `fit` is the matching ellipsoid (same conventions as the tape model), `seat` the half-width and
  // half-length at the tape line. Scans are registered by id; designs refer to them by headScan.
  const SCANS = new Map();
  function registerHeadScan(id, scan) {
    const r = scan.r instanceof Float32Array ? scan.r : Float32Array.from(scan.r);
    SCANS.set(String(id), Object.assign({}, scan, { r }));
  }
  function scanHead(scan, d) {
    const nt = scan.nt, np = scan.np, rr = scan.r;
    const R = (x, y, z) => {   // the head's radius (plus comfort allowance d) toward direction (x, y, z)
      const len = Math.hypot(x, y, z) || 1e-9;
      const ft = ((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * nt, fp = (Math.acos(clamp(z / len, -1, 1)) / Math.PI) * (np - 1);
      const i0 = Math.floor(ft), ti = ft - i0, j0 = Math.min(np - 2, Math.floor(fp)), tj = fp - j0;
      const a = ((i0 % nt) + nt) % nt, b = (a + 1) % nt, r0 = j0 * nt, r1 = r0 + nt;
      return (rr[r0 + a] * (1 - ti) + rr[r0 + b] * ti) * (1 - tj) + (rr[r1 + a] * (1 - ti) + rr[r1 + b] * ti) * tj + d;
    };
    const f = (p) => Math.hypot(p[0], p[1], p[2]) - R(p[0], p[1], p[2]);   // > 0 outside the head
    return {
      kind: 'scan', source: scan.source || 'import', c: [0, 0, 0], r: scan.fit.map((x) => x + d), R,
      exit(C, u) { let lo = 0, hi = 400; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (f(add(C, mul(u, m))) < 0) lo = m; else hi = m; } return add(C, mul(u, lo)); },
      normal(Q) { const e = 0.6; return norm([f([Q[0] + e, Q[1], Q[2]]) - f([Q[0] - e, Q[1], Q[2]]), f([Q[0], Q[1] + e, Q[2]]) - f([Q[0], Q[1] - e, Q[2]]), f([Q[0], Q[1], Q[2] + e]) - f([Q[0], Q[1], Q[2] - e])]); },
      project(p) { return mul(p, R(p[0], p[1], p[2]) / (Math.hypot(p[0], p[1], p[2]) || 1e-9)); },
    };
  }

  function ringSpec(P) {
    const cs = Math.sqrt(1 - RING_SEAT * RING_SEAT);
    let inner, ia, ib, head, shape = null;
    const scan = P.headSource === 'scan' ? SCANS.get(P.headScan) : null;
    if (scan) {   // fitted to a head scan, with the comfort allowance added evenly all round
      const d = P.ringFit / (2 * Math.PI);
      head = scanHead(scan, d);
      ib = scan.seat[0] + d; ia = scan.seat[1] + d; inner = perimeter(ia, ib);
      shape = { width: 2 * scan.seat[0], length: 2 * scan.seat[1], dome: scan.dome, circ: scan.circ, scan: true };
    } else if (P.headMeasured) {   // measured shape, with the comfort allowance added evenly all round
      const h = headFromTape(P.headCirc, P.headArcFB, P.headArcEE), d = P.ringFit / (2 * Math.PI);
      inner = P.headCirc + P.ringFit; ia = h.ia + d; ib = h.ib + d;
      head = { c: [0, 0, 0], r: [h.r[0] + d, h.r[1] + d, h.r[2] + d] };
      shape = { length: 2 * h.ia, width: 2 * h.ib, dome: h.dome };
    } else {   // typical proportions from the circumference alone
      inner = P.headCirc + P.ringFit;
      const k = RING_ASPECT;
      ia = inner / perimeter(1, k); ib = k * ia;   // inner half-length (front–back) and half-width at the seat
      head = { c: [0, 0, 0], r: [ib / cs, ia / cs, ia / cs] };
    }
    const n = Math.round(P.ringStrands), rs = (P.ringThick / 2) * (n === 1 ? 1 : n === 2 ? 0.7 : 0.58);
    const gap = P.ringBase === 'closed' ? 0 : P.ringGap * DEG;
    const t0 = P.ringBase === 'openFront' ? gap / 2 : P.ringBase === 'openBack' ? -(Math.PI - gap / 2) : 0;
    const t1 = P.ringBase === 'openFront' ? 2 * Math.PI - gap / 2 : P.ringBase === 'openBack' ? Math.PI - gap / 2 : 2 * Math.PI;
    const tilt = P.ringTilt * DEG, h0 = RING_SEAT * head.r[2];
    return { inner, ia, ib, head, shape, n, rs, closed: !gap, t0, t1, tilt,
      C: [0, -h0 * Math.sin(tilt), h0 * Math.cos(tilt)], ex: [1, 0, 0], ey: [0, Math.cos(tilt), Math.sin(tilt)] };
  }
  // Where the liner touches the head at ring angle t (0 = front): the point, its outward normal N,
  // the direction along the band T and 'up the head' W.
  function ringFrame(g, t) {
    if (g.head.kind === 'scan') {
      const hs = (tt) => g.head.exit(g.C, add(mul(g.ex, Math.sin(tt)), mul(g.ey, Math.cos(tt))));
      const Q = hs(t), N = g.head.normal(Q), T = norm(sub(hs(t + 1e-3), hs(t - 1e-3)));
      let W = norm(cross(N, T)); if (W[2] < 0) W = mul(W, -1);
      return { Q, N, T, W };
    }
    const hit = (tt) => {
      const u = add(mul(g.ex, Math.sin(tt)), mul(g.ey, Math.cos(tt))), r = g.head.r;
      let A = 0, B = 0, K = -1;
      for (let i = 0; i < 3; i++) { A += (u[i] * u[i]) / (r[i] * r[i]); B += (2 * g.C[i] * u[i]) / (r[i] * r[i]); K += (g.C[i] * g.C[i]) / (r[i] * r[i]); }
      return add(g.C, mul(u, (-B + Math.sqrt(B * B - 4 * A * K)) / (2 * A)));
    };
    const Q = hit(t), r = g.head.r;
    const N = norm([Q[0] / (r[0] * r[0]), Q[1] / (r[1] * r[1]), Q[2] / (r[2] * r[2])]);
    const T = norm(sub(hit(t + 1e-3), hit(t - 1e-3)));
    let W = norm(cross(N, T)); if (W[2] < 0) W = mul(W, -1);
    return { Q, N, T, W };
  }
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const OUTER = LINER_R * 1.5;   // strands and tines start this far out from the head surface
  // Printed crowns get handled: strands stay at least STRAND_MIN thick (radius, mm) except where a free
  // end fines to its tip, and tines at least TINE_BASE_MIN at the base and no longer than TINE_REACH ×
  // that radius, so nothing long and thin snaps off. (Tips still end at MIN_R.)
  const STRAND_MIN = 2.3, TINE_BASE_MIN = 2.2, TINE_REACH = 14;

  // The band's shape, right half (the left is its mirror image): ring angle t runs from the front
  // (0) to the back (π). It dips to a point on the forehead, rises over the temples where the
  // antlers stand, and settles lower toward the back. Heights are along the head's surface, in mm.
  function halfRange(P, g) {
    return [P.ringBase === 'openFront' ? g.t0 : 0, P.ringBase === 'openBack' ? g.t1 : Math.PI];
  }
  const bandH = (P, g, t) => -(P.ringBase === 'openFront' ? 0 : P.ringDip) * Math.exp(-((t / 0.3) ** 2))
    + P.ringRise * Math.exp(-(((t - g.tr) / 0.55) ** 2)) - P.ringDrop * sstep((t - g.tr) / (Math.PI - g.tr));
  function onHead(g, t, h) {   // the head-surface point at ring angle t, moved h up the head
    const f = ringFrame(g, t), p = add(f.Q, mul(f.W, h)), c = g.head.c, r = g.head.r;
    if (g.head.kind === 'scan') return g.head.project(p);
    const k = Math.hypot((p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]);
    return [c[0] + (p[0] - c[0]) / k, c[1] + (p[1] - c[1]) / k, c[2] + (p[2] - c[2]) / k];
  }
  function pathFrame(g, t, hf) {   // a path on the head (height hf(t)): point, outward normal, along, up the head
    const Q = onHead(g, t, hf(t)), r = g.head.r;
    const N = g.head.kind === 'scan' ? g.head.normal(Q) : norm([Q[0] / (r[0] * r[0]), Q[1] / (r[1] * r[1]), Q[2] / (r[2] * r[2])]);
    const T = norm(sub(onHead(g, t + 1e-3, hf(t + 1e-3)), onHead(g, t - 1e-3, hf(t - 1e-3))));
    let W = norm(cross(N, T)); if (W[2] < 0) W = mul(W, -1);
    return { Q, N, T, W };
  }
  // Organic variation for one side: side 1 (right) is the reference; the left follows it exactly when
  // Asymmetry is 0 and draws on its own noise as Asymmetry rises. On a closed band the wander fades
  // to nothing at the front and back, where the two halves meet.
  const sideNoise = (P, side, x, y, z) => {
    const a = vnoise(x, y, z) - 0.5;
    return side > 0 || !P.ringAsym ? a : a + (vnoise(x + 53.1, y + 17.7, z + 9.3) - 0.5 - a) * P.ringAsym;
  };
  const mirrorX = (br) => { const m = Object.assign({}, br, { pts: br.pts.map((p) => [-p[0], p[1], p[2]]) }); parallelFrames(m); return m; };

  // The liner (two smooth rails blended into one soft strip) and the beams on the outside of it.
  function ringBand(P, g) {
    const out = [], [hs, he] = halfRange(P, g), openEnd = P.ringBase === 'openBack', openStart = P.ringBase === 'openFront';
    // Sculpted (0–1) calms the wander, slims the secondary strands and (in the mesher) smooths away the
    // antler gutters and pearling; the pattern decides how the strands part and meet.
    const SC = P.ringSculpt || 0, pat = P.ringPattern || 'band', slim = 1 - 0.25 * SC;
    const bh = (t) => bandH(P, g, t), so = (P.seed % 97) * 0.71;
    const joinFade = (t) => (g.closed ? sstep(t / 0.35) * sstep((Math.PI - t) / 0.35) : openStart ? 1 : sstep(t / 0.35));   // halves meet cleanly
    const path = (ta, tb, vfs, rf, kind, opts) => {   // one beam along the band: right half, and the left (its mirror, varied by Asymmetry)
      for (const side of [1, -1]) {
        if (side < 0 && !P.ringAsym) { out.push(mirrorX(out[out.length - 1])); break; }
        const vf = (u, t) => vfs(u, t, side);
        const br = onePath(ta, tb, vf, rf, kind, opts);
        if (side < 0) { const m = mirrorX(br); out.push(m); } else out.push(br);
      }
      return out[out.length - 2];   // the right-hand beam
    };
    const onePath = (ta, tb, vf, rf, kind, opts) => {
      const o = opts || {}, len = ((tb - ta) * g.inner) / (2 * Math.PI), n = Math.max(8, Math.ceil(len / STEP));
      const pts = [], rad = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n, t = ta + (tb - ta) * u;
        const endMM = Math.min(openStart && ta <= hs + 1e-6 ? u * len : Infinity, openEnd && tb >= he - 1e-6 ? (1 - u) * len : Infinity);
        const flare = endMM < 30 ? 5 * (1 - sstep(endMM / 30)) : 0;   // open ends turn away from the head
        const hf = (tt) => bh(tt) + vf((tt - ta) / (tb - ta), tt);
        const f = pathFrame(g, t, hf);
        const r = rf(u), lift = (o.radial || 0) + (o.radialF ? o.radialF(u) : 0) + (kind === 'liner' ? 0 : OUTER + r) + flare;
        pts.push(add(add(f.Q, mul(f.N, lift)), mul(f.W, o.w || 0)));
        const floor = kind === 'liner' ? MIN_R : o.free ? STRAND_MIN + (MIN_R - STRAND_MIN) * sstep((u - 0.8) / 0.2) : STRAND_MIN;
        rad.push(Math.max(floor, endMM < 25 ? r * (0.72 + 0.28 * sstep(endMM / 25)) : r));   // blunt, rounded ends
      }
      const br = { pts, rad, ss: pts.map((_, i) => (o.free ? i / n : 0.2)), n, length: len, kind, F: [0, 0, 1], ov: o.ov || 0, smooth: kind === 'liner', sculpt: SC };
      parallelFrames(br);
      return br;
    };
    const tr = g.tr, rs = g.rs, span = he - hs;
    // liner: rests on the head along the band's line
    for (const rail of [-1, 1]) { const br = onePath(hs, he, () => 0, () => LINER_R, 'liner', { radial: LINER_R * 0.7, w: rail * LINER_H }); out.push(br, mirrorX(br)); }
    // 1. the band: heavy at the brow and temples, thinner toward the back
    const W8 = P.ringWander * 8 * (1 - 0.7 * SC);
    const main = path(hs, he, (u, t, side) => sideNoise(P, side, Math.cos(t) * 1.7 + so, Math.sin(t) * 1.7, 1.1) * W8 * joinFade(t),
      (u) => rs * (1 - 0.12 * SC) * (1.25 - P.ringTaper * sstep((hs + span * u - tr) / (he - tr))), 'ring', { ov: 0.1 });
    g.main = main;
    if (pat === 'weave' && g.n >= 2) {   // woven filigree: slim strands braid over and under the band, crossing it in a rhythm
      const k = g.n - 1, f = 0.75 + 0.75 * Math.max(1, Math.round(P.ringWeave)), A = P.ringLoopDepth * 0.65;
      for (let j = 0; j < k; j++) {
        const ph = Math.PI / 2 + (2 * Math.PI * j) / g.n, wv = (u) => 2 * Math.PI * f * u + ph;
        path(hs, he, (u, t, side) => A * Math.sin(wv(u)) * joinFade(t) + sideNoise(P, side, u * 4 + so + j, 6.1, 1.3) * W8 * 0.5,
          (u) => rs * 0.72 * slim * (1 - 0.25 * sstep((hs + span * u - tr) / (he - tr))), 'ring', { radial: rs * 0.1, radialF: (u) => rs * 0.4 * Math.cos(wv(u)) });
      }
      return out;
    }
    if (g.n >= 2) {   // 2. a sweep from the brow up past the antler's base, ending free as a swept-back tine
      const ta = Math.max(hs, 0.03), tb = Math.min(he - 0.1, tr + P.ringSweepReach * DEG), hi = P.ringSweepLift;
      g.sweep = path(ta, tb, (u, t, side) => hi * sstep((t - ta) / (tr - ta)) + hi * 0.6 * sstep((t - tr) / (tb - tr)) ** 1.5
        + sideNoise(P, side, u * 3 + so, 4.4, 2.2) * W8 * 1.5 * sstep(u / 0.2),
        (u) => rs * slim * (0.95 - 0.35 * u) * ogive(u, 0.75 - 0.15 * SC), 'ring', { free: true, radial: rs * 0.3 });
    }
    if (g.n >= 3) {   // 3. a beam that bulges away and rejoins the band, leaving open loops
      const loops = pat === 'loops', m = Math.max(1, Math.round(P.ringWeave));
      // calligraphic loops rise above the band behind the antlers; otherwise they hang below it, and the
      // almond lattice opens them wider and fuller, like leaf-shaped windows
      const ta = loops ? Math.min(he - 0.3, tr + 0.22) : Math.max(hs + 0.05, 0.22), tb = Math.min(he - 0.08, tr + (loops ? 1.9 : 1.5));
      const A = P.ringLoopDepth * (loops ? 1.3 : pat === 'lattice' ? 1 + 0.8 * SC : 1) * (loops ? 1 : -1);
      const full = pat === 'band' ? 1 : 1 - 0.45 * SC;   // < 1: a fuller, almond-shaped opening
      path(ta, tb, (u, t, side) => A * Math.pow(Math.abs(Math.sin(Math.PI * m * u)), full) * (1 + P.ringWander * (1 - 0.7 * SC) * 1.2 * sideNoise(P, side, u * 4 + so, 8.8, 0.4)),
        (u) => rs * slim * (0.85 - 0.2 * Math.abs(u - 0.5)), 'ring', { radial: rs * 0.15 });
    }
    return out;
  }

  // Tines along the beams, following their flow, in the species' character, plus an optional brow piece.
  function ringTines(P, g) {
    const out = [], L = P.ringTineLength, style = P.ringTineStyle, U = [0, 0, 1];
    // Sculpted tines are steadier in size and angle, lean further with the flow, curve more and end in
    // finer points, like flames or thorns
    const SC = P.ringSculpt || 0, pat = P.ringPattern || 'band';
    const out2 = [], vary = (0.2 + P.ringWander) * (1 - 0.75 * SC);   // how much tine lengths and angles differ
    for (const side of [1, -1]) {
    if (side < 0 && !P.ringAsym) { for (const br of out2) out.push(mirrorX(br)); break; }
    // the left side draws the same random numbers as the right, blended toward its own stream by Asymmetry
    const rR = rng(P.seed * 977 + 3), rA = rng(P.seed * 977 + 1013);
    const rnd = () => { const a = rR(), b = rA(); return side > 0 ? a : a + (b - a) * P.ringAsym; };
    const jit = (a) => (rnd() * 2 - 1) * a * vary;
    const tine = (base, d0, len, rb, opts) => {
      const o = opts || {}, curve = ((o.curve || 0) + (o.flow === false ? 0 : 22 * SC)) * DEG;
      let axis = o.axis || cross(d0, U); const al = vlen(axis);
      axis = al > 1e-3 ? mul(axis, 1 / al) : [1, 0, 0];
      const tip = (o.tip == null ? 0.45 : o.tip) * (1 - 0.15 * SC), keep = o.keep || 0;
      rb = Math.max(rb, TINE_BASE_MIN); len = Math.min(len, TINE_REACH * rb);   // sturdy enough to print and wear
      const br = sweep(base, (u) => rotate(d0, axis, curve * u), Math.max(len, 4),
        (u) => Math.max(MIN_R, rb * (1 - 0.3 * u) * Math.max(keep, ogive(u, tip))));
      br.kind = 'tine'; br.F = o.F || [0, 0, 1]; br.ov = o.ov == null ? P.ovality : o.ov; br.sculpt = SC;
      parallelFrames(br);
      if (side > 0) { out.push(br); out2.push(br); } else out.push(mirrorX(br));
      return br;
    };
    const n = Math.max(0, Math.round(P.ringTines / 2)), hosts = [g.main, g.sweep].filter(Boolean), lean = P.ringTineLean + 0.5 * SC;
    if (pat === 'loops' && g.sweep && SC > 0) {   // calligraphic: the sweep's free end turns back on itself in a curl
      const e = g.sweep, sp = sampleAt(e, 0.93), O = g.head.kind === 'scan' ? g.head.normal(sp.p) : norm([sp.p[0] / g.head.r[0] ** 2, sp.p[1] / g.head.r[1] ** 2, (sp.p[2] - g.head.c[2]) / g.head.r[2] ** 2]);
      tine(sp.p, sp.t, L * (0.8 + 0.6 * SC), sp.r * 0.9, { axis: O, curve: 200 * SC, flow: false, tip: 0.55 });
    }
    for (let i = 0; i < n; i++) {
      const host = hosts[i % hosts.length], s0 = host === g.main ? 0.12 + (0.8 * (i + 0.5)) / n : 0.25 + (0.5 * (i + 0.5)) / n;
      const sp = sampleAt(host, Math.min(0.92, s0 + jit(0.03)));
      const ang = Math.atan2(sp.p[0], sp.p[1]);
      if (Math.abs(ang - g.tr) < 14 * DEG) continue;   // clear of the antler's base
      const O = g.head.kind === 'scan' ? g.head.normal(sp.p) : norm([sp.p[0] / g.head.r[0] ** 2, sp.p[1] / g.head.r[1] ** 2, (sp.p[2] - g.head.c[2]) / g.head.r[2] ** 2]);
      const K = sp.t[1] < 0 ? sp.t : mul(sp.t, -1);   // with the beam's flow, toward the back
      const base = add(sp.p, mul(U, sp.r * 0.5));
      const dir = (o, k, u) => norm(add(add(mul(O, o), mul(K, k)), mul(U, u)));
      const near = Math.exp(-(((ang - g.tr) / 0.8) ** 2));   // bigger near the antlers
      const rb = sp.r * 0.8, l = L * (0.6 + 0.6 * near) * (1 + jit(0.3));
      if (style === 'spike') tine(base, dir(0.15, lean + jit(0.3), 1), l, rb, { curve: 18 + jit(10) });
      else if (style === 'fork') {
        const m = tine(base, dir(0.15, lean * 0.7 + jit(0.2), 1), l, rb, { curve: 10 });
        const s2 = sampleAt(m, 0.55);
        tine(s2.p, rotate(s2.t, O, 42 * DEG), l * 0.5, rb * 0.7);
      } else if (style === 'sweep') tine(base, dir(0.1, 0.5 + lean + jit(0.2), 0.6), l * 1.3, rb, { curve: 28 + jit(8) });
      else if (style === 'cluster') for (const [k, fl] of [[-0.3, 0.7], [0.3, 0.95], [0.9, 0.7]]) tine(base, dir(0.18, k + lean * 0.5 + jit(0.15), 1), l * fl * (1 + jit(0.15)), rb * 0.8, { curve: 10 });
      else if (style === 'paddle') tine(base, dir(0.12, lean * 0.6 + jit(0.15), 1), l * 0.85, rb * 1.3, { ov: 0.45, F: O, tip: 0.6 });
      else if (style === 'tendril') tine(base, dir(0.1, 0.9 + lean * 0.3, 0.55), l * 1.25, rb * 0.8, { curve: 190 + jit(40) });   // rises, then curls over
      else if (style === 'button') tine(base, dir(0.15, lean * 0.2, 1), Math.min(l, 10) * (1 + jit(0.2)), sp.r * 0.95, { tip: 0.2, keep: 0.55 });
    }
    }
    if (P.ringFront !== 'none' && P.ringBase !== 'openFront') {   // the brow piece, at the band's lowest point
      const f = pathFrame(g, 0, (t) => bandH(P, g, t)), base = add(f.Q, mul(f.N, OUTER + g.rs)), rsB = Math.max(g.rs, STRAND_MIN);   // sturdy at the base
      if (P.ringFront === 'point') {   // a point that runs down the forehead, plus a small crest above it
        const leaf = (u) => 1 + 0.35 * SC * Math.sin(Math.PI * Math.min(1, u / 0.7));   // sculpted: swells a little, then fines to a point
        const br = sweep(base, () => mul(f.W, -1), L * 0.7 * (1 + 0.3 * SC), (u) => Math.max(MIN_R, rsB * 1.1 * leaf(u) * ogive(u, 0.3 - 0.1 * SC)));
        br.kind = 'tine'; br.F = f.N; br.ov = 0.3 + 0.2 * SC; br.sculpt = SC; parallelFrames(br); out.push(br);
        const cr = sweep(base, (u) => norm(add(mul(f.N, 0.25 - 0.2 * SC * u), U)), L * 0.8 * (1 + 0.25 * SC), (u) => Math.max(MIN_R, rsB * leaf(u) * ogive(u, 0.4 - 0.15 * SC)));
        cr.kind = 'tine'; cr.F = f.N; cr.ov = P.ovality; cr.sculpt = SC; parallelFrames(cr); out.push(cr);
      } else {   // shovel: a forward paddle over the brow
        const br = sweep(base, () => norm(add(f.N, mul(U, 0.35))), L * 1.25, (u) => Math.max(MIN_R, rsB * 1.35 * (1 - 0.3 * u) * ogive(u, 0.55)));
        br.kind = 'tine'; br.F = U; br.ov = 0.45; br.sculpt = SC; parallelFrames(br); out.push(br);
      }
    }
    return out;
  }

  function placeCrown(P, S, A) {
    const g = ringSpec(P);
    let tr = P.ringPos * DEG;                       // where the antlers rise, either side of the front
    if (P.ringBase === 'openFront') tr = Math.max(tr, g.t0 + 12 * DEG);
    if (P.ringBase === 'openBack') tr = Math.min(tr, g.t1 - 12 * DEG);
    g.tr = tr;
    const branches = [], burrs = [], palms = [], rS = A.r0 * S;
    const band = ringBand(P, g);   // needs g.tr; sets g.main / g.sweep for the tines
    for (const side of [1, -1]) {
      const f = pathFrame(g, tr, (t) => bandH(P, g, t) + (g.n >= 2 ? 7 : 0));
      const rootR = add(add(f.Q, mul(f.N, OUTER + rS * 0.7)), mul(f.W, rS * 0.4));   // outside the liner
      const root = [side * rootR[0], rootR[1], rootR[2]];
      const mine = [];
      for (const b0 of A.branches) {                // same antler, mirrored for the left
        const F = b0.F || [1, 0, 0];
        const br = Object.assign({}, b0, {
          pts: b0.pts.map((v) => [side * v[0] * S + root[0], v[1] * S + root[1], v[2] * S + root[2]]),
          rad: b0.rad.map((r) => Math.max(r * S, MIN_R)), length: b0.length * S, F: [side * F[0], F[1], F[2]],
        });
        parallelFrames(br); mine.push(br); branches.push(br);
      }
      const beam = mine[A.branches.indexOf(A.beam)], crowns = mine.filter((b) => b.kind === 'crown');
      if (A.fan && crowns.length && P.palmation > 0) {
        const n = norm(beam.F), sm = sampleAt(beam, 0.65);
        const e1 = norm(perp(sm.t, n)), e2 = cross(n, e1), pts = [];
        for (let s2 = 0.28; s2 <= 1.0001; s2 += 0.06) pts.push(sampleAt(beam, s2).p);
        const reach = 0.22 + 0.33 * P.palmation;
        for (const cb of crowns) { pts.push(sampleAt(cb, reach).p); pts.push(sampleAt(cb, reach * 0.5).p); }
        const uv = pts.map((p) => { const q = sub(p, sm.p); return [dot(q, e1), dot(q, e2)]; });
        palms.push({ o: sm.p, n, e1, e2, poly: hull2(uv), t0: sampleAt(beam, 0.6).r * (0.62 + 0.25 * P.palmation), pts });
      }
      if (P.burr) {
        const rm = P.burrSize * 0.55 * Math.max(0.6, S / 0.6), R0 = beam.rad[0] * 0.97 + rm * 0.3;
        burrs.push({ c: beam.pts[1], T: beam.T[0], N: beam.N[0], B: beam.B[0], R: R0, rm, amp: rm * 0.85,
          beads: Math.max(8, Math.round((2 * Math.PI * R0) / (rm * 1.7))), wild: 0.2 + 0.8 * P.jitter });
      }
    }
    for (const br of band) branches.push(br);
    for (const br of ringTines(P, g)) branches.push(br);
    // lower it onto the bed: the lowest point gets a small flat foot, supports carry the rest
    let low = Infinity;
    for (const br of branches) br.pts.forEach((p, i) => { low = Math.min(low, p[2] - br.rad[i]); });
    for (const b of burrs) low = Math.min(low, b.c[2] - b.R - b.rm - b.amp);
    const dz = -1.2 - low, lift = (p) => [p[0], p[1], p[2] + dz];
    for (const br of branches) br.pts = br.pts.map(lift);
    for (const b of burrs) b.c = lift(b.c);
    for (const pm of palms) { pm.o = lift(pm.o); pm.pts = pm.pts.map(lift); }
    g.shift = dz;
    return {
      params: P, scale: S, branches, burr: null, burrs, palm: null, palms, ring: g, roots: [tr, -tr],
      head: g.head.kind === 'scan' ? { kind: 'scan', c: lift(g.head.c), r: g.head.r, R: g.head.R } : { c: lift(g.head.c), r: g.head.r },   // cut away: nothing reaches inside the head
      mount: { type: 'crown', h: 0, rf: 0, ex: 1, baseZ: 0, tunnelCZ: 0 }, r0: rS,
      texture: { groove: P.grooveDepth, grooves: P.grooveCount, pearl: P.pearling }, fillet: P.fillet,
    };
  }

  // Fit loop: shrink the antler (never the headband parts or the crown's ring) until it fits the printer as one piece.
  const BED_MARGIN = 6; // brim + clearance, mm
  function bestFootprint(pts2, bx, by) {
    const h = hull2(pts2);
    let best = null;
    for (let deg = 0; deg < 180; deg += 1) {
      const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of h) { const x = p[0] * c - p[1] * s, y = p[0] * s + p[1] * c; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const w = x1 - x0, d = y1 - y0, ratio = Math.max(w / bx, d / by);
      if (!best || ratio < best.ratio - 1e-9) best = { angle: deg, w, d, ratio };
      if (deg === 0 && ratio <= 1) return best;   // fits square to the bed: don't turn it
    }
    return best;
  }
  function measureSkeleton(sk) {
    const P = sk.params, pts = [];
    let zmax = 0;
    const ring = (c, r) => { for (let k = 0; k < 8; k++) pts.push([c[0] + r * Math.cos(k * Math.PI / 4), c[1] + r * Math.sin(k * Math.PI / 4)]); };
    for (const br of sk.branches) br.pts.forEach((p, i) => { const r = br.rad[i] + 1; ring(p, r); zmax = Math.max(zmax, p[2] + r); });
    for (const b of sk.burr ? [sk.burr] : sk.burrs || []) ring(b.c, b.R + b.rm + b.amp);
    for (const pm of sk.palm ? [sk.palm] : sk.palms || []) {
      // the plate's real outline: its polygon in the palm plane, which can reach past the points it wraps
      for (const q of pm.poly) { const p = add(add(pm.o, mul(pm.e1, q[0])), mul(pm.e2, q[1])); ring(p, pm.t0 + 2); zmax = Math.max(zmax, p[2] + pm.t0 + 2); }
      for (const p of pm.pts) ring(p, pm.t0 + 2);
    }
    const m = sk.mount;
    for (let k = 0; k < 24; k++) pts.push([m.rf * m.ex * Math.cos(k * Math.PI / 12), m.rf * Math.sin(k * Math.PI / 12)]);
    const fp = bestFootprint(pts, P.bedX - 2 * BED_MARGIN, P.bedY - 2 * BED_MARGIN);
    return { angle: fp.angle, w: fp.w, d: fp.d, h: zmax, xyRatio: fp.ratio, zRatio: zmax / (P.bedZ - 1) };
  }
  function buildSkeleton(params) {
    const P = resolveParams(params);
    let S = P.scale, sk, m;
    let over = Infinity;
    for (let it = 0; it < 10; it++) {
      sk = buildAt(P, S); m = measureSkeleton(sk);
      over = Math.max(m.xyRatio, m.zRatio);
      if (!P.autoFit || over <= 1) break;
      S *= Math.max(0.5, 0.985 / over);
    }
    // A crown's ring never shrinks, so shrinking its antlers can converge slowly: if the loop above
    // didn't get there, find the largest antler scale that fits by bisection.
    if (P.autoFit && over > 1) {
      let lo = 0.05, hi = S;
      const at = (x) => { const k = buildAt(P, x), mm = measureSkeleton(k); return { k, mm, ok: Math.max(mm.xyRatio, mm.zRatio) <= 1 }; };
      let best = at(lo);
      if (best.ok) {
        for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2, r = at(mid); if (r.ok) { lo = mid; best = r; } else hi = mid; }
        S = lo; sk = best.k; m = best.mm;
      }
    }
    sk.fit = Object.assign({ scale: S, requested: P.scale, shrunk: S < P.scale - 1e-6, fits: Math.max(m.xyRatio, m.zRatio) <= 1 }, m);
    return sk;
  }

  function hull2(pts) { // monotone chain, CCW
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function sdPoly(poly, x, y) { // iq's signed distance to a polygon
    let d = (x - poly[0][0]) ** 2 + (y - poly[0][1]) ** 2, sgn = 1;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i++) {
      const ex = poly[j][0] - poly[i][0], ey = poly[j][1] - poly[i][1];
      const wx = x - poly[i][0], wy = y - poly[i][1];
      const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
      const bx = wx - ex * t, by = wy - ey * t;
      d = Math.min(d, bx * bx + by * by);
      const c1 = y >= poly[i][1], c2 = y < poly[j][1], c3 = ex * wy > ey * wx;
      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) sgn = -sgn;
    }
    return sgn * Math.sqrt(d);
  }

  /* Flared pedicle base. Profile R(z) = rp + (Rf - rp)(1 - z/h)^k, stretched along the band. */
  const FLARE_K = 1.7;
  function mountSpec(P, baseR) {
    const m = { type: P.mount, k: FLARE_K };
    m.sag = (P.padLength * P.padLength) / (8 * P.hbRadius);
    m.rp = baseR * 1.04;
    if (P.mount === 'none') {
      m.h = Math.max(3, baseR * 0.35); m.rf = m.rp * 1.06; m.ex = 1;
      m.baseZ = m.h; m.tunnelCZ = -P.hbThick / 2;
      return m;
    }
    let zt = 0, need = 0;
    if (P.mount !== 'flat') {
      m.floor = Math.max(1.2, P.wall * 0.7);
      m.tw = P.hbWidth + P.clearance;
      m.th = P.hbThick + P.clearance + m.sag;
      zt = m.floor + m.th;
      need = m.tw / 2 + P.wall;
      m.tunnelCZ = m.floor + m.th / 2;
      if (P.mount === 'clip') m.slot = Math.max(2, P.hbWidth - 2 * Math.max(0.8, P.hbWidth * 0.12));
    } else m.tunnelCZ = -P.hbThick / 2;
    m.h = Math.max(P.baseHeight, zt + 4);
    const g = Math.pow(1 - zt / m.h, FLARE_K);
    let rf = m.rp * P.baseFlare;
    if (m.rp < need) rf = Math.max(rf, m.rp + (need - m.rp) / Math.max(g, 0.05));
    m.rf = Math.max(rf, need + 0.5, m.rp);
    m.ex = Math.max(1, P.padLength / 2 / m.rf);   // footprint stretched along the band
    m.baseZ = m.h - 0.5;
    return m;
  }

  /* ----------------------------------------------------------------- mesher */
  const BIG = 1e4;
  function smin(a, b, k) {
    const h = k - Math.abs(a - b);
    if (h <= 0) return a < b ? a : b;
    const hh = h / k;
    return (a < b ? a : b) - hh * hh * k * 0.25;
  }

  function buildGroups(skel, margin) {
    const groups = [];
    const T = skel.texture;
    const extra = T.groove + T.pearl + 0.5;
    for (const br of skel.branches) {
      const segs = [];
      const ov = br.ov || 0;
      const gb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = 0; i < br.pts.length - 1; i++) {
        const a = br.pts[i], b = br.pts[i + 1], ra = br.rad[i], rb = br.rad[i + 1];
        const r = Math.max(ra, rb) + margin + T.pearl;
        const bb = [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r,
                    Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r];
        for (let j = 0; j < 3; j++) { gb[j] = Math.min(gb[j], bb[j]); gb[j + 3] = Math.max(gb[j + 3], bb[j + 3]); }
        const dir = norm(sub(b, a));
        let F = perp(br.F, dir); F = vlen(F) > 1e-3 ? norm(F) : br.N[i];
        segs.push({ a, b, ra, rb, bb, N: br.N[i], B: br.B[i], F, s0: br.ss[i], s1: br.ss[i + 1] });
      }
      const fin = br.sculpt ? 1 - br.sculpt : 1;   // a sculpted crown piece is smooth, polished bone
      groups.push({ kind: br.kind, segs, bb: gb, ov, groove: br.smooth ? 0 : T.groove * fin, grooves: T.grooves,
        pearl: br.smooth ? 0 : T.pearl * (br.kind === 'beam' ? 1 : 0.45) * fin, pearlEnd: br.kind === 'beam' ? 0.3 : 0.18,
        len: br.length, k: br.sculpt ? Math.max(1.5, skel.fillet * (1 - 0.6 * br.sculpt)) : skel.fillet,   // sculpted: crisper joins, so slim strands stay distinct
        extra: extra + Math.max(br.rad[0], 1) * ov, r0: skel.r0 });
    }
    const m = skel.mount;
    if (m.type !== 'crown') {   // a crown has no pedicle: its antlers rise straight from the ring
      const rx = m.rf * m.ex + margin, ry = m.rf + margin;
      groups.push({ kind: 'pedicle', m, bb: [-rx, -ry, -margin, rx, ry, m.h + margin], k: skel.fillet * 1.2 });
    }
    for (const pm of skel.palm ? [skel.palm] : skel.palms || []) {
      const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (const p of pm.pts) for (let j = 0; j < 3; j++) { bb[j] = Math.min(bb[j], p[j] - pm.t0 - margin - 3); bb[j + 3] = Math.max(bb[j + 3], p[j] + pm.t0 + margin + 3); }
      groups.push({ kind: 'palm', palm: pm, bb, k: skel.fillet * 1.5 });
    }
    for (const b of skel.burr ? [skel.burr] : skel.burrs || []) {
      const r = b.R + b.rm + b.amp + margin;
      groups.push({ kind: 'burr', burr: b, bb: [b.c[0] - r, b.c[1] - r, b.c[2] - r, b.c[0] + r, b.c[1] + r, b.c[2] + r], k: 1.6 });
    }
    return groups;
  }

  /**
   * Polygonise the antler at voxel size `v` (mm). Returns
   * { positions: Float32Array, indices: Uint32Array, attr: Float32Array }.
   * `attr` is a per-vertex cavity value for preview shading (0 = open surface … 1 = deep gutter).
   */
  function meshAntler(skel, v, onProgress) {
    v = Number(v) || 0.7;
    const margin = Math.max(skel.fillet, 1.5) + 2 * v + 1.5;
    const groups = buildGroups(skel, margin);
    const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const g of groups) for (let j = 0; j < 3; j++) { bb[j] = Math.min(bb[j], g.bb[j]); bb[j + 3] = Math.max(bb[j + 3], g.bb[j + 3]); }
    bb[2] = Math.max(bb[2], -3 * v);
    const ox = bb[0] - v, oy = bb[1] - v, oz = bb[2] - v;
    const nx = Math.ceil((bb[3] - ox) / v) + 2, ny = Math.ceil((bb[4] - oy) / v) + 2, nz = Math.ceil((bb[5] - oz) / v) + 2;
    const plane = nx * ny;
    const m = skel.mount, hd = skel.head;

    let maxCells = 1;
    for (const g of groups) {
      g.ix0 = Math.max(0, Math.floor((g.bb[0] - ox) / v)); g.ix1 = Math.min(nx - 1, Math.ceil((g.bb[3] - ox) / v));
      g.iy0 = Math.max(0, Math.floor((g.bb[1] - oy) / v)); g.iy1 = Math.min(ny - 1, Math.ceil((g.bb[4] - oy) / v));
      g.gw = g.ix1 - g.ix0 + 1; g.gh = g.iy1 - g.iy0 + 1;
      maxCells = Math.max(maxCells, g.gw * g.gh);
      if (g.segs) for (const s of g.segs) {
        s.ix0 = Math.max(g.ix0, Math.floor((s.bb[0] - ox) / v)); s.ix1 = Math.min(g.ix1, Math.ceil((s.bb[3] - ox) / v));
        s.iy0 = Math.max(g.iy0, Math.floor((s.bb[1] - oy) / v)); s.iy1 = Math.min(g.iy1, Math.ceil((s.bb[4] - oy) / v));
        const ba = sub(s.b, s.a);
        s.ba = ba; s.l2 = dot(ba, ba); s.rr = s.ra - s.rb; s.a2 = s.l2 - s.rr * s.rr; s.il2 = 1 / s.l2;
        s.srr = Math.sign(s.rr) * s.rr * s.rr;
      }
    }
    const tmp = new Float32Array(maxCells), tsid = new Int32Array(maxCells), tH = new Float32Array(maxCells);
    const raw = new Float32Array(plane); // un-blended minimum, decides which part "owns" the colour

    function fillLayer(k, out, att) {
      out.fill(BIG); raw.fill(BIG); att.fill(0);
      const z = oz + k * v;
      const put = (o, d, kf, a) => { out[o] = smin(out[o], d, kf); if (d < raw[o]) { raw[o] = d; att[o] = a; } };
      for (const g of groups) {
        if (z < g.bb[2] || z > g.bb[5]) continue;
        const gw = g.gw, cells = gw * g.gh;
        if (g.segs) {
          tmp.fill(BIG, 0, cells);
          const segs = g.segs;
          for (let si = 0; si < segs.length; si++) {
            const s = segs[si];
            if (z < s.bb[2] || z > s.bb[5]) continue;
            const ax = s.a[0], ay = s.a[1], az = s.a[2], bx = s.ba[0], by = s.ba[1], bz = s.ba[2];
            const l2 = s.l2, rr = s.rr, a2 = s.a2, il2 = s.il2, kk = s.srr, r1 = s.ra, r2 = s.rb;
            const pz = z - az;
            for (let iy = s.iy0; iy <= s.iy1; iy++) {
              const py = oy + iy * v - ay;
              const row = (iy - g.iy0) * gw - g.ix0;
              for (let ix = s.ix0; ix <= s.ix1; ix++) {
                const px = ox + ix * v - ax;
                const y = px * bx + py * by + pz * bz;
                const zz = y - l2;
                const qx = px * l2 - bx * y, qy = py * l2 - by * y, qz = pz * l2 - bz * y;
                const x2 = qx * qx + qy * qy + qz * qz;
                const y2 = y * y * l2, z2 = zz * zz * l2;
                let d;
                const kx = kk * x2;
                if (Math.sign(zz) * a2 * z2 > kx) d = Math.sqrt(x2 + z2) * il2 - r2;
                else if (Math.sign(y) * a2 * y2 < kx) d = Math.sqrt(x2 + y2) * il2 - r1;
                else d = (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
                const j = row + ix;
                if (d < tmp[j]) { tmp[j] = d; tsid[j] = si; tH[j] = clamp(y * il2, 0, 1); }
              }
            }
          }
          const gd = g.groove, gc = g.grooves / 6, pe = g.pearl, kf = g.k, ov = g.ov, r0 = g.r0;
          for (let iy = g.iy0; iy <= g.iy1; iy++) {
            const row = (iy - g.iy0) * gw - g.ix0, orow = iy * nx;
            for (let ix = g.ix0; ix <= g.ix1; ix++) {
              const j = row + ix;
              let d = tmp[j];
              if (d >= BIG) continue;
              const s = segs[tsid[j]], h = tH[j];
              const rloc = s.ra + (s.rb - s.ra) * h;
              let a = 0;   // cavity shading for the preview (0 = open surface)
              if (d < g.extra + 2.5) {
                const px = ox + ix * v, py = oy + iy * v;
                const wx = px - (s.a[0] + s.ba[0] * h), wy = py - (s.a[1] + s.ba[1] * h), wz = z - (s.a[2] + s.ba[2] * h);
                const wl = Math.sqrt(wx * wx + wy * wy + wz * wz) + 1e-9;
                const sp = s.s0 + (s.s1 - s.s0) * h;
                if (ov > 0) { const cf = (wx * s.F[0] + wy * s.F[1] + wz * s.F[2]) / wl; d += rloc * ov * cf * cf; }
                const fade = clamp((0.86 - sp) / 0.45, 0, 1) * clamp((rloc - 1.4) / 2.5, 0, 1);
                if (gd > 0 && fade > 0) {
                  const cs = (wx * s.N[0] + wy * s.N[1] + wz * s.N[2]) / wl, sn = (wx * s.B[0] + wy * s.B[1] + wz * s.B[2]) / wl;
                  const n = vnoise(cs * gc + 17.3, sn * gc + 3.1, sp * g.len / 9);
                  const gg = sstep((n - 0.38) / 0.4);
                  d += gd * fade * gg;
                  a += gg * fade;
                }
                if (pe > 0 && sp < g.pearlEnd) {
                  const n2 = vnoise(px * 0.62, py * 0.62, z * 0.62);
                  d -= pe * (1 - sp / g.pearlEnd) * Math.max(0, n2 - 0.5) * 2.4;
                }
              }
              put(orow + ix, d, kf, a);
            }
          }
        } else if (g.palm) {
          const pm = g.palm, o = pm.o, n = pm.n, e1 = pm.e1, e2 = pm.e2;
          for (let iy = g.iy0; iy <= g.iy1; iy++) for (let ix = g.ix0; ix <= g.ix1; ix++) {
            const qx = ox + ix * v - o[0], qy = oy + iy * v - o[1], qz = z - o[2];
            const h = Math.abs(qx * n[0] + qy * n[1] + qz * n[2]);
            const u = qx * e1[0] + qy * e1[1] + qz * e1[2], w = qx * e2[0] + qy * e2[1] + qz * e2[2];
            const d2 = sdPoly(pm.poly, u, w);
            const th = pm.t0 * (0.4 + 0.6 * clamp(-d2 / (pm.t0 * 5), 0, 1));   // thins toward the rim
            const rr = Math.min(th * 0.9, 3);
            const a1 = d2 + rr, a2 = h - th + rr;
            const d = Math.hypot(Math.max(a1, 0), Math.max(a2, 0)) + Math.min(Math.max(a1, a2), 0) - rr;
            put(iy * nx + ix, d, g.k, 0);
          }
        } else if (g.burr) {
          const b = g.burr;
          for (let iy = g.iy0; iy <= g.iy1; iy++) for (let ix = g.ix0; ix <= g.ix1; ix++) {
            const qx = ox + ix * v - b.c[0], qy = oy + iy * v - b.c[1], qz = z - b.c[2];
            const h = qx * b.T[0] + qy * b.T[1] + qz * b.T[2];
            const rad = Math.sqrt(Math.max(0, qx * qx + qy * qy + qz * qz - h * h));
            const th = Math.atan2(qx * b.B[0] + qy * b.B[1] + qz * b.B[2], qx * b.N[0] + qy * b.N[1] + qz * b.N[2]);
            // knobbly coronet: coarse lobes + fine nodules, flatter underneath so it prints
            const lob = vnoise(Math.cos(th) * 2.2 + 11, Math.sin(th) * 2.2 + 5, 0.5);
            const nod = vnoise(Math.cos(th) * 6 + 3, Math.sin(th) * 6 + 9, h * 0.9 + 2);
            const bead = 0.5 + 0.5 * Math.cos(b.beads * th + lob * 1.2);   // a regular string of beads, lightly irregular
            const bump = b.amp * (0.25 * lob + 0.6 * bead * bead + b.wild * Math.max(0, nod - 0.35));
            const hs = h < 0 ? h * 1.5 : h * 0.9;
            const d = Math.hypot(rad - b.R, hs) - b.rm - bump;
            put(iy * nx + ix, d, g.k, 0.5 * (1 - bead));
          }
        } else if (g.m) {
          const mm = g.m, H = mm.h;
          if (z > H + 2) continue;
          const zc = clamp(z, 1.2, H);   // short vertical rim instead of a knife edge
          const f = Math.pow(1 - zc / H, mm.k);
          const R = mm.rp + (mm.rf - mm.rp) * f;
          const ex = 1 + (mm.ex - 1) * f;
          const dR = (mm.rf - mm.rp) * mm.k / H * Math.pow(1 - zc / H, mm.k - 1);
          const corr = 1 / Math.sqrt(1 + dR * dR);
          for (let iy = g.iy0; iy <= g.iy1; iy++) {
            const y = oy + iy * v;
            for (let ix = g.ix0; ix <= g.ix1; ix++) {
              const x = (ox + ix * v) / ex;
              const q = Math.sqrt(x * x + y * y);
              let d = (q - R) * corr;
              if (d < 2) d -= 0.35 * (vnoise(x * 0.35 + 40, y * 0.35, z * 0.35) - 0.5);
              d = Math.max(d, z - H);
              put(iy * nx + ix, d, g.k, 0.05);
            }
          }
        }
      }
      if (hd && hd.kind === 'scan') {   // crown fitted to a scan: remove anything inside the scanned head
        const [cx, cy, cz] = hd.c, kc = 2, dz = z - cz;
        for (let iy = 0; iy < ny; iy++) {
          const dy = oy + iy * v - cy, row = iy * nx;
          for (let ix = 0; ix < nx; ix++) {
            const o = row + ix, a = out[o];
            if (a > kc + 2) continue;
            const dx = ox + ix * v - cx, b = hd.R(dx, dy, dz) - Math.hypot(dx, dy, dz);   // > 0 inside the head
            const h = Math.max(kc - Math.abs(a - b), 0) / kc;
            out[o] = Math.max(a, b) + h * h * kc * 0.25;
          }
        }
      } else if (hd) {   // crown: remove anything inside the head surface, with a softly rounded edge
        const [cx, cy, cz] = hd.c, [rx, ry, rz] = hd.r, qz = (z - cz) / rz, kc = 2;
        for (let iy = 0; iy < ny; iy++) {
          const qy = (oy + iy * v - cy) / ry, row = iy * nx;
          for (let ix = 0; ix < nx; ix++) {
            const o = row + ix, a = out[o];
            if (a > kc + 2) continue;
            const qx = (ox + ix * v - cx) / rx, k0 = Math.sqrt(qx * qx + qy * qy + qz * qz);
            const k1 = Math.sqrt((qx / rx) ** 2 + (qy / ry) ** 2 + (qz / rz) ** 2);
            const b = -(k0 * (k0 - 1)) / Math.max(k1, 1e-9);   // > 0 inside the head
            const h = Math.max(kc - Math.abs(a - b), 0) / kc;
            out[o] = Math.max(a, b) + h * h * kc * 0.25;
          }
        }
      }
      for (let o = 0; o < plane; o++) if (out[o] < -z) out[o] = -z;   // flat on the bed
      if (m.tw) {
        const tz = Math.abs(z - m.tunnelCZ) - m.th / 2;
        const hy = m.tw / 2;
        const slotHy = m.slot ? m.slot / 2 : 0;
        const sz = Math.abs(z - m.floor / 2) - (m.floor / 2 + 0.6);
        const hx = m.rf * m.ex + 3;
        for (let iy = 0; iy < ny; iy++) {
          const yy = Math.abs(oy + iy * v);
          let cyz = Math.max(yy - hy, tz);
          if (slotHy) cyz = Math.min(cyz, Math.max(yy - slotHy, sz));
          const row = iy * nx;
          for (let ix = 0; ix < nx; ix++) {
            const cut = Math.max(cyz, Math.abs(ox + ix * v) - hx);
            const o = row + ix; if (out[o] < -cut) out[o] = -cut;
          }
        }
      }
      for (let o = 0; o < plane; o++) if (Math.abs(out[o]) < 1e-6) out[o] = 1e-6;
    }

    /* marching tetrahedra (6 tets around the 0-6 diagonal: every edge runs in +x/+y/+z) */
    const CO = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
    const TETS = [[0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6], [0, 5, 1, 6]];
    const EDGE = {};
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      if (i === j) continue;
      const a = CO[i], b = CO[j];
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      if (d.every((x) => x >= 0)) EDGE[i * 8 + j] = [i, d[0] + 2 * d[1] + 4 * d[2] - 1];
      else if (d.every((x) => x <= 0)) EDGE[i * 8 + j] = [j, -d[0] - 2 * d[1] - 4 * d[2] - 1];
    }

    let pos = new Float32Array(1 << 18), pc = 0;
    let at = new Float32Array(1 << 17);
    let idx = new Uint32Array(1 << 18), ic = 0;
    let mapCur = new Map(), mapNext = new Map();
    let A = new Float32Array(plane), Bv = new Float32Array(plane);
    let AA = new Float32Array(plane), AB = new Float32Array(plane);
    fillLayer(0, A, AA);
    const val = new Float64Array(8), cat = new Float64Array(8), gx = new Int32Array(8), gy = new Int32Array(8), gz = new Int32Array(8);
    let ck = 0;

    function vert(ci, cj) {
      const e = EDGE[ci * 8 + cj];
      const lo = e[0];
      const map = gz[lo] === ck ? mapCur : mapNext;
      const key = (gx[lo] + nx * gy[lo]) * 7 + e[1];
      let id = map.get(key);
      if (id !== undefined) return id;
      const va = val[ci], vb = val[cj];
      let t = va / (va - vb);
      t = t < 0.001 ? 0.001 : t > 0.999 ? 0.999 : t;
      if (pc + 3 > pos.length) { const n = new Float32Array(pos.length * 2); n.set(pos); pos = n; const n2 = new Float32Array(at.length * 2); n2.set(at); at = n2; }
      id = pc / 3;
      at[id] = cat[ci] + (cat[cj] - cat[ci]) * t;
      pos[pc++] = ox + (gx[ci] + (gx[cj] - gx[ci]) * t) * v;
      pos[pc++] = oy + (gy[ci] + (gy[cj] - gy[ci]) * t) * v;
      pos[pc++] = oz + (gz[ci] + (gz[cj] - gz[ci]) * t) * v;
      map.set(key, id);
      return id;
    }
    function tri(a, b, c, dirx, diry, dirz) {
      const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
      const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
      const wx = pos[c * 3] - ax, wy = pos[c * 3 + 1] - ay, wz = pos[c * 3 + 2] - az;
      const nx_ = uy * wz - uz * wy, ny_ = uz * wx - ux * wz, nz_ = ux * wy - uy * wx;
      if (ic + 3 > idx.length) { const n = new Uint32Array(idx.length * 2); n.set(idx); idx = n; }
      if (nx_ * dirx + ny_ * diry + nz_ * dirz >= 0) { idx[ic++] = a; idx[ic++] = b; idx[ic++] = c; }
      else { idx[ic++] = a; idx[ic++] = c; idx[ic++] = b; }
    }

    for (let k = 0; k < nz - 1; k++) {
      ck = k;
      fillLayer(k + 1, Bv, AB);
      for (let y = 0; y < ny - 1; y++) {
        for (let x = 0; x < nx - 1; x++) {
          const o = y * nx + x;
          val[0] = A[o]; val[1] = A[o + 1]; val[2] = A[o + nx + 1]; val[3] = A[o + nx];
          val[4] = Bv[o]; val[5] = Bv[o + 1]; val[6] = Bv[o + nx + 1]; val[7] = Bv[o + nx];
          let neg = 0;
          for (let c = 0; c < 8; c++) if (val[c] < 0) neg++;
          if (neg === 0 || neg === 8) continue;
          cat[0] = AA[o]; cat[1] = AA[o + 1]; cat[2] = AA[o + nx + 1]; cat[3] = AA[o + nx];
          cat[4] = AB[o]; cat[5] = AB[o + 1]; cat[6] = AB[o + nx + 1]; cat[7] = AB[o + nx];
          for (let c = 0; c < 8; c++) { gx[c] = x + CO[c][0]; gy[c] = y + CO[c][1]; gz[c] = k + CO[c][2]; }
          for (const tt of TETS) {
            const ins = [], outs = [];
            for (const c of tt) (val[c] < 0 ? ins : outs).push(c);
            if (ins.length === 0 || ins.length === 4) continue;
            let dx = 0, dy = 0, dz = 0;
            for (const c of outs) { dx += CO[c][0] / outs.length; dy += CO[c][1] / outs.length; dz += CO[c][2] / outs.length; }
            for (const c of ins) { dx -= CO[c][0] / ins.length; dy -= CO[c][1] / ins.length; dz -= CO[c][2] / ins.length; }
            if (ins.length === 1 || ins.length === 3) {
              const lone = ins.length === 1 ? ins[0] : outs[0];
              const others = ins.length === 1 ? outs : ins;
              tri(vert(lone, others[0]), vert(lone, others[1]), vert(lone, others[2]), dx, dy, dz);
            } else {
              const [i1, i2] = ins, [o1, o2] = outs;
              const q0 = vert(i1, o1), q1 = vert(i1, o2), q2 = vert(i2, o2), q3 = vert(i2, o1);
              tri(q0, q1, q2, dx, dy, dz);
              tri(q0, q2, q3, dx, dy, dz);
            }
          }
        }
      }
      let t = A; A = Bv; Bv = t;
      t = AA; AA = AB; AB = t;
      mapCur = mapNext; mapNext = new Map();
      if (onProgress && (k & 3) === 0) onProgress((k + 1) / (nz - 1));
    }
    if (onProgress) onProgress(1);
    const I = idx.slice(0, ic);
    let w = 0;
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i], b = I[i + 1], c = I[i + 2];
      if (a === b || b === c || a === c) continue;
      I[w++] = a; I[w++] = b; I[w++] = c;
    }
    return taubin(dropSpecks({ positions: pos.slice(0, pc), indices: I.slice(0, w), attr: at.slice(0, pc / 3) }), skel.params.smoothing);
  }

  // Taubin smoothing (λ/μ pairs): removes voxel ripple without shrinking the form.
  // Moves vertices only, so the mesh stays exactly as watertight as before. Bed vertices are locked.
  function taubin(mesh, iters) {
    if (!iters) return mesh;
    const Pp = mesh.positions, I = mesh.indices, nv = Pp.length / 3;
    const deg = new Int32Array(nv + 1);
    for (let i = 0; i < I.length; i++) deg[I[i] + 1] += 2;
    for (let i = 0; i < nv; i++) deg[i + 1] += deg[i];
    const nb = new Int32Array(deg[nv]), fill = deg.slice(0, nv);
    for (let f = 0; f < I.length; f += 3) {
      const a = I[f], b = I[f + 1], c = I[f + 2];
      nb[fill[a]++] = b; nb[fill[a]++] = c; nb[fill[b]++] = a; nb[fill[b]++] = c; nb[fill[c]++] = a; nb[fill[c]++] = b;
    }
    const lock = new Uint8Array(nv);
    for (let v = 0; v < nv; v++) if (Pp[v * 3 + 2] < 0.02) lock[v] = 1;
    const tmp = new Float32Array(Pp.length);
    for (let it = 0; it < iters; it++) for (const lam of [0.5, -0.53]) {
      for (let v = 0; v < nv; v++) {
        const o = v * 3;
        if (lock[v]) { tmp[o] = Pp[o]; tmp[o + 1] = Pp[o + 1]; tmp[o + 2] = Pp[o + 2]; continue; }
        let sx = 0, sy = 0, sz = 0; const s0 = deg[v], s1 = deg[v + 1], n = s1 - s0;
        for (let k = s0; k < s1; k++) { const q = nb[k] * 3; sx += Pp[q]; sy += Pp[q + 1]; sz += Pp[q + 2]; }
        tmp[o] = Pp[o] + lam * (sx / n - Pp[o]); tmp[o + 1] = Pp[o + 1] + lam * (sy / n - Pp[o + 1]); tmp[o + 2] = Math.max(0.03, Pp[o + 2] + lam * (sz / n - Pp[o + 2]));
      }
      Pp.set(tmp);
    }
    return mesh;
  }

  // Remove closed shells that are specks next to the main solid (isolated grid samples
  // can produce a zero-volume tetrahedron). Whole shells go, so the rest stays watertight.
  function dropSpecks(mesh) {
    const Pp = mesh.positions, I = mesh.indices, nv = Pp.length / 3, F = I.length / 3;
    const parent = new Int32Array(nv); for (let i = 0; i < nv; i++) parent[i] = i;
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (let f = 0; f < F; f++) { const a = find(I[f * 3]); parent[find(I[f * 3 + 1])] = a; parent[find(I[f * 3 + 2])] = a; }
    const vol = new Map();
    for (let f = 0; f < F; f++) {
      const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3, r = find(I[f * 3]);
      const v6 = Pp[a] * (Pp[b + 1] * Pp[c + 2] - Pp[b + 2] * Pp[c + 1]) - Pp[a + 1] * (Pp[b] * Pp[c + 2] - Pp[b + 2] * Pp[c]) + Pp[a + 2] * (Pp[b] * Pp[c + 1] - Pp[b + 1] * Pp[c]);
      vol.set(r, (vol.get(r) || 0) + v6 / 6);
    }
    if (vol.size <= 1) return mesh;
    let vmax = 0; for (const x of vol.values()) vmax = Math.max(vmax, x);
    const keep = new Set(); for (const [r, x] of vol) if (x > Math.max(2, vmax * 0.002)) keep.add(r);
    const remap = new Int32Array(nv).fill(-1); let nvOut = 0;
    const out = [];
    for (let f = 0; f < F; f++) {
      if (!keep.has(find(I[f * 3]))) continue;
      for (let j = 0; j < 3; j++) { const v = I[f * 3 + j]; if (remap[v] < 0) remap[v] = nvOut++; out.push(remap[v]); }
    }
    const pos = new Float32Array(nvOut * 3), at = new Float32Array(nvOut);
    for (let v = 0; v < nv; v++) { const r = remap[v]; if (r < 0) continue; pos[r * 3] = Pp[v * 3]; pos[r * 3 + 1] = Pp[v * 3 + 1]; pos[r * 3 + 2] = Pp[v * 3 + 2]; at[r] = mesh.attr[v]; }
    return { positions: pos, indices: Uint32Array.from(out), attr: at };
  }

  // Size of the mesh as it lands on the plate: exports turn it by the fit angle about Z.
  function plateSize(mesh, angleDeg) {
    const a = (angleDeg || 0) * DEG, c = Math.cos(a), s = Math.sin(a), P = mesh.positions;
    const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i += 3) {
      const v = [P[i] * c - P[i + 1] * s, P[i] * s + P[i + 1] * c, P[i + 2]];
      for (let j = 0; j < 3; j++) { if (v[j] < bb[j]) bb[j] = v[j]; if (v[j] > bb[j + 3]) bb[j + 3] = v[j]; }
    }
    return [bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]];
  }

  function meshBounds(mesh) {
    const P = mesh.positions;
    const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i += 3) for (let j = 0; j < 3; j++) { const x = P[i + j]; if (x < bb[j]) bb[j] = x; if (x > bb[j + 3]) bb[j + 3] = x; }
    return { bbox: bb, size: [bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]] };
  }

  /* ------------------------------------------------------------- validation */
  function validateMesh(mesh) {
    const P = mesh.positions, I = mesh.indices;
    const F = I.length / 3, nv = P.length / 3;
    const keys = new Float64Array(F * 3);
    for (let f = 0; f < F; f++) {
      const a = I[f * 3], b = I[f * 3 + 1], c = I[f * 3 + 2];
      keys[f * 3] = a * nv + b; keys[f * 3 + 1] = b * nv + c; keys[f * 3 + 2] = c * nv + a;
    }
    keys.sort();
    let dup = 0, open = 0;
    const has = (k) => { let lo = 0, hi = keys.length - 1; while (lo <= hi) { const mid = (lo + hi) >> 1; const x = keys[mid]; if (x === k) return true; if (x < k) lo = mid + 1; else hi = mid - 1; } return false; };
    for (let i = 0; i < keys.length; i++) {
      if (i > 0 && keys[i] === keys[i - 1]) dup++;
      const k = keys[i], a = Math.floor(k / nv), b = k - a * nv;
      if (!has(b * nv + a)) open++;
    }
    // volume, area, bbox, degenerate
    let vol = 0, area = 0, degen = 0;
    const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < nv; i++) for (let j = 0; j < 3; j++) { const x = P[i * 3 + j]; if (x < bb[j]) bb[j] = x; if (x > bb[j + 3]) bb[j + 3] = x; }
    for (let f = 0; f < F; f++) {
      const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
      const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
      const ar = 0.5 * Math.hypot(cx, cy, cz);
      area += ar; if (ar < 1e-9) degen++;
      vol += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
    }
    // shells
    const parent = new Int32Array(nv); for (let i = 0; i < nv; i++) parent[i] = i;
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (let f = 0; f < F; f++) { const a = find(I[f * 3]), b = find(I[f * 3 + 1]), c = find(I[f * 3 + 2]); parent[b] = a; parent[find(c)] = a; }
    let shells = 0; for (let i = 0; i < nv; i++) if (find(i) === i) shells++;
    const E = (F * 3) / 2, chi = nv - E + F;
    const watertight = open === 0 && dup === 0;
    return {
      triangles: F, vertices: nv, openEdges: open, nonManifoldEdges: dup, degenerate: degen,
      watertight, shells, genus: watertight ? (2 * shells - chi) / 2 : null,
      volume: vol, area, bbox: bb, size: [bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]],
    };
  }

  /* ---------------------------------------------------------------- exports */
  function toSTL(mesh, opts) {
    opts = opts || {};
    const mirror = !!opts.mirror;
    const P = mesh.positions, I = mesh.indices, F = I.length / 3;
    const buf = new ArrayBuffer(84 + F * 50), dv = new DataView(buf);
    const header = (opts.name || 'antler') + ' - generated by Antler Forge';
    for (let i = 0; i < 80; i++) dv.setUint8(i, i < header.length ? header.charCodeAt(i) & 0x7f : 32);
    dv.setUint32(80, F, true);
    let o = 84;
    const sx = mirror ? -1 : 1;
    const rz = (opts.rotZ || 0) * DEG, rc = Math.cos(rz), rs = Math.sin(rz);
    for (let f = 0; f < F; f++) {
      let a = I[f * 3], b = I[f * 3 + 1], c = I[f * 3 + 2];
      if (mirror) { const t = b; b = c; c = t; }
      const X = (v) => P[v * 3] * sx * rc - P[v * 3 + 1] * rs, Y = (v) => P[v * 3] * sx * rs + P[v * 3 + 1] * rc;
      const ax = X(a), ay = Y(a), az = P[a * 3 + 2];
      const bx = X(b), by = Y(b), bz = P[b * 3 + 2];
      const cx = X(c), cy = Y(c), cz = P[c * 3 + 2];
      const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (const x of [nx, ny, nz, ax, ay, az, bx, by, bz, cx, cy, cz]) { dv.setFloat32(o, x, true); o += 4; }
      dv.setUint16(o, 0, true); o += 2;
    }
    return buf;
  }

  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  // Minimal store-only ZIP. files: [{name, data: Uint8Array|string}]
  function makeZip(files) {
    const enc = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : Uint8Array.from(Buffer.from(s, 'utf8')));
    const parts = [], central = []; let offset = 0;
    for (const f of files) {
      const data = typeof f.data === 'string' ? enc(f.data) : f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
      const name = enc(f.name), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const csize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    const all = parts.concat(central, [new Uint8Array(end.buffer)]);
    const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
    return out;
  }

  const FILAMENTS = {
    bone: { name: 'Bambu PLA Matte · Bone White (11103)', hex: '#CBC6B8', preset: 'Bambu PLA Matte', slug: 'bone-white' },
    oak: { name: 'Bambu PLA Wood · White Oak (13106)', hex: '#D6CCA3', preset: 'Bambu PLA Wood', slug: 'white-oak' },
  };

  // opts.units === 'in' gives sizes in inches (with mm alongside) for the page; slicer settings
  // stay in millimetres either way, because that is what Bambu Studio asks for.
  function printNotes(P, report, fit, opts) {
    const f = (x) => x.toFixed(1);
    const inches = !!(opts && opts.units === 'in'), toIn = (mm) => (mm / 25.4).toFixed(2);
    const len = (mm) => (inches ? `${toIn(mm)} in` : `${f(mm)} mm`);
    const s = report.size, fil = FILAMENTS[P.filament] || FILAMENTS.bone;
    const crown = P.style === 'crown';
    const mount = crown ? { closed: 'closed crown', openBack: 'crown open at the back', openFront: 'crown open at the front' }[P.ringBase]
      : { tunnel: 'flared base with slide-on headband channel', clip: 'flared base with snap-on headband clip', flat: 'flared base for gluing', none: 'burr with a flat-cut base' }[P.mount];
    const grams = report.volume / 1000 * 1.24;
    const wood = P.filament === 'oak';
    return [
      'ANTLER FORGE — print notes',
      '',
      `Design     ${(PRESETS[P.preset] || {}).label || 'Custom'} · antler scale ${((fit && fit.scale) || P.scale).toFixed(2)}× · ${mount}`,
      `Filament   ${fil.name}`,
      `Printer    Bambu Lab P2S (${inches ? '10.1 × 10.1 × 10.1 in' : '256 × 256 × 256 mm'})`,
      `Each part  ${inches ? `${s.map(toIn).join(' × ')} in (${s.map((x) => x.toFixed(0)).join(' × ')} mm)` : `${f(s[0])} × ${f(s[1])} × ${f(s[2])} mm`}${fit && fit.angle ? ` (turned ${fit.angle}° on the plate to fit)` : ''}`,
      `Material   about ${Math.round(grams * 0.45)}–${Math.round(grams * 0.6)} g ${crown ? 'for the crown' : 'per antler'} at the settings below, plus supports`,
      `Mesh       ${report.triangles.toLocaleString()} triangles · one closed solid · watertight=${report.watertight}`,
      '',
      crown ? 'The crown is one complete part, upright as worn, resting on a small flat foot at Z = 0. Supports carry the rest.' : 'Each antler is one complete part, already standing on its flat base at Z = 0.',
      crown ? 'Print it on its own plate.' : 'Print the right and the left on separate plates, or together if both footprints fit.',
      crown && P.headSource === 'scan' && SCANS.has(P.headScan) ? `Fitted to your head scan (${len(SCANS.get(P.headScan).circ)} round at the tape line), plus ${len(P.ringFit)} comfort allowance.`
      : crown ? `Sized for a head ${len(P.headCirc)} around${P.headMeasured ? `, ${len(P.headArcFB)} front to back and ${len(P.headArcEE)} ear to ear over the top` : ''}, plus ${len(P.ringFit)} comfort allowance.`
      : P.mount === 'tunnel' || P.mount === 'clip'
        ? `Headband channel: ${len(P.hbWidth + P.clearance)} wide × ${len(P.hbThick + P.clearance)} tall, plus curve allowance for a ${inches ? len(P.hbRadius) : P.hbRadius + ' mm'} band radius.`
        : 'The base is flat for gluing to a headband or hair clip (E6000 or CA glue).',
      '',
      inches ? 'Bambu Studio (settings in millimetres, as the slicer uses them)' : 'Bambu Studio',
      `- Filament preset: ${fil.preset}. Plate: Textured PEI.`,
      wood ? '- Nozzle: hardened steel, 0.4 mm or larger. Bambu advises against the 0.2 mm stainless nozzle for PLA Wood.' : '- Nozzle: 0.4 mm.',
      wood ? '- Dry the spool first (55 °C for 8 h). Wood PLA absorbs moisture faster than regular PLA.' : '- Matte PLA hides layer lines well, so 0.16 mm layers look almost cast.',
      `- Layer height: ${wood ? '0.20 mm (Standard)' : '0.16 mm (Optimal)'}. Wall loops: 4, so the tines are mostly solid shell.`,
      '- Sparse infill: 15% gyroid. Top/bottom shells: 5.',
      '- Seam: Back, with scarf seam on, keeps the curved surfaces clean.',
      '- Supports: on, type tree(auto), style Organic, threshold angle 35°. Keep "on build plate only" off: tines overhang the beam.',
      '- Support top Z distance 0.2 mm so the supports peel cleanly off the matte surface.',
      crown ? '- Brim: outer and inner, 5 mm. It keeps the thin band flat on the plate while the antlers print.' : '- Brim: outer only, 5 mm. It keeps the flared base planted while the tall antler prints.',
      '',
      'Finishing',
      wood ? '- White Oak can be sanded (220 → 400 grit) and takes wood stain or a clear matte varnish.'
           : '- Bone White needs no paint. For more depth, wipe a thin raw-umber wash into the gutters and burr, then wipe the high points clean.',
    ].join('\n');
  }

  return {
    PARAM_SPEC, DEFAULTS, PRESETS, resolveParams, presetParams, ringSpec, headFromTape, capArc, registerHeadScan, hasHeadScan: (id) => SCANS.has(String(id)),
    FILAMENTS, buildSkeleton, meshAntler, meshBounds, plateSize, validateMesh, toSTL, makeZip, printNotes,
    _util: { add, sub, mul, dot, cross, norm, rotate },
  };
});
