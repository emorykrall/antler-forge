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
  // The controls. Essentials are the decisions everyone makes; Shape details refine them; Advanced is fit
  // and printing. Several controls are combined, relative handles (×1 = the species' own design): Tine length,
  // Thickness, Wildness, Texture and Ornament size each scale a group of underlying values (see applyMacros).
  // Values without a control keep their species setting (and can still be set in a design file).
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
      { k: 'ringPattern', label: 'Crown design', type: 'select', only: 'crown', options: [['moon', 'Moon'], ['lotus', 'Lotus halo'], ['roots', 'Roots'], ['fleur', 'Fleur'], ['lattice', 'Almond lattice'], ['circlet', 'Circlet'], ['spines', 'Crown of spines'], ['briar', 'Briar'], ['band', 'Plain band']] },
      { k: 'character', label: 'Form & finish', min: 0, max: 1, step: 0.05, u: '', hint: 'Gnarled and biomechanical ← natural antler ← polished → faceted: the section and the surface together' },
      { k: 'beamLength', label: 'Antler length', min: 40, max: 450, step: 1, u: 'mm' },
      { k: 'beamSpread', label: 'Spread', min: -10, max: 95, step: 1, u: '°', hint: 'How far the antlers lean outward' },
      { k: 'beamCurl', label: 'Curl', min: -60, max: 180, step: 1, u: '°', hint: 'How far the beams arc forward along their length' },
      { k: 'tineCount', label: 'Points', min: 0, max: 9, step: 1, u: '', hint: 'Tines along each beam' },
      { k: 'tineScale', label: 'Tine length', min: 0.4, max: 1.8, step: 0.05, u: '×', hint: 'All the tines together: along the beam, brow and crown points' },
      { k: 'browTine', label: 'Brow tine', type: 'bool' },
      { k: 'mount', label: 'Base style', type: 'select', only: 'headband', options: [['tunnel', 'Flared · slide-on'], ['clip', 'Flared · snap-on'], ['flat', 'Flared · glue-on'], ['none', 'Burr only, flat cut'], ['skull', 'On a skull cap (3 parts)']] },
      { k: 'hbWidth', label: 'Headband width', min: 3, max: 40, step: 0.5, u: 'mm', only: 'headband', hint: 'Measure your band: the base is sized to fit it' },
    ] },
    { group: 'Antler form', tier: 'details', items: [
      { k: 'thickness', label: 'Thickness', min: 0.6, max: 1.6, step: 0.05, u: '×', hint: 'The whole beam, base to tip' },
      { k: 'beamTaper', label: 'Taper', min: 0, max: 0.8, step: 0.01, u: '', hint: 'How much the beam thins toward the tip' },
      { k: 'beamLean', label: 'Lean', min: -80, max: 40, step: 1, u: '°', hint: 'Back ← → forward' },
      { k: 'beamInCurl', label: 'Tip curl', min: -160, max: 40, step: 1, u: '°', hint: 'The tips turning inward (−) or outward (+)' },
      { k: 'wildness', label: 'Wildness', min: 0, max: 2, step: 0.05, u: '×', hint: 'Kinks, wander and natural irregularity (0 is perfectly calm)' },
    ] },
    { group: 'Tines & points', tier: 'details', items: [
      { k: 'tineDir', label: 'Tines point', type: 'select', options: [['up', 'Up'], ['forward', 'Forward'], ['alternate', 'Alternating'], ['outward', 'In / out'], ['spiral', 'Spiral']] },
      { k: 'tineAngle', label: 'Angle off the beam', min: 15, max: 110, step: 1, u: '°' },
      { k: 'tineCurve', label: 'Curve upward', min: -40, max: 90, step: 1, u: '°' },
      { k: 'tineFan', label: 'Fan', min: -30, max: 40, step: 1, u: '°', hint: 'How much the tines spread apart' },
      { k: 'tineStart', label: 'First tine at', min: 0.05, max: 0.9, step: 0.01, u: 'of beam', pct: true },
      { k: 'tineEnd', label: 'Last tine at', min: 0.1, max: 0.97, step: 0.01, u: 'of beam', pct: true },
      { k: 'browDir', label: 'Brow tine points', type: 'select', options: [['forward', 'Forward'], ['up', 'Up']] },
      { k: 'crownCount', label: 'Crown points', min: 0, max: 9, step: 1, u: '', hint: 'Points gathered at the top of the beam' },
      { k: 'crownShape', label: 'Crown points form', type: 'select', options: [['cup', 'Cup'], ['fan', 'Fan / palm']] },
      { k: 'palmation', label: 'Palmation', min: 0, max: 1, step: 0.05, u: '', hint: 'Webbing between the crown points (moose)' },
      { k: 'forkDepth', label: 'Forking', min: 0, max: 3, step: 1, u: '', hint: 'Levels of forked tips' },
    ] },
    // the skull cap (base style 'skull'): shown only when it's chosen
    { group: 'Skull cap', tier: 'details', only: 'skull', items: [
      { k: 'capLength', label: 'Front reach', min: 30, max: 110, step: 1, u: 'mm', hint: 'How far the plate runs forward from the antlers, to its point' },
      { k: 'capSnoutWidth', label: 'Front width', min: 0.6, max: 1.6, step: 0.05, u: '×', hint: 'How wide the plate stays on its way to the point' },
      { k: 'capTaper', label: 'Point', min: 0, max: 1, step: 0.05, u: '', hint: 'A broad, blunt point ← → a long, thin one' },
      { k: 'capJag', label: 'Jagged edge', min: 0, max: 1, step: 0.05, u: '', hint: 'How big the broken points round the edge are (Surprise me gives a new edge)' },
      { k: 'capBack', label: 'Back reach', min: 20, max: 100, step: 1, u: 'mm', hint: 'How far the plate reaches back behind the antlers' },
      { k: 'capWidth', label: 'Width beyond the antlers', min: -6, max: 60, step: 1, u: 'mm', hint: 'How far the plate reaches out past the antlers to each side, down the sides of the head' },
      { k: 'capSpacing', label: 'Antler spacing', min: 60, max: 110, step: 1, u: 'mm', hint: 'Between the centres of the two antlers (a deer’s is about 3 in)' },
      { k: 'capPedicle', label: 'Pedicle height', min: 4, max: 24, step: 0.5, u: 'mm', hint: 'The stumps of bone the antlers stand on' },
      { k: 'capBand', label: 'Headband', type: 'select', options: [['band', 'Flat band, glued in a groove'], ['wires', 'Double wire, clamped in strips']], hint: 'A flat band glues into a groove under the cap. A double-wire band’s two wires each lie in a channel under the cap, and a thin strip glues in over each from underneath, set into the cap so no seam shows.' },
      { k: 'wireDia', label: 'Wire thickness', min: 1.5, max: 5, step: 0.05, u: 'mm', hint: 'Across the wire (⅛ in is 3.2 mm). Its channel is this plus the Fit clearance.' },
      { k: 'wireFront', label: 'Front wire, at the top', min: -20, max: 100, step: 1, u: 'mm', hint: 'Where the front wire crosses the top of your head: how far in front of the antlers, along the head (negative is behind them).' },
      { k: 'wireBack', label: 'Back wire, at the top', min: -20, max: 80, step: 1, u: 'mm', hint: 'Where the back wire crosses the top of your head: how far behind the antlers, along the head (negative is in front of them).' },
      { k: 'wireEarGap', label: 'Wires apart above the ears', min: 0, max: 80, step: 1, u: 'mm', hint: 'How far apart the two wires are just above your ears, where they come down toward each other. It sets how they curve across the cap.' },
      { k: 'capTie', label: 'Ribbon slot behind the antlers', type: 'bool', hint: 'A slot each side, behind the band, for ½ in ribbon: up through it and back down over the plate’s edge. Tie the ribbons under your chin or behind your head to hold the plate down so the antlers can’t rock it.' },
      { k: 'capTieFront', label: 'Ribbon slot in front of the antlers', type: 'bool', hint: 'A slot each side, in front of the band. With both, a ribbon each way holds the plate from rocking forward or back.' },
      { k: 'capPins', label: 'Bobby-pin grooves', type: 'bool', hint: 'Four grooves in the top at the plate’s edge, two in front and two behind: a bobby pin slid onto the edge at each, its top prong in the groove, holds the plate to your hair.' },
    ] },
    { group: 'Surface', tier: 'details', items: [
      { k: 'burr', label: 'Burr (coronet)', type: 'bool', hint: 'The knobbly ring at the antler\'s base' },
    ] },
    { group: 'Crown', tier: 'details', only: 'crown', items: [
      { k: 'ringBase', label: 'Crown base', type: 'select', only: 'crown', options: [['closed', 'Closed ring'], ['openBack', 'Open at the back'], ['openFront', 'Open at the front']] },
      { k: 'ringGap', label: 'Opening', min: 30, max: 140, step: 1, u: '°', only: 'crown' },
      { k: 'ringPos', label: 'Antler position', min: 20, max: 85, step: 1, u: '°', only: 'crown', hint: 'Degrees round from the centre of the forehead' },
      { k: 'ornament', label: 'Ornament size', min: 0.6, max: 1.5, step: 0.05, u: '×', hint: 'The crown\'s decoration, relative to the antlers' },
      { k: 'ringThick', label: 'Band thickness', min: 5, max: 16, step: 0.5, u: 'mm' },
      { k: 'ringDip', label: 'Brow dip', min: 0, max: 35, step: 1, u: 'mm', hint: 'How far the band comes down to a point on the forehead' },
      { k: 'ringRise', label: 'Temple rise', min: 0, max: 30, step: 1, u: 'mm', hint: 'How high the band lifts where the antlers stand' },
      { k: 'ringDrop', label: 'Back drop', min: 0, max: 30, step: 1, u: 'mm', hint: 'How low the band settles at the back' },
      { k: 'ringAsym', label: 'Asymmetry', min: 0, max: 1, step: 0.05, u: '', hint: '0 mirrors the left and right sides exactly' },
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
      { k: 'pegFit', label: 'Peg fit', min: 0, max: 0.8, step: 0.05, u: 'mm', hint: 'How much bigger each antler’s socket is than the skull cap’s peg, across. 0.2 mm slides on with a little friction, leaving room for glue (tested on a Bambu P2S in PLA). If yours is tight or loose, change it in steps of 0.05 mm.' },
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
    // Set by each species and kept in design files, but not shown on the page: the combined controls above
    // cover them (Tine length, Thickness, Wildness, Texture, Ornament size) or they made too little difference
    // to earn a control. The CLI still takes them as flags.
    { group: 'Species settings', tier: 'hidden', items: [
      { k: 'tineLength', label: 'Longest tine', min: 10, max: 240, step: 1, u: 'mm' },
      { k: 'baseDia', label: 'Base diameter', min: 8, max: 45, step: 0.5, u: 'mm' },
      { k: 'tipDia', label: 'Tip diameter', min: 2.5, max: 16, step: 0.5, u: 'mm', hint: '⅛ in or more survives handling' },
      { k: 'curlBias', label: 'Curl toward tip', min: 0.4, max: 3, step: 0.05, u: '×' },
      { k: 'beamArms', label: 'Beam bend', type: 'arms', hint: 'The species’ own tangent arms on the beam (as Fine-tune’s): base x y z, then tip x y z, in beam lengths, head frame' },
      { k: 'inCurlBias', label: 'Tip curl toward tip', min: 0.4, max: 4, step: 0.05, u: '×', hint: 'Above 1, the beam runs out straight and turns in near its end' },
      { k: 'wobble', label: 'Kinks & wander', min: 0, max: 1, step: 0.05, u: '', hint: 'Low values read as sculpted, high as wild' },
      { k: 'tineCrest', label: 'Longest tine at', min: 0, max: 1, step: 0.05, u: '', pct: true, hint: 'Tine tips follow a smooth arch that peaks here' },
      { k: 'tineTaper', label: 'Arch falloff', min: 0, max: 0.9, step: 0.05, u: '' },
      { k: 'tineRhythm', label: 'Spacing rhythm', min: 0.5, max: 1.6, step: 0.05, u: '', hint: 'Below 1 packs tines closer toward the tip' },
      { k: 'tineInward', label: 'Lean inward', min: -20, max: 40, step: 1, u: '°' },
      { k: 'tineThick', label: 'Tine thickness', min: 0.35, max: 1, step: 0.01, u: '× beam' },
      { k: 'browLength', label: 'Brow length', min: 10, max: 180, step: 1, u: 'mm' },
      { k: 'browAngle', label: 'Brow angle', min: 20, max: 115, step: 1, u: '°' },
      { k: 'browPos', label: 'Brow height', min: 0.02, max: 0.3, step: 0.01, u: 'of beam', pct: true },
      { k: 'crownLength', label: 'Crown length', min: 10, max: 140, step: 1, u: 'mm' },
      { k: 'forkAngle', label: 'Fork angle', min: 10, max: 70, step: 1, u: '°' },
      { k: 'forkTines', label: 'Fork the tines too', type: 'bool' },
      { k: 'ovality', label: 'Oval cross-section', min: 0, max: 0.45, step: 0.01, u: '' },
      { k: 'grooveDepth', label: 'Gutter depth', min: 0, max: 2, step: 0.05, u: 'mm' },
      { k: 'grooveCount', label: 'Gutters around', min: 3, max: 18, step: 1, u: '' },
      { k: 'pearling', label: 'Pearling near base', min: 0, max: 3, step: 0.05, u: 'mm' },
      { k: 'burrSize', label: 'Burr size', min: 1, max: 8, step: 0.25, u: 'mm' },
      { k: 'fillet', label: 'Junction fillet', min: 0.5, max: 10, step: 0.25, u: 'mm' },
      { k: 'smoothing', label: 'Surface smoothing', min: 0, max: 8, step: 1, u: '' },
      { k: 'ringStrands', label: 'Beams', min: 1, max: 3, step: 1, u: '', hint: '1: the band · 2: plus a sweep from the brow past each antler · 3: plus open loops' },
      { k: 'ringWeave', label: 'Loops', min: 1, max: 5, step: 1, u: '' },
      { k: 'ringTines', label: 'Tines on the band', min: 0, max: 18, step: 1, u: '' },
      { k: 'ringTineStyle', label: 'Band tines', type: 'select', options: [['spike', 'Upswept spikes'], ['fork', 'Forked'], ['sweep', 'Swept back'], ['cluster', 'Clusters'], ['paddle', 'Paddles'], ['tendril', 'Tendrils'], ['button', 'Buttons']] },
      { k: 'ringTineLength', label: 'Band tine length', min: 5, max: 90, step: 1, u: 'mm' },
      { k: 'ringFront', label: 'Brow piece', type: 'select', options: [['none', 'None'], ['point', 'Point'], ['shovel', 'Shovel']], hint: 'At the centre of the forehead (not on a crown open at the front)' },
      { k: 'ringSweepLift', label: 'Sweep lift', min: 0, max: 45, step: 1, u: 'mm', hint: 'How high the sweep climbs past each antler' },
      { k: 'ringSweepReach', label: 'Sweep reach', min: 15, max: 100, step: 1, u: '°', hint: 'How far the sweep runs on past each antler' },
      { k: 'ringLoopDepth', label: 'Loop depth', min: 4, max: 30, step: 1, u: 'mm' },
      { k: 'ringTaper', label: 'Band taper', min: 0, max: 0.8, step: 0.05, u: '', hint: 'Heavy at the front, thinner toward the back' },
      { k: 'ringTineLean', label: 'Tine lean', min: 0, max: 1.5, step: 0.05, u: '', hint: 'Upright, or flowing back with the beams' },
      { k: 'ringWander', label: 'Organic variation', min: 0, max: 1, step: 0.05, u: '', hint: 'How much the beams wander and the tines vary' },
      { k: 'jitter', label: 'Natural variation', min: 0, max: 1, step: 0.05, u: '' },
      { k: 'seed', label: 'Variation seed', min: 1, max: 9999, step: 1, u: '' },
      { k: 'tweaks', label: 'Fine-tuning', type: 'tweaks', hint: 'Per-branch adjustments from the Fine-tune view, in the design file' },
    ] },
  ];

  // Angles are in the HEAD frame: 0° spread = straight up from the crown of the head,
  // regardless of where the base sits on the band.
  const DEFAULTS = {
    preset: 'whitetail',
    beamLength: 310, baseDia: 28, beamTaper: 0.46, tipDia: 5, beamLean: -26, beamCurl: 118, curlBias: 1.45, inCurlBias: 1, beamArms: [0, 0, 0, 0, 0, 0], beamSpread: 66, beamInCurl: -108, wobble: 0.12,
    tineCount: 3, tineDir: 'up', tineStart: 0.34, tineEnd: 0.76, tineLength: 120, tineCrest: 0.4, tineTaper: 0.4, tineRhythm: 0.9, tineAngle: 80, tineFan: 14, tineCurve: 20, tineInward: 10, tineThick: 0.72,
    browTine: true, browDir: 'up', browLength: 44, browAngle: 74, browPos: 0.1,
    crownCount: 0, crownShape: 'cup', crownLength: 50, palmation: 0, forkDepth: 0, forkAngle: 32, forkTines: false,
    jitter: 0.08, seed: 7,
    ovality: 0.12, grooveDepth: 0.45, grooveCount: 9, pearling: 0.45, burr: true, burrSize: 3.5, fillet: 5, smoothing: 3,
    mount: 'tunnel', baseFlare: 1.65, baseHeight: 15, padLength: 44, hbWidth: 12, hbThick: 3, hbRadius: 85, clearance: 0.4, pegFit: 0.2, wall: 2.2, capBand: 'band', wireDia: 3.175, wireFront: 28, wireBack: 28, wireEarGap: 35,
    bandAngle: 34, splay: 0, rake: 0,
    filament: 'bone', autoFit: true, scale: 0.62, resolution: '0.5', bedX: 256, bedY: 256, bedZ: 256,
    style: 'headband', headSource: 'tape', headScan: '', headCirc: 571.5, headMeasured: false, headArcFB: 285.75, headArcEE: 254, ringBase: 'closed', ringGap: 70, ringPos: 50, ringFit: 10, ringTilt: 10,
    ringRise: 9, ringDrop: 7, ringSweepLift: 20, ringSweepReach: 55, ringLoopDepth: 14, ringTaper: 0.45, ringTineLean: 0.6, ringWander: 0.3, ringAsym: 0,
    ringThick: 9, ringStrands: 3, ringWeave: 2, ringDip: 18, ringTines: 8, ringTineStyle: 'spike', ringTineLength: 26, ringFront: 'point',
    character: 0.3, ringPattern: 'band',   // 0.3: natural antler (the antlers as they have always been); species set their own
    tineScale: 1, thickness: 1, wildness: 1, ornament: 1,   // combined controls: ×1 is the species' own design
    tweaks: {},   // Fine-tune: { branch id: { rot: rotation vector (rad, head frame), len: ×, thick: ×, s: where it leaves its parent, a0/a1: tangent arms } }
    capTie: false, capTieFront: false, capPins: false, capLength: 66, capBack: 60, capWidth: 40, capSpacing: 80, capPedicle: 5,   // the skull cap
    capSnoutWidth: 1, capTaper: 0.5, capJag: 0.6,                                            // its front and edge
  };

  // Tuned for silhouette first: a smooth curl, tine tips on one arch, calm surfaces.
  const PRESETS = {
    whitetail: { label: 'Whitetail', p: { character: 0.3, ringPattern: 'fleur' } },
    mule: { label: 'Mule deer', p: { character: 0.3, ringPattern: 'fleur', ringStrands: 3, ringWeave: 1, ringDip: 14, ringLoopDepth: 10, ringTines: 6, ringTineStyle: 'fork', ringTineLength: 30, ringFront: 'none', beamLength: 260, baseDia: 28, beamTaper: 0.34, tipDia: 5, beamLean: -14, beamCurl: 34, curlBias: 1.2, beamSpread: 56, beamInCurl: -62, tineCount: 0, browTine: true, browDir: 'up', browLength: 28, browAngle: 62, browPos: 0.08, forkDepth: 2, forkAngle: 50, tineCurve: 8, tineInward: 4, fillet: 3, scale: 0.64 } },
    elk: { label: 'Elk', p: { character: 0.3, ringPattern: 'fleur', ringStrands: 2, ringWeave: 1, ringDip: 12, ringRise: 12, ringSweepReach: 75, ringTineLean: 1, ringTines: 6, ringTineStyle: 'sweep', ringTineLength: 40, ringFront: 'none', beamLength: 420, baseDia: 34, beamTaper: 0.42, tipDia: 6, beamLean: -46, beamCurl: 80, curlBias: 1.6, beamSpread: 44, beamInCurl: -52, wobble: 0.15, tineCount: 4, tineDir: 'forward', tineStart: 0.16, tineEnd: 0.74, tineLength: 150, tineCrest: 0.55, tineTaper: 0.35, tineRhythm: 0.95, tineAngle: 60, tineFan: 18, tineCurve: 34, tineInward: 6, tineThick: 0.7, browTine: true, browDir: 'forward', browLength: 130, browAngle: 80, browPos: 0.045, ovality: 0.16, grooveDepth: 0.55, pearling: 0.55, burrSize: 4.5, scale: 0.5 } },
    reindeer: { label: 'Reindeer', p: { character: 0.3, ringPattern: 'circlet', ringStrands: 3, ringWeave: 2, ringDip: 8, ringSweepLift: 26, ringTines: 8, ringTineStyle: 'spike', ringTineLength: 22, ringFront: 'shovel', beamLength: 380, baseDia: 25, beamTaper: 0.32, tipDia: 5, beamLean: -50, beamCurl: 150, curlBias: 1.5, beamSpread: 40, beamInCurl: -58, wobble: 0.15, tineCount: 2, tineDir: 'alternate', tineStart: 0.3, tineEnd: 0.52, tineLength: 70, tineCrest: 0.5, tineTaper: 0.2, tineAngle: 58, tineFan: 0, tineCurve: 20, tineInward: 6, tineThick: 0.7, browTine: true, browDir: 'forward', browLength: 90, browAngle: 95, browPos: 0.07, crownCount: 4, crownShape: 'fan', crownLength: 55, palmation: 0.3, ovality: 0.26, grooveDepth: 0.35, pearling: 0.3, burrSize: 3.2, scale: 0.56 } },
    stag: { label: 'Red stag', p: { character: 0.3, ringPattern: 'fleur', ringStrands: 3, ringWeave: 2, ringDip: 20, ringRise: 14, ringTines: 4, ringTineStyle: 'cluster', ringTineLength: 24, ringFront: 'point', beamLength: 360, baseDia: 32, beamTaper: 0.4, tipDia: 5.5, beamLean: -34, beamCurl: 70, curlBias: 1.3, beamSpread: 46, beamInCurl: -58, tineCount: 2, tineDir: 'forward', tineStart: 0.12, tineEnd: 0.4, tineLength: 110, tineCrest: 0.2, tineTaper: 0.2, tineAngle: 66, tineFan: 8, tineCurve: 36, tineInward: 8, tineThick: 0.72, browTine: true, browDir: 'forward', browLength: 112, browAngle: 82, browPos: 0.05, crownCount: 4, crownShape: 'cup', crownLength: 70, palmation: 0, ovality: 0.14, grooveDepth: 0.55, pearling: 0.6, burrSize: 4.5, scale: 0.53 } },
    moose: { label: 'Moose', p: { character: 0.3, ringPattern: 'band', ringStrands: 1, ringWeave: 1, ringDip: 6, ringRise: 4, ringDrop: 4, ringTaper: 0.2, ringWander: 0.15, ringThick: 12, ringTines: 6, ringTineStyle: 'paddle', ringTineLength: 24, ringFront: 'none', beamLength: 170, baseDia: 32, beamTaper: 0.15, tipDia: 6, beamLean: -12, beamCurl: 25, curlBias: 1, beamSpread: 72, beamInCurl: -5, wobble: 0.1, tineCount: 1, tineDir: 'forward', tineStart: 0.22, tineEnd: 0.22, tineLength: 55, tineCrest: 0.5, tineTaper: 0, tineAngle: 70, tineFan: 0, tineCurve: 20, tineInward: 0, tineThick: 0.7, browTine: false, crownCount: 8, crownShape: 'fan', crownLength: 115, palmation: 1, ovality: 0.4, grooveDepth: 0.3, pearling: 0.3, burrSize: 4, fillet: 6, scale: 0.55 } },
    spirit: { label: 'Forest spirit', p: { character: 0.2, ringPattern: 'spines', ringStrands: 3, ringWeave: 3, ringDip: 22, ringLoopDepth: 18, ringWander: 0.75, ringAsym: 0.3, ringTines: 10, ringTineStyle: 'tendril', ringTineLength: 34, ringFront: 'none', beamLength: 320, baseDia: 25, beamTaper: 0.52, tipDia: 4, beamLean: -10, beamCurl: 64, curlBias: 1.6, beamSpread: 52, beamInCurl: -96, wobble: 0.45, tineCount: 7, tineDir: 'spiral', tineStart: 0.14, tineEnd: 0.9, tineLength: 90, tineCrest: 0.35, tineTaper: 0.55, tineRhythm: 0.85, tineAngle: 50, tineFan: 20, tineCurve: 42, tineInward: 12, tineThick: 0.72, browTine: false, forkDepth: 1, forkAngle: 28, forkTines: true, jitter: 0.3, seed: 21, ovality: 0.08, grooveDepth: 0.3, pearling: 0.15, fillet: 6, scale: 0.55 } },
    fawn: { label: 'Fawn nubs', p: { character: 0.3, ringPattern: 'band', ringStrands: 1, ringWeave: 1, ringDip: 6, ringRise: 3, ringDrop: 3, ringTaper: 0.1, ringWander: 0.15, ringTines: 12, ringTineStyle: 'button', ringTineLength: 8, ringFront: 'none', beamLength: 20, baseDia: 30, beamTaper: 0.3, tipDia: 18, baseHeight: 10, baseFlare: 1.6, beamLean: -10, beamCurl: 15, curlBias: 1, beamSpread: 30, beamInCurl: 0, wobble: 0.1, tineCount: 0, browTine: false, grooveDepth: 0.6, grooveCount: 11, pearling: 0.7, burrSize: 3, scale: 0.8 } },
    // The campfire set (the wilderness page): loosely after the found-bone headpieces in Yellowjackets. Small,
    // irregular, weathered antlers rather than trophy racks. `set` keeps them off the storybook page.
    // Trial crown, after the crown in the trial: upright and close-set, a low point, a tine part-way up, a fork at the top
    trial: { label: 'Trial crown', set: 'campfire', p: { character: 0.16, ringPattern: 'band', beamLength: 212, baseDia: 31, beamTaper: 0.4, tipDia: 6, beamLean: -12, beamCurl: 56, curlBias: 1.3, beamSpread: 34, beamInCurl: -22, wobble: 0.4, tineCount: 1, tineDir: 'outward', tineStart: 0.46, tineEnd: 0.46, tineLength: 64, tineTaper: 0, tineAngle: 52, tineCurve: 26, tineInward: 4, tineThick: 0.74, browTine: true, browDir: 'forward', browLength: 22, browAngle: 70, browPos: 0.1, forkDepth: 1, forkAngle: 30, jitter: 0.35, seed: 96, ovality: 0.16, grooveDepth: 0.75, grooveCount: 8, pearling: 0.85, burrSize: 5, scale: 0.66 } },
    lyre: { label: 'Queen’s lyre', set: 'campfire', p: { character: 0.3, ringPattern: 'band', beamLength: 330, baseDia: 21, beamTaper: 0.5, tipDia: 4.5, beamLean: -6, beamCurl: 26, curlBias: 1.6, beamSpread: 34, beamInCurl: -78, wobble: 0.16, tineCount: 2, tineDir: 'outward', tineStart: 0.4, tineEnd: 0.62, tineLength: 48, tineCrest: 0.5, tineTaper: 0.2, tineAngle: 42, tineFan: 0, tineCurve: 34, tineInward: -6, tineThick: 0.7, browTine: false, jitter: 0.12, seed: 31, ovality: 0.1, grooveDepth: 0.4, pearling: 0.35, burrSize: 3.5, scale: 0.6 } },
    spikes: { label: 'Spikes', set: 'campfire', p: { character: 0.24, ringPattern: 'band', beamLength: 150, baseDia: 23, beamTaper: 0.55, tipDia: 4, beamLean: -24, beamCurl: 84, curlBias: 1.8, beamSpread: 30, beamInCurl: -44, wobble: 0.22, tineCount: 1, tineDir: 'up', tineStart: 0.5, tineEnd: 0.5, tineLength: 26, tineTaper: 0, tineAngle: 48, tineCurve: 30, tineThick: 0.66, browTine: false, jitter: 0.2, seed: 13, ovality: 0.12, grooveDepth: 0.55, grooveCount: 7, pearling: 0.6, burrSize: 4, scale: 0.72 } },
    // after reference photos of whitetail and mule deer bucks: a typical 10-point rack, one in velvet, a young
    // forkhorn, and a mule buck's forked points
    buck: { label: 'Typical buck', set: 'campfire', p: { character: 0.3, ringPattern: 'band', beamLength: 340, baseDia: 30, beamTaper: 0.46, tipDia: 5, beamLean: -28, beamCurl: 122, curlBias: 1.4, beamSpread: 70, beamInCurl: -112, wobble: 0.14, tineCount: 4, tineDir: 'up', tineStart: 0.28, tineEnd: 0.8, tineLength: 128, tineCrest: 0.35, tineTaper: 0.45, tineRhythm: 0.95, tineAngle: 84, tineFan: 10, tineCurve: 18, tineInward: 8, tineThick: 0.7, browTine: true, browDir: 'up', browLength: 40, browAngle: 72, browPos: 0.09, jitter: 0.1, seed: 41, ovality: 0.14, grooveDepth: 0.5, grooveCount: 9, pearling: 0.55, burrSize: 4, scale: 0.6 } },
    // fitted to a photo of a typical whitetail eight-pointer, front on, and a whitetail's side profile (2026-10-04): the
    // beam runs out and back, then sweeps forward in a long low arc so its tip points in (beamArms shape that arc); a
    // tall G2 and a shorter G3 standing up off its top, a short upright brow
    eightpoint: { label: '8-point whitetail', set: 'campfire', p: { character: 0.3, ringPattern: 'band', beamLength: 272, baseDia: 19, beamTaper: 0.46, tipDia: 5, beamLean: -19, beamCurl: 139, curlBias: 2.11, inCurlBias: 1.47, beamArms: [0.82, -0.53, 0.71, 0.04, 0.35, 0.97], beamSpread: 53, beamInCurl: -108, wobble: 0.05, tineCount: 2, tineDir: 'up', tineStart: 0.61, tineEnd: 0.72, tineLength: 96, tineCrest: 0, tineTaper: 0.74, tineRhythm: 1, tineAngle: 56, tineFan: 0, tineCurve: 60, tineInward: -7, tineThick: 0.62, browTine: true, browDir: 'up', browLength: 47, browAngle: 70, browPos: 0.03, jitter: 0.04, seed: 41, ovality: 0.14, grooveDepth: 0.5, grooveCount: 9, pearling: 0.55, burrSize: 4, scale: 0.7 } },
    velvet: { label: 'Velvet buck', set: 'campfire', p: { character: 0.5, ringPattern: 'band', beamLength: 270, baseDia: 34, beamTaper: 0.28, tipDia: 13, beamLean: -24, beamCurl: 104, curlBias: 1.3, beamSpread: 62, beamInCurl: -92, wobble: 0.1, tineCount: 3, tineDir: 'up', tineStart: 0.3, tineEnd: 0.72, tineLength: 88, tineCrest: 0.35, tineTaper: 0.35, tineAngle: 78, tineFan: 8, tineCurve: 16, tineInward: 6, tineThick: 0.86, browTine: true, browDir: 'up', browLength: 30, browAngle: 70, browPos: 0.1, jitter: 0.08, seed: 17, ovality: 0.08, grooveDepth: 0, pearling: 0, burr: false, fillet: 7, scale: 0.62 } },
    forkhorn: { label: 'Forkhorn', set: 'campfire', p: { character: 0.3, ringPattern: 'band', beamLength: 200, baseDia: 22, beamTaper: 0.45, tipDia: 4.5, beamLean: -24, beamCurl: 84, curlBias: 1.4, beamSpread: 54, beamInCurl: -72, wobble: 0.18, tineCount: 1, tineDir: 'up', tineStart: 0.56, tineEnd: 0.56, tineLength: 62, tineTaper: 0, tineAngle: 70, tineCurve: 22, tineInward: 6, tineThick: 0.7, browTine: true, browDir: 'up', browLength: 16, browAngle: 68, browPos: 0.09, jitter: 0.14, seed: 9, ovality: 0.12, grooveDepth: 0.45, pearling: 0.45, burrSize: 3.5, scale: 0.68 } },
    mulebuck: { label: 'Mule buck', set: 'campfire', p: { character: 0.25, ringPattern: 'band', beamLength: 280, baseDia: 29, beamTaper: 0.36, tipDia: 5, beamLean: -14, beamCurl: 48, curlBias: 1.2, beamSpread: 58, beamInCurl: -64, wobble: 0.2, tineCount: 0, browTine: true, browDir: 'up', browLength: 22, browAngle: 62, browPos: 0.08, forkDepth: 2, forkAngle: 44, tineCurve: 10, tineInward: 4, jitter: 0.16, seed: 58, ovality: 0.14, grooveDepth: 0.6, pearling: 0.6, burrSize: 4.2, fillet: 3, scale: 0.62 } },
    feral: { label: 'Non-typical', set: 'campfire', p: { character: 0.08, ringPattern: 'band', beamLength: 270, baseDia: 29, beamTaper: 0.4, tipDia: 5.5, beamLean: -20, beamCurl: 58, curlBias: 1.2, beamSpread: 52, beamInCurl: -50, wobble: 0.7, tineCount: 6, tineDir: 'spiral', tineStart: 0.2, tineEnd: 0.86, tineLength: 58, tineCrest: 0.4, tineTaper: 0.35, tineRhythm: 0.85, tineAngle: 82, tineFan: 34, tineCurve: 6, tineInward: 4, tineThick: 0.7, browTine: true, browDir: 'forward', browLength: 34, browAngle: 84, browPos: 0.08, forkDepth: 1, forkAngle: 34, forkTines: true, jitter: 0.7, seed: 666, ovality: 0.18, grooveDepth: 0.9, grooveCount: 8, pearling: 1.1, burrSize: 5.5, scale: 0.6 } },
  };

  // Crown designs retired in the controls review (2026-09-28), and the nearest one that's left
  const RETIRED = { tiara: 'fleur', lyre: 'fleur', whiplash: 'fleur', kokoshnik: 'fleur', laurel: 'circlet', sunburst: 'spines', loops: 'lattice', weave: 'lattice' };
  const COUNTS = ['tineCount', 'crownCount', 'forkDepth', 'ringStrands', 'ringWeave', 'ringTines', 'grooveCount', 'seed', 'smoothing'];   // whole numbers
  // Fine-tune adjustments, as saved: only known shapes and sensible ranges survive (a design file is outside data).
  const TWEAK_ID = /^(beam|brow|t\d|c\d)(\/\d){0,4}$/;
  const ARM_MAX = 2;   // a tangent arm's change, per component, in branch lengths
  function cleanTweaks(t) {
    const out = {};
    if (!t || typeof t !== 'object') return out;
    const num = (v, a, b, d) => { const x = Number(v); return isFinite(x) && v !== null && v !== '' ? clamp(x, a, b) : d; };
    for (const id of Object.keys(t).slice(0, 80)) {
      const w = t[id];
      if (!TWEAK_ID.test(id) || !w || typeof w !== 'object') continue;
      const rot = Array.isArray(w.rot) && w.rot.length === 3 ? w.rot.map((v) => num(v, -Math.PI, Math.PI, 0)) : [0, 0, 0];
      const c = { rot, len: num(w.len, 0.3, 2.5, 1), thick: num(w.thick, 0.4, 2.5, 1), s: w.s == null ? null : num(w.s, 0.02, 0.97, null) };
      for (const k of ['a0', 'a1']) {   // the tangent arms (kept only when they bend the branch)
        const a = Array.isArray(w[k]) && w[k].length === 3 ? w[k].map((v) => num(v, -ARM_MAX, ARM_MAX, 0)) : null;
        if (a && vlen(a) > 1e-6) c[k] = a;
      }
      if (vlen(rot) > 1e-6 || c.len !== 1 || c.thick !== 1 || c.s != null || c.a0 || c.a1) out[id] = c;
    }
    return out;
  }
  function cleanArms(a) {   // six numbers (an array, or a comma list from the CLI), each within ±ARM_MAX
    const v = typeof a === 'string' ? a.split(',') : Array.isArray(a) ? a : [];
    return [0, 1, 2, 3, 4, 5].map((i) => { const x = Number(v[i]); return isFinite(x) && v[i] !== null && v[i] !== '' ? clamp(x, -ARM_MAX, ARM_MAX) : 0; });
  }
  function resolveParams(p) {
    if (p && p.character == null && typeof p.ringSculpt === 'number') p = Object.assign({}, p, { character: 0.5 + p.ringSculpt / 2 });   // the old Sculpted slider
    if (p && p.character == null && typeof p.ringCharacter === 'number') p = Object.assign({}, p, { character: p.ringCharacter });   // its crown-only name
    const P = Object.assign({}, DEFAULTS, p || {});
    if (RETIRED[P.ringPattern]) P.ringPattern = RETIRED[P.ringPattern];
    for (const g of PARAM_SPEC) for (const it of g.items) {
      if (it.type === 'text') P[it.k] = String(P[it.k] == null ? DEFAULTS[it.k] : P[it.k]).slice(0, 80);
      else if (it.type === 'tweaks') P[it.k] = cleanTweaks(P[it.k]);
      else if (it.type === 'arms') P[it.k] = cleanArms(P[it.k]);
      else if (it.type === 'bool') P[it.k] = !!P[it.k];
      else if (it.type === 'select') { P[it.k] = String(P[it.k]); if (!it.options.some((o) => o[0] === P[it.k])) P[it.k] = String(DEFAULTS[it.k]); }
      else {
        const v = P[it.k], x = v == null || v === '' || typeof v === 'boolean' ? NaN : Number(v);   // JSON writes NaN as null: treat it as missing
        P[it.k] = clamp(isFinite(x) ? x : DEFAULTS[it.k], it.min, it.max);
        if (COUNTS.includes(it.k)) P[it.k] = Math.round(P[it.k]);
      }
    }
    if (P.tineEnd < P.tineStart) P.tineEnd = P.tineStart;
    return P;
  }

  function presetParams(name, base) {
    const pr = PRESETS[name] || PRESETS.whitetail;
    const keep = {}; // style, fit (headband or head size) and printer settings survive a species change
    if (base) for (const k of ['mount', 'hbWidth', 'hbThick', 'hbRadius', 'clearance', 'pegFit', 'wall', 'resolution', 'bedX', 'bedY', 'bedZ', 'bandAngle', 'filament', 'autoFit', 'smoothing',
      'capTie', 'capTieFront', 'capPins', 'capBand', 'wireDia', 'wireFront', 'wireBack', 'wireEarGap', 'capLength', 'capBack', 'capWidth', 'capSpacing', 'capPedicle', 'capSnoutWidth', 'capTaper', 'capJag', 'style', 'headSource', 'headScan', 'headCirc', 'headMeasured', 'headArcFB', 'headArcEE', 'ringBase', 'ringGap', 'ringPos', 'ringFit', 'ringTilt']) keep[k] = base[k];   // crown shape comes from the species
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

  // Keep an antler on its own side of the head. mid gives the middle of the head in the print frame: a point's distance
  // from it is mid.ox + mid.ex · p, and the other antler is the mirror image. A branch that comes within MID_GAP of the
  // middle (a tip curled in, a Fine-tune turn the sliders have since carried across) is turned outward about its base,
  // with everything growing from it, just far enough to clear. Returns the branches turned, { id: degrees }.
  const MID_GAP = 2;
  function keepClear(branches, mid) {
    const kids = {}, cleared = {};
    for (const br of branches) if (br.parent) (kids[br.parent] = kids[br.parent] || []).push(br);
    const family = (br) => [br].concat(...(kids[br.id] || []).map(family));
    const gap = (br) => { let m = Infinity, w = 0; br.pts.forEach((p, i) => { const g = mid.ox + dot(mid.ex, p) - br.rad[i] - MID_GAP; if (g < m) { m = g; w = i; } }); return { m, w }; };
    for (const br of branches) {   // parents come before their branches
      const g0 = gap(br); if (g0.m >= 0) continue;
      const o = br.pts[0], q = sub(br.pts[g0.w], o), ax = cross(q, mid.ex);
      if (vlen(ax) < 1e-6) continue;
      const k = norm(ax), fam = family(br), turn = (v, th) => rotate(v, k, th);
      const at = (th) => { let m = Infinity; for (const b of fam) b.pts.forEach((p, i) => { m = Math.min(m, mid.ox + dot(mid.ex, add(o, turn(sub(p, o), th))) - b.rad[i] - MID_GAP); }); return m; };
      let lo = 0, hi = Math.PI / 2;
      if (at(hi) < 0) hi = Math.PI / 2;   // as far as it goes
      else for (let it = 0; it < 24; it++) { const th = (lo + hi) / 2; if (at(th) >= 0) hi = th; else lo = th; }
      for (const b of fam) { b.pts = b.pts.map((p) => add(o, turn(sub(p, o), hi))); if (b.F) b.F = turn(b.F, hi); }
      cleared[br.id] = Math.round(hi / DEG);
    }
    return cleared;
  }

  function buildAt(P, S) {
    const rnd = rng(P.seed * 7919 + 13);
    const J = P.jitter, W = P.wobble;
    const jit = (amt) => (rnd() * 2 - 1) * amt * J;
    const UP = [0, 0, 1];
    const so = (P.seed % 97) * 1.37;
    const branches = [];

    // Fine-tune: per-branch adjustments, by branch id (beam, brow, t0…, c0…, and forks: parent id + /n)
    const TW = P.tweaks || {}, tw = (id) => TW[id] || null;
    // Tangent arms: bend a branch between its ends, which stay put, like a Bézier curve's handles. a0 and a1 change the
    // tangent where it leaves its base and where it reaches its tip (in branch lengths, in the head frame before the
    // branch's own turn), added as a cubic Hermite displacement on top of the branch's own curve.
    const bendArms = (br, w) => {
      if (!w || (!w.a0 && !w.a1)) return;
      const A0 = mul(w.a0 || [0, 0, 0], br.length), A1 = mul(w.a1 || [0, 0, 0], br.length);
      br.pts = br.pts.map((p, i) => { const u = i / br.n; return add(p, add(mul(A0, u * (1 - u) * (1 - u)), mul(A1, u * u * (u - 1)))); });
      if (br.d0) br.d0 = norm(sub(br.pts[1], br.pts[0]));
    };
    const turnAbout = (br, o, rv) => {   // turn a swept branch rigidly about the point o by the rotation vector rv
      const ang = vlen(rv); if (ang < 1e-9) return;
      const ax = mul(rv, 1 / ang), r = (v) => rotate(v, ax, ang);
      br.pts = br.pts.map((p) => add(o, r(sub(p, o))));
      if (br.F) br.F = r(br.F); if (br.d0) br.d0 = r(br.d0); if (br.baseT) br.baseT = r(br.baseT);
    };
    const twB = tw('beam');
    const L = P.beamLength * (twB ? twB.len : 1), r0 = (P.baseDia / 2) * (twB ? twB.thick : 1), rt = Math.min(P.tipDia / 2, r0 * 0.8);

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

    // ids, and the Fine-tune adjustments to where each point leaves the beam, its length and thickness
    { let ti = 0, ci = 0; for (const t of plan) { t.id = t.kind === 'brow' ? 'brow' : t.kind === 'tine' ? 't' + ti++ : 'c' + ci++; const w = tw(t.id); if (w) { if (w.s != null) t.s = w.s; t.len *= w.len; t.thick *= w.thick; t.tw = w; } } }

    /* ---- 2. main beam: lean/curl/spread, plus wander and a kink away from each tine */
    const lean = P.beamLean * DEG, curl = P.beamCurl * DEG, spread = P.beamSpread * DEG, incurl = P.beamInCurl * DEG;
    const kinkDeg = (3 + 7 * W) * DEG;
    const bdir = (s) => {
      const pitch = lean + curl * Math.pow(s, P.curlBias) + W * 16 * DEG * (vnoise(s * 3.3 + so, 1.7, 0.3) - 0.5);
      const yaw = spread + incurl * Math.pow(s, P.inCurlBias) + W * 16 * DEG * (vnoise(s * 3.3 + so, 5.1, 3.7) - 0.5);
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
    beam.kind = 'beam'; beam.ov = P.ovality; beam.id = 'beam';
    const BA = P.beamArms || [];
    if (BA.some((v) => v)) bendArms(beam, { a0: BA.slice(0, 3), a1: BA.slice(3, 6) });   // the species' own bend, under any Fine-tuning
    if (twB) { bendArms(beam, twB); turnAbout(beam, [0, 0, 0], twB.rot); }
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
      br.id = t.id; br.parent = 'beam'; br.s0 = t.s;
      if (t.tw) { bendArms(br, t.tw); turnAbout(br, br.pts[0], t.tw.rot); }
      if (t.kind === 'crown') { br.ov = P.ovality + P.palmation * 0.2; }
      sideSum = add(sideSum, perp(br.d0, bt));
      tines.push(br);
    });
    // beam flattens across the plane of its tines
    const mid = sampleAt(beam, 0.5).t;
    beam.F = vlen(sideSum) > 1e-3 ? safeCross(mid, norm(sideSum), [1, 0, 0]) : safeCross(sampleAt(beam, 0.2).t, sampleAt(beam, 0.8).t, [1, 0, 0]);
    if (fan && cc) beam.ov = P.ovality + P.palmation * 0.25;
    for (const t of tines) branches.push(t);

    const forkN = {};   // forks off each branch, numbered in the order they grow: the ids Fine-tune keys on
    function addForks(br, depth, sStart, sign) {
      if (depth <= 0) return;
      const id = br.id + '/' + (forkN[br.id] = (forkN[br.id] || 0) + 1) % 10, w = tw(id);
      let sf = sStart + (1 - sStart) * (sStart === 0 ? 0.42 : 0.3);   // first split low, so the Ys read as equal
      if (w && w.s != null) sf = Math.max(sStart + 0.02, w.s);
      const rem = br.length * (1 - sf);
      if (rem < 10) return;
      const { t } = sampleAt(br, sf);
      let side = perp([0.55 * sign, 0.75 * sign, 0.35], t);
      if (vlen(side) < 0.2) side = perp([sign, 0, 0], t);
      const child = makeTine(br, sf, rem * (0.9 + jit(0.2)) * (w ? w.len : 1), (P.forkAngle + jit(10)) * DEG, side, P.tineCurve * DEG * 0.15, 0.88 * (w ? w.thick : 1), 'fork', depth * 3.1 + sf);
      child.id = id; child.parent = br.id; child.s0 = sf;
      if (w) { bendArms(child, w); turnAbout(child, child.pts[0], w.rot); }
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
    // Fine-tune works in the print frame on screen and stores turns in the head frame: this carries a direction back
    const toHead = ([X, Y, Z]) => { const x = X * Math.cos(sp) - Z * Math.sin(sp), z1 = X * Math.sin(sp) + Z * Math.cos(sp); return [x, Y * Math.cos(rk) + z1 * Math.sin(rk), -Y * Math.sin(rk) + z1 * Math.cos(rk)]; };
    for (const br of branches) {
      br.pts = br.pts.map(place);
      br.rad = br.rad.map((r) => Math.max(r * S, MIN_R));   // no printed tip under 3 mm
      br.length *= S;
      br.F = rot(br.F || [1, 0, 0]);
    }
    // the other antler is this one's mirror image across the middle of the head: keep every branch clear of it
    const ba = P.bandAngle * DEG, midline = P._mid || { ox: (P.hbRadius - mount.tunnelCZ) * Math.sin(ba), ex: [Math.cos(ba), 0, Math.sin(ba)] };
    const cleared = keepClear(branches, midline);
    for (const br of branches) parallelFrames(br);

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
      params: P, scale: S, branches, burr, palm, mount, r0: r0 * S, toHead, cleared,
      texture: { groove: P.grooveDepth * grainOf(P), grooves: P.grooveCount, pearl: P.pearling * grainOf(P) * (1 + gigerOf(P)), knob: gigerOf(P) },
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
    const domeFor = (ia) => {   // the dome height that makes the front-to-back arc come out right (within a real head's proportions)
      let lo = 0.45 * ia, hi = 1.6 * ia;
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
  const STRAND_MIN = 3, TINE_BASE_MIN = 3, TINE_REACH = 12;
  // Form & finish (`character`), for the whole piece: 0 gnarled and biomechanical (Giger), 0.3 natural antler
  // (the species' own grain), ½ polished smooth, 1 faceted: the swept section turns from a circle into a
  // diamond, while the line it's swept along stays a smooth curve. sculptOf is the crown's refined shape
  // language (fair lines, blades, calm), full from 0.3; gigerOf the crown's horror (ribs, hooks), gone by 0.3;
  // grainOf scales the antler grain (gutters, pearling): 1 at 0.3, 0 from ½, deeper and knobblier below 0.3;
  // facetOf the diamond section, from ½ to 1.
  const NATURAL = 0.3;
  const sculptOf = (P) => clamp(P.character / NATURAL, 0, 1), gigerOf = (P) => clamp((NATURAL - P.character) / NATURAL, 0, 1);
  const grainOf = (P) => (P.character <= NATURAL ? 1 + 1.2 * gigerOf(P) : clamp((0.5 - P.character) / (0.5 - NATURAL), 0, 1));
  const facetOf = (P) => clamp((P.character - 0.5) * 2, 0, 1);
  const headN = (g, p) => (g.head.kind === 'scan' ? g.head.normal(p) : norm([p[0] / g.head.r[0] ** 2, p[1] / g.head.r[1] ** 2, (p[2] - g.head.c[2]) / g.head.r[2] ** 2]));
  const RIB = 6.5;   // mm between the vertebra-like ribs along a biomechanical beam
  const DECOR = ['briar', 'spines', 'fleur', 'moon', 'lotus', 'roots'];   // patterns carried by what grows from the two beams (fleur: its strokes are all it has)
  // Circlet: a strap band STRAP_H mm tall (plus a rim along each edge), STRAP_T thick, and small copies of the
  // species' antler (MOTIF of its full size) set along its top edge
  const STRAP_H = 12, STRAP_T = 4.4, MOTIF = 0.28;

  // The band's shape, right half (the left is its mirror image): ring angle t runs from the front
  // (0) to the back (π). It dips to a point on the forehead, rises over the temples where the
  // antlers stand, and settles lower toward the back. Heights are along the head's surface, in mm.
  function halfRange(P, g) {
    return [P.ringBase === 'openFront' ? g.t0 : 0, P.ringBase === 'openBack' ? g.t1 : Math.PI];
  }
  const bandH = (P, g, t) => {
    if (g.bandFn) return g.bandFn(t);   // a flat-template composition draws its own band line
    const dip = P.ringBase === 'openFront' ? 0 : P.ringDip;
    return -dip * Math.exp(-((t / 0.3) ** 2)) + P.ringRise * Math.exp(-(((t - g.tr) / 0.55) ** 2)) - P.ringDrop * sstep((t - g.tr) / (Math.PI - g.tr));
  };
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
  const mirrorX = (br) => { const m = Object.assign({}, br, { pts: br.pts.map((p) => [-p[0], p[1], p[2]]), Fp: br.Fp && br.Fp.map((p) => [-p[0], p[1], p[2]]), F: br.F && [-br.F[0], br.F[1], br.F[2]] }); parallelFrames(m); return m; };

  // Flat-template compositions. A jeweller designs a circlet as a flat template (a front elevation) and bends
  // it round the head; these do the same: strokes are drawn in (s, h), s mm along the band from the brow
  // centre and h mm up from the seat, then wrapped onto the head. Above `stand` mm a stroke rises off the head,
  // leaning back a little, as a tiara's upper parts do, instead of lying on the scalp.
  const bezier = (p0, p1, p2, p3, n) => Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n, a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), d = u ** 3;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
  });
  function flatStroke(g, pts2, rad, o) {
    const Rs = g.inner / (2 * Math.PI), pts = [], Fp = [], nP = pts2.length - 1;
    pts2.forEach(([sArc, h], i) => {
      const hb = o.stand == null ? h : Math.min(h, o.stand), f = pathFrame(g, sArc / Rs, () => hb);
      const lift = (o.lift == null ? 0.8 : o.lift) + (o.liftF ? o.liftF(i / nP) : 0);   // liftF: relief along the stroke (one line over another)
      let p = add(f.Q, mul(f.N, lift + rad[i]));
      if (o.stand != null && h > o.stand) p = add(p, mul(norm(add(mul(f.W, 0.45), [0, 0, 1])), h - o.stand));
      pts.push(p); Fp.push(f.N);
    });
    let len = 0; const acc = [0]; for (let i = 1; i < pts.length; i++) { len += vlen(sub(pts[i], pts[i - 1])); acc.push(len); }
    const GGr = o.GG || 0;   // biomechanical: vertebra-like rings along the stroke
    if (GGr > 0 && !o.noRib) rad = rad.map((r, i) => r * (1 + 0.3 * GGr * Math.pow(0.5 + 0.5 * Math.cos((2 * Math.PI * acc[i]) / RIB), 6)));
    const floor = (i) => (o.free ? STRAND_MIN + (MIN_R - STRAND_MIN) * sstep((i / nP - 0.8) / 0.2) : STRAND_MIN);   // sturdy, fining only at a free tip
    const br = { pts, rad: rad.map((r, i) => Math.max(floor(i), r)), ss: pts.map((_, i) => (o.free ? i / (pts.length - 1) : 0.2)), n: pts.length - 1, length: len, kind: 'ring', F: [0, 0, 1], ov: o.ov || 0.12, sculpt: o.SC || 0, giger: o.GG || 0 };
    if (o.blade) { br.Fp = Fp; br.ov = o.blade; br.keel = o.keel || 0; }   // a blade: wide across the face, thin front to back; keel: a midrib
    parallelFrames(br);
    return br;
  }
  // ---- drawing in the template (s, h mm) ----
  // A fair curve through knots: centripetal Catmull-Rom (no cusps or overshoot), then resampled by arc length,
  // so strokes are smooth and evenly sampled. Optional end tangents (unit 2D vectors) pin how it starts and ends.
  function fair(knots, step, t0, t1) {
    const K = knots.slice(), n = K.length, dense = [];
    const d2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const P = [t0 ? [K[0][0] - t0[0] * d2(K[0], K[1]), K[0][1] - t0[1] * d2(K[0], K[1])] : [2 * K[0][0] - K[1][0], 2 * K[0][1] - K[1][1]]]
      .concat(K, [t1 ? [K[n - 1][0] + t1[0] * d2(K[n - 2], K[n - 1]), K[n - 1][1] + t1[1] * d2(K[n - 2], K[n - 1])] : [2 * K[n - 1][0] - K[n - 2][0], 2 * K[n - 1][1] - K[n - 2][1]]]);
    for (let i = 1; i < P.length - 2; i++) {
      const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      const a = Math.sqrt(d2(p0, p1)) || 1e-6, b = Math.sqrt(d2(p1, p2)) || 1e-6, c = Math.sqrt(d2(p2, p3)) || 1e-6;
      const m1 = [0, 1].map((k) => ((p1[k] - p0[k]) / a - (p2[k] - p0[k]) / (a + b) + (p2[k] - p1[k]) / b) * b);
      const m2 = [0, 1].map((k) => ((p2[k] - p1[k]) / b - (p3[k] - p1[k]) / (b + c) + (p3[k] - p2[k]) / c) * b);
      for (let j = i === 1 ? 0 : 1; j <= 20; j++) {
        const u = j / 20, h00 = 2 * u ** 3 - 3 * u * u + 1, h10 = u ** 3 - 2 * u * u + u, h01 = -2 * u ** 3 + 3 * u * u, h11 = u ** 3 - u * u;
        dense.push([0, 1].map((k) => h00 * p1[k] + h10 * m1[k] + h01 * p2[k] + h11 * m2[k]));
      }
    }
    return resample(dense, step || 2);
  }
  function resample(pl, step) {
    const out = [pl[0]]; let acc = 0;
    for (let i = 1; i < pl.length; i++) {
      let a = pl[i - 1]; const b = pl[i]; let seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      while (acc + seg >= step) { const f = (step - acc) / seg; a = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; out.push(a); seg = Math.hypot(b[0] - a[0], b[1] - a[1]); acc = 0; }
      acc += seg;
    }
    if (Math.hypot(out[out.length - 1][0] - pl[pl.length - 1][0], out[out.length - 1][1] - pl[pl.length - 1][1]) > step * 0.3) out.push(pl[pl.length - 1]);
    return out;
  }
  // A scroll: a logarithmic spiral leaving p along dir, curling to side sgn (+1 left of travel), tightening to
  // `shrink` of its radius per turn: the classic Art Nouveau terminal.
  function scroll(p, dir, r0, turns, sgn, shrink) {
    const b = Math.log(1 / (shrink || 0.4)) / (2 * Math.PI), dl = Math.hypot(dir[0], dir[1]), d = [dir[0] / dl, dir[1] / dl];
    const nrm = [-d[1] * sgn, d[0] * sgn], c = [p[0] + nrm[0] * r0, p[1] + nrm[1] * r0], v0 = [p[0] - c[0], p[1] - c[1]], pts = [];
    for (let th = 0; th <= 2 * Math.PI * turns + 1e-9; th += 0.08) {
      const r = Math.exp(-b * th), cs = Math.cos(sgn * th), sn = Math.sin(sgn * th);
      pts.push([c[0] + r * (v0[0] * cs - v0[1] * sn), c[1] + r * (v0[0] * sn + v0[1] * cs)]);
    }
    return resample(pts, 2);
  }
  const tangentAt = (pl, i) => { const a = pl[Math.max(0, i - 1)], b = pl[Math.min(pl.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };

  // Template compositions (see docs/crown-design-brief.md). All share the band (a V at the brow rising into the
  // antlers, quiet behind) and are proportioned to the antlers' height Ha, so the crown holds its own against them.
  //  fleur: a fleur-de-lis spanning the brow: heart-lobed side petals flowing into the antler bases, an
  //         openwork lancet at the centre framing a pendant drop, and sepal scrolls curling out from its sides.
  function templateBand(P, g, SC, GG, out, pat) {
    const Rs = g.inner / (2 * Math.PI), tr = g.tr, sa = tr * Rs, Ha = Math.max(90, (g.antlerH || 150) * (P._decor || 1)) * (P.ornament || 1);
    const root = Math.max(g.rs * 1.55, 0.75 * (g.rootR || 0), STRAND_MIN * 1.3), hB = (s2) => bandH(P, g, s2 / Rs), hc = hB(0);
    const slope = (s2) => (hB(s2 + 1) - hB(s2 - 1)) / 2;
    const nrm2 = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
    const mk = (pl, rf, o) => flatStroke(g, pl, pl.map((_, i) => rf(i / (pl.length - 1))), Object.assign({ SC, GG }, o));
    const both = (br) => { out.push(br, mirrorX(br)); return br; };
    const leaf = (u, w0, sw) => w0 * (1 + sw * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 1.1)) * ogive(u, 0.62);
    const Hc = Math.max(45, 0.55 * Ha), Hl = Math.max(26, 0.3 * Ha), sec = { blade: 0.32, keel: 0.12 };
    if (pat === 'fleur') {
      // side petals: secondary lines, so thinner and flatter than the band; they leave the band just beside the V
      // (not from the V itself, which would pile five strokes into one blob) and meet it again before the antler
      const se = 0.9 * sa, he = hB(se), sl0 = 0.05 * sa, hl0 = hB(sl0);
      const lobe = fair([[sl0, hl0], [0.1 * sa, hc + 0.62 * Hl], [0.26 * sa, hc + 0.97 * Hl], [0.46 * sa, hc + Hl], [0.69 * sa, hc + 0.68 * Hl], [se, he]], 2, nrm2([0.35, 1]), nrm2([1, slope(se)]));
      // Character reshapes, not just refinishes: elven = flat blades with a midrib; natural = rounder sections;
      // biomechanical = ribbed strokes, hooked barbs along the lobes, a serrated blade and clawed sepals
      const flat = 0.2 + 0.25 * SC, rib = 0.05 + 0.1 * SC;
      g.arch = both(mk(lobe, (u) => root * (0.36 + 0.22 * Math.pow(Math.sin(Math.PI * u), 0.8) + 0.4 * u * u), { stand: hc + 0.72 * Hl, blade: flat, keel: rib }));
      if (GG > 0.15) {   // hooked barbs along the lobe's upper edge, pointing back toward the antler
        const nb = Math.round(2 + 4 * GG);
        for (let i = 0; i < nb; i++) {
          const j = Math.round(((0.2 + (0.6 * (i + 0.5)) / nb)) * (lobe.length - 1)), p0 = lobe[j], t2 = tangentAt(lobe, j), up2 = [-t2[1], t2[0]].map((v) => v * (t2[0] >= 0 ? 1 : -1));
          const Lb = (6 + 10 * GG) * (P._decor || 1), barb = fair([p0, [p0[0] + up2[0] * Lb * 0.6 + t2[0] * Lb * 0.35, p0[1] + Math.abs(up2[1]) * Lb * 0.6], [p0[0] + t2[0] * Lb, p0[1] + Lb * 0.55]], 1.5);
          both(mk(barb, (u) => Math.max(MIN_R, root * 0.42 * (1 - 0.75 * u)), { stand: hc + 0.72 * Hl, free: true, noRib: true }));
        }
      }
      // the centre: an openwork lancet (two slim strokes rising from the V and meeting in a softly rounded
      // point, like a Gothic window or a Lalique openwork leaf) framing a smooth teardrop bead: light, open and
      // jewel-like rather than a solid blade; no sharp point anywhere near the face
      const Ho = Math.max(40, 0.42 * Ha), wo = Math.max(9, 0.13 * Ho * 1.9);
      const edge = fair([[0, hc], [wo * 0.8, hc + 0.3 * Ho], [wo, hc + 0.55 * Ho], [0, hc + Ho]], 1.5, nrm2([0.9, 1]), nrm2([-0.75, 0.66]));
      const re = (u) => Math.max(STRAND_MIN, root * (0.55 + 0.12 * Math.sin(Math.PI * u)));
      for (const sd of [1, -1]) out.push(mk(edge.map(([a, b]) => [sd * a, b]), re, { stand: hc + 10, blade: 0.3 * SC, keel: 0.08 * SC }));
      // the gem: a pendant drop hanging from the window's top on a short stem, as tiara drops do, so the foot of
      // the V stays clean; u runs from the top down to the drop's round bottom
      const drop = fair([[0, hc + 0.98 * Ho], [0, hc + 0.72 * Ho], [0, hc + 0.36 * Ho]], 0.6);   // fine steps: its radius swells fast
      out.push(mk(drop, (u) => Math.max(STRAND_MIN * 0.9, root * (0.42 + 0.85 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, (u - 0.35) / 0.65))), 0.8) * sstep((u - 0.3) / 0.4))), { stand: hc + 10, noRib: true, blade: 0.3 }));
      if (GG > 0.15) for (const sd of [1, -1]) {   // biomechanical: small thorns hooking inward from the outline
        const nt = Math.round(2 + 2 * GG);
        for (let i = 0; i < nt; i++) {
          const j = Math.round((0.25 + (0.5 * (i + 0.5)) / nt) * (edge.length - 1)), p0 = [sd * edge[j][0], edge[j][1]], Lt = (4 + 5 * GG) * (P._decor || 1);
          const th = fair([p0, [p0[0] - sd * Lt * 0.7, p0[1] + Lt * 0.2], [p0[0] - sd * Lt, p0[1] - Lt * 0.25]], 1.2);
          out.push(mk(th, (u) => Math.max(MIN_R + 0.6, root * 0.4 * (1 - 0.6 * u)), { stand: hc + 10, free: true, noRib: true }));
        }
      }
      // sepals: tie the three petals partway up the blade, curling out and down like the band of a fleur-de-lis
      const b0 = [wo * 0.92, hc + 0.36 * Ho], stem = fair([b0, [wo + 0.08 * sa, hc + 0.3 * Ho], [wo + 0.16 * sa, hc + 0.36 * Ho]], 2, nrm2([1, -0.2]));   // from the lancet's outer edge, so the window frames only the gem   // out past the blade's edge
      // curling up and in like a lily's petals; toward biomechanical the curl opens into a hooked claw
      const sp = stem.concat(scroll(stem[stem.length - 1], tangentAt(stem, stem.length - 1), 9 - 3 * GG, 1.1 - 0.65 * GG, 1, 0.42 - 0.2 * GG).slice(1));
      both(mk(sp, (u) => Math.max(MIN_R, root * 0.5 * (1 - 0.55 * u)), { free: true, stand: hc + 0.2 * Ho, blade: 0.35 * SC, keel: 0.08 * SC }));
      g.hosts = [g.arch];
    }
    return out;
  }

  // ---- Sketched designs (docs/crown-sketchbook): drawn in front elevation over the standard head, then built
  // from those drawings. Sketch points are mm in the front view (x across, y up), anchored to the antler's
  // root, which the sketches put at SK_BASE; fromFront finds where a sketch point lies on this head.
  const SKETCHED = ['moon', 'lotus', 'roots'], SK_BASE = [67.15, 37.67];
  function sketchFrame(P, g) {
    const hTr = bandH(P, g, g.tr), rS = g.rootR || g.rs;   // (before this design sets the band line)
    const f = pathFrame(g, g.tr, () => hTr + (g.n >= 2 ? 7 : 0)), root = add(add(f.Q, mul(f.N, OUTER + rS * 0.7)), mul(f.W, rS * 0.4));
    const kx = root[0] / SK_BASE[0];
    // Where a sketch point lies on this head: the point whose front view is (x, y), or, for a point beyond the
    // head's outline (near the antler roots), the closest one that exists. It stays on the front, between the
    // antlers (t within tr + 0.3), and the best attempt is kept, so a point never lands across the head.
    const tMax = g.tr + 0.3, z0 = onHead(g, 0, 0)[2];
    const fromFront = ([x, y]) => {   // → [s along the band (mm), h up the head (mm)]
      const X = x * kx, Z = root[2] + (y - SK_BASE[1]);
      let t = clamp(Math.asin(clamp(X / g.head.r[0], -0.95, 0.95)), -tMax, tMax), h = clamp(Z - z0, -80, 160);
      let best = null;
      for (let it = 0; it < 18; it++) {
        const p = onHead(g, t, h), ex = p[0] - X, ez = p[2] - Z, err = Math.hypot(ex, ez);
        if (!best || err < best[2]) best = [t, h, err];
        if (err < 0.01) break;
        const pt = onHead(g, t + 1e-3, h), ph = onHead(g, t, h + 0.1);
        const a = (pt[0] - p[0]) / 1e-3, b = (ph[0] - p[0]) / 0.1, c = (pt[2] - p[2]) / 1e-3, d = (ph[2] - p[2]) / 0.1, det = a * d - b * c || 1e-9;
        const dt = (d * ex - b * ez) / det, dh = (a * ez - c * ex) / det;
        t = clamp(t - clamp(dt, -0.2, 0.2), -tMax, tMax); h = clamp(h - clamp(dh, -20, 20), -80, 160);   // damped, within reach
      }
      return [best[0] * (g.inner / (2 * Math.PI)), best[1]];
    };
    return { hTr, fromFront, root };
  }
  // The band line (and so the liner) under a sketched design: under its front piece, then on round the back.
  function sketchBandFn(P, g, sf, front) {
    const Rs = g.inner / (2 * Math.PI), tr = g.tr, tab = front.map(([s2, h]) => [s2 / Rs, h]).filter(([t]) => t >= 0 && t < tr - 0.02).sort((a, b) => a[0] - b[0]);
    tab.push([tr, sf.hTr]);
    if (tab[0][0] > 0) tab.unshift([0, tab[0][1]]);
    return (t0) => {
      const t = Math.abs(t0);
      if (t >= tr) return sf.hTr - P.ringDrop * sstep((t - tr) / (Math.PI - tr));
      let i = 1; while (i < tab.length - 1 && tab[i][0] < t) i++;
      const [ta, ha] = tab[i - 1], [tb, hb] = tab[i], u = clamp((t - ta) / (tb - ta || 1), 0, 1);
      return ha + (hb - ha) * (u * u * (3 - 2 * u));
    };
  }
  const MOON = { spine: [[0, -2], [24, 4], [47, 19], [60, 32], [66, 42]], pearl: [0, 11, 9.5] };   // the horns end in the antler roots
  const ROOTS = { front: [[0, -4], [7, -3], [20, 3], [38, 12], [54, 24], [65, 36]], knot: [0, -4, 5], seed: [[0, -7.5], [0, -15], [0, -23]] };
  const LOTUS = { front: [[0, 1], [30, 5], [55, 20], [67, 34]], petals: [[0, 0, 1], [0.214, 0.34, 0.82], [0.44, 0.68, 0.67]] };   // (angle round from the back, fan angle, size)
  function sketchedCrown(P, g, SC, GG, out, pat, c) {
    const { path, hs, he } = c, sf = g.sketch, tr = g.tr, Rs = g.inner / (2 * Math.PI), openFront = P.ringBase === 'openFront';
    const Ha = Math.max(90, (g.antlerH || 150) * (P._decor || 1)) * (P.ornament || 1), kO = Ha / 175;   // the sketches were drawn with 175 mm antlers
    const conv = (pl) => pl.map(sf.fromFront), both = (br) => { out.push(br, mirrorX(br)); return br; };
    const inFront = (pl) => (openFront ? pl.filter(([s2]) => s2 / Rs > hs + 0.04) : pl);
    const mk = (pl2, rf, o) => flatStroke(g, pl2, pl2.map((_, i) => rf(i / Math.max(1, pl2.length - 1))), Object.assign({ SC, GG }, o));
    const blob = (sk, r, proud) => {   // a round jewel (pearl, knot) standing proud of the head
      const [s2, h] = sf.fromFront(sk), f = pathFrame(g, s2 / Rs, () => h), c0 = add(f.Q, mul(f.N, OUTER + proud));
      const br = { pts: [c0, add(c0, mul(f.N, 0.6))], rad: [r, r], ss: [0, 1], n: 1, length: 0.6, kind: 'tine', F: f.N, ov: 0.05, sculpt: SC, giger: GG, smooth: true };
      parallelFrames(br); out.push(br); return br;
    };
    // the back: a slim band from the antlers round the back (or to the open end), finer toward the back
    const rb = Math.max(STRAND_MIN, (g.rootR || g.rs) * (pat === 'roots' ? 0.55 : 0.42));
    g.back = path(tr, he, () => 0, (u) => Math.max(STRAND_MIN, rb * (1 - 0.25 * u)), 'ring', { ov: 0.12 });
    g.back.away = 1; g.hosts = [g.back];
    if (pat === 'moon') {   // a crescent with body, thick at the centre, horns fining into the antler roots; a pearl in its bowl
      const sp = inFront(conv(fairSk(MOON.spine, 1.6)));
      if (sp.length > 2) g.main = both(mk(sp, (u) => 1.5 + 5 * (1 - Math.pow(u, 1.8)), { free: true, blade: 0.5, keel: 0.1 * SC, lift: 0.4 }));
      if (!openFront) blob(MOON.pearl, MOON.pearl[2] * Math.min(1.2, Math.max(0.85, kO)), 3.5);   // seated in the bowl, its back set into the crescent
    } else if (pat === 'roots') {   // roots from each antler meet at the brow in a knot that holds a seed; one curls back over the temple
      const fr = inFront(conv(fairSk(ROOTS.front, 1.6)));
      if (fr.length > 2) g.main = both(mk(fr, (u) => 3.4 + 2.1 * Math.pow(u, 1.2), { lift: 0.4, blade: 0.25 }));
      if (!openFront) {
        blob(ROOTS.knot, ROOTS.knot[2], 3.5);
        const sd = conv(fairSk(ROOTS.seed, 1));
        out.push(mk(sd, (u) => Math.max(STRAND_MIN * 0.9, 3 + 1.9 * Math.sin(Math.PI * Math.min(1, u / 0.8)) ** 0.8), { lift: 0.6, blade: 0.3, noRib: true }));
      }
      const tb = Math.min(he - 0.05, tr + 0.75), temple = [];   // back over the temple, dipping and lifting again at its tip (not a hook)
      for (let i = 0; i <= 28; i++) { const u = i / 28; temple.push([(tr + (tb - tr) * u) * Rs, sf.hTr - 22 * Math.sin(Math.PI * Math.min(1, u * 0.8)) ** 1.2 + 6 * u * u]); }
      both(mk(temple, (u) => 4.75 * (1 - 0.55 * u), { free: true, lift: 0.4, blade: 0.25 }));
    } else if (pat === 'lotus') {   // a quiet band in front; openwork petals stand behind the head, a halo between the antlers
      const fr = inFront(conv(fairSk(LOTUS.front, 1.6)));
      if (fr.length > 2) g.main = both(mk(fr, () => Math.max(STRAND_MIN, rb * 0.95), { lift: 0.4, blade: 0.2 }));
      const Z = [0, 0, 1], lean = 3 * DEG;   // near upright: a halo, and no deeper than the head, so the antlers keep their size
      for (const [phi, fan, sz] of LOTUS.petals) {
        const tC = Math.PI - phi;
        if (P.ringBase === 'openBack' && tC > he - 0.08) continue;   // an open back leaves out what falls in the gap
        const f = pathFrame(g, tC, (t) => bandH(P, g, t)), base = add(f.Q, mul(f.N, OUTER + rb));
        const Nh = norm([f.N[0], f.N[1], 0]), Up = norm(add(Z, mul(Nh, Math.tan(lean))));
        let T = norm(cross(Z, Nh)); if (T[0] < 0) T = mul(T, -1);   // across, level, in the plane tangent to the back of the head (so petals clear it)
        const d = norm(add(mul(Up, Math.cos(fan)), mul(T, Math.sin(fan)))), nn = norm(add(mul(T, Math.cos(fan)), mul(Up, -Math.sin(fan)))), pn = cross(d, nn);
        const L = 150 * kO * sz, W = 46 * kO * sz, P3 = (a, w) => add(add(base, mul(d, L * a)), mul(nn, w));
        const edge = (sg) => fairSk([[0, 0], [0.3, sg * 0.46], [0.62, sg * 0.42], [0.88, sg * 0.16], [1, 0]].map(([a, w]) => [a * L, w * W]), 2).map(([a, w]) => P3(a / L, w));
        const vein = fairSk([[0, 0], [0.55 * L, 0]], 2).map(([a]) => P3(a / L, 0));
        for (const [pl, r0, r1] of [[edge(1), 3.3, 3], [edge(-1), 3.3, 3], [vein, 3.6, 3]]) {
          const br = { pts: pl, rad: pl.map((_, i) => Math.max(STRAND_MIN, r0 + (r1 - r0) * (i / (pl.length - 1)))), ss: pl.map(() => 0.2), n: pl.length - 1, length: vlen(sub(pl[pl.length - 1], pl[0])), kind: 'ring', F: pn, Fp: pl.map(() => pn), ov: 0.3, sculpt: SC, giger: GG };
          parallelFrames(br);
          if (fan === 0) out.push(br); else both(br);
        }
      }
    }
    if (!g.main) g.main = g.back;
    return out;
  }
  function fairSk(knots, step) {   // a sketch line, faired and resampled (sketch mm)
    return knots.length < 3 ? resample(knots, step) : fair(knots, step);
  }

  // The liner (two smooth rails blended into one soft strip) and the beams on the outside of it.
  function ringBand(P, g) {
    const out = [], [hs, he] = halfRange(P, g), openEnd = P.ringBase === 'openBack', openStart = P.ringBase === 'openFront';
    // Character: toward elven (SC) the wander calms and (in the mesher) the antler grain smooths away; toward
    // biomechanical (GG) the beams are ribbed like vertebrae, the grain deepens and the lines grow restless.
    // The pattern decides how the strands part and meet.
    const SC = sculptOf(P), GG = gigerOf(P), pat = P.ringPattern || 'band', slim = 1 - 0.25 * SC;
    if (SKETCHED.includes(pat)) {   // the band line runs under the design's front piece, then round the back
      g.sketch = sketchFrame(P, g);
      const front = pat === 'moon' ? MOON.spine : pat === 'roots' ? ROOTS.front : LOTUS.front;
      g.bandFn = sketchBandFn(P, g, g.sketch, fair(front, 3).map(g.sketch.fromFront));
    }
    if (pat === 'fleur') {   // its band line: a V at the brow, rising in an S into the antlers, settling lower behind
      const D = P.ringBase === 'openFront' ? 0 : P.ringDip * 1.1, R = P.ringRise * 1.3, tr0 = g.tr;
      g.bandFn = (t) => -D * Math.exp(-Math.abs(t) / 0.3) + R * Math.exp(-(((t - tr0) / 0.55) ** 2)) - P.ringDrop * sstep((t - tr0) / (Math.PI - tr0));
    }
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
      const o = opts || {}, len = ((tb - ta) * g.inner) / (2 * Math.PI), ribbed = kind === 'ring' && GG > 0;
      const n = Math.max(8, Math.ceil(len / (ribbed ? STEP / 3 : STEP)));   // ribs need finer sampling
      const pts = [], rad = [], Fp = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n, t = o.rev ? tb - (tb - ta) * u : ta + (tb - ta) * u;   // rev: runs from tb back to ta
        const endMM = Math.min(openStart && ta <= hs + 1e-6 ? u * len : Infinity, openEnd && tb >= he - 1e-6 ? (1 - u) * len : Infinity);
        const flare = endMM < 30 ? 5 * (1 - sstep(endMM / 30)) : 0;   // open ends turn away from the head
        const hf = (tt) => { const uu = (tt - ta) / (tb - ta); return bh(tt) + vf(o.rev ? 1 - uu : uu, tt); };   // u runs the way the path does
        const f = pathFrame(g, t, hf);
        const r = rf(u), lift = (o.radial || 0) + (o.radialF ? o.radialF(u) : 0) + (kind === 'liner' ? 0 : OUTER + r) + flare;
        pts.push(add(add(f.Q, mul(f.N, lift)), mul(f.W, o.w || 0))); Fp.push(f.N);
        const floor = kind === 'liner' ? MIN_R : o.free ? STRAND_MIN + (MIN_R - STRAND_MIN) * sstep((u - 0.8) / 0.2) : STRAND_MIN;
        const rib = ribbed ? 1 + 0.32 * GG * Math.pow(0.5 + 0.5 * Math.cos((2 * Math.PI * len * u) / RIB), 6) : 1;   // vertebra-like rings
        rad.push(Math.max(floor, (endMM < 25 ? r * (0.72 + 0.28 * sstep(endMM / 25)) : r) * rib));   // blunt, rounded ends
      }
      const br = { pts, rad, ss: pts.map((_, i) => (o.free ? i / n : 0.2)), n, length: len, kind, F: [0, 0, 1], ov: o.ov || 0, smooth: kind === 'liner', sculpt: SC, giger: GG };
      if (o.ribbon) { br.Fp = Fp; br.ov = o.ribbon; br.keel = o.keel || 0; }   // a carved ribbon: flat against the head, ridged along its outer face
      parallelFrames(br);
      return br;
    };
    const tr = g.tr, rs = g.rs, span = he - hs;
    // liner: rests on the head along the band's line
    for (const rail of [-1, 1]) { const br = onePath(hs, he, () => 0, () => LINER_R, 'liner', { radial: LINER_R * 0.7, w: rail * LINER_H }); out.push(br, mirrorX(br)); }
    // 1. the band: heavy at the brow and temples, thinner toward the back
    if (pat !== 'band') return sculptedBand(P, g, { path, so, hs, he, SC, GG, pat, out });
    const W8 = P.ringWander * 8 * (1 - 0.7 * SC) * (1 + 1.5 * GG);
    const main = path(hs, he, (u, t, side) => sideNoise(P, side, Math.cos(t) * 1.7 + so, Math.sin(t) * 1.7, 1.1) * W8 * joinFade(t),
      (u) => rs * (1 - 0.12 * SC) * (1.25 - P.ringTaper * sstep((hs + span * u - tr) / (he - tr))), 'ring', { ov: 0.1 });
    g.main = main;
    if (g.n >= 2) {   // 2. a sweep from the brow up past the antler's base, ending free as a swept-back tine
      const ta = Math.max(hs, 0.03), tb = Math.min(he - 0.1, tr + P.ringSweepReach * DEG), hi = P.ringSweepLift;
      g.sweep = path(ta, tb, (u, t, side) => hi * sstep((t - ta) / (tr - ta)) + hi * 0.6 * sstep((t - tr) / (tb - tr)) ** 1.5
        + sideNoise(P, side, u * 3 + so, 4.4, 2.2) * W8 * 1.5 * sstep(u / 0.2),
        (u) => rs * slim * (0.95 - 0.35 * u) * ogive(u, 0.75 - 0.15 * SC), 'ring', { free: true, radial: rs * 0.3 });
    }
    if (g.n >= 3) {   // 3. a lower beam that bulges away and rejoins the band, leaving open loops
      const ta = Math.max(hs + 0.05, 0.22), tb = Math.min(he - 0.08, tr + 1.5), m = Math.max(1, Math.round(P.ringWeave));
      const A = P.ringLoopDepth;
      path(ta, tb, (u, t, side) => -A * Math.abs(Math.sin(Math.PI * m * u)) * (1 + P.ringWander * 1.2 * sideNoise(P, side, u * 4 + so, 8.8, 0.4)),
        (u) => rs * slim * (0.85 - 0.2 * Math.abs(u - 0.5)), 'ring', { radial: rs * 0.15 });
    }
    return out;
  }

  // The patterns other than the plain band grow the crown out of the antlers, the way the references read:
  // from each antler's base, a beam runs forward to the brow (meeting the other side's in a V) and one
  // runs back, both thickest at the antler and tapering away. Fleur draws a flat template; circlet is a
  // strap with antler motifs; spines is a twisted twig; briar twists vines round the beams; lattice adds
  // an upper beam that arches over the temple and rejoins the band at the brow (an almond).
  function sculptedBand(P, g, c) {
    const { path, so, hs, he, SC, GG, pat, out } = c, tr = g.tr, rs = g.rs;
    if (SKETCHED.includes(pat)) return sketchedCrown(P, g, SC, GG, out, pat, c);
    if (pat === 'fleur') {   // the band: thick at the antlers, finer to the V and quiet behind; then the fleur's strokes
      const rootR = Math.max(rs * 1.55, 0.75 * (g.rootR || 0), STRAND_MIN * 1.3);
      g.main = path(hs, tr, () => 0, (u) => rootR * (0.5 + 0.5 * Math.pow(u, 1.3)), 'ring', { ov: 0.12 });
      g.back = path(tr, he, () => 0, (u) => Math.max(STRAND_MIN, rootR * (0.6 - 0.22 * u)), 'ring', { ov: 0.12 });
      return templateBand(P, g, SC, GG, out, pat);
    }
    if (pat === 'circlet') {   // a crafted strap band with a rim along each edge; the motifs are set on it in placeCrown
      const hh = STRAP_H / 2, lift = STRAP_T / 2 + 0.8;   // standing on the head, its inner face just clear of it
      const strap = path(hs, he, () => 0, () => hh, 'ring', { radial: lift - OUTER - hh, ribbon: 1 - STRAP_T / 2 / hh });
      strap.smooth = true; out[out.length - 1].smooth = true;   // a made band: no antler grain (ribbed when biomechanical)
      for (const w of [-1, 1]) {
        path(hs, he, () => 0, () => STRAND_MIN, 'ring', { radial: lift - OUTER - STRAND_MIN, w: w * hh });
        out[out.length - 1].smooth = out[out.length - 2].smooth = SC > 0;
      }
      g.main = strap; g.hosts = [strap];
      g.strap = { hh, lift };
      const sites = [[tr * 0.45, 0.7], [tr + 0.6, 0.85], [tr + 1.2, 0.7], [tr + 1.8, 0.55]];   // (angle, size): graduated away from the antlers
      g.motifs = sites.filter(([t]) => t > hs + 0.15 && t < he - 0.2).map(([t, k]) => ({ t, k }));
      return out;
    }
    if (pat === 'spines') {   // a slim circlet of twisted twig: an even core with a strand spiralling round it
      const rc = Math.max(STRAND_MIN, rs * 1.4), rt = STRAND_MIN, len = ((he - hs) * g.inner) / (2 * Math.PI), f = len / 45;
      g.main = path(hs, he, (u, t, side) => sideNoise(P, side, u * 3 + so, 4.4, 2.2) * P.ringWander * 4 * (1 - SC), () => rc, 'ring', { ov: 0.1 });
      if (SC < 0.5) path(hs, he, (u) => rc * 0.8 * Math.sin(2 * Math.PI * f * u), () => rt, 'ring', { radialF: (u) => rc - rt + rc * 0.8 * Math.cos(2 * Math.PI * f * u) });   // elven: a clean core
      g.hosts = [g.main];
      return out;
    }
    const W8 = P.ringWander * 8 * (1 - SC) * (1 + 1.5 * GG);
    const noise = (k) => (u, t, side) => sideNoise(P, side, u * 3 + so + k, 4.4 + k, 2.2) * W8;
    const root = Math.max(rs * 1.55, 0.75 * (g.rootR || 0), STRAND_MIN * 1.3);   // at the antler: a good share of the antler's own base, so it grows out of it
    const taper = (u) => root * (1 - (0.3 + 0.2 * P.ringTaper) * Math.pow(u, 0.9));   // u: 0 at the antler, 1 at the far end
    // forward beam: brow (t = hs) to antler (t = tr); the free end is the root, so u runs from the brow
    g.main = path(hs, tr, (u, t, side) => noise(0)(u, t, side) * Math.sin(Math.PI * u), (u) => taper(1 - u), 'ring', { ov: 0.12 });
    const mainL = out[out.length - 1];
    g.main.away = -1;   // away from the antler is toward the brow
    // back beam: antler to the back (or to the open end)
    g.back = path(tr, he, (u, t, side) => noise(1)(u, t, side) * Math.sin(Math.PI * u), (u) => taper(u) * (1 - 0.15 * u), 'ring', { ov: 0.12 });
    g.back.away = 1;
    if (DECOR.includes(pat)) {   // briar and spines: the beams carry the pattern (see ringTines)
      if (pat === 'briar') {   // vines twisting round both beams, a helix hugging each
        const beams = [[hs, tr, (u) => taper(1 - u), 0], [tr, he, (u) => taper(u) * (1 - 0.15 * u), 1]];
        for (const [ta, tb, rB, k] of beams) {
          const len = ((tb - ta) * g.inner) / (2 * Math.PI), f = Math.max(1.5, (len / (38 - 6 * Math.min(3, P.ringWeave))) * (1 - 0.6 * SC));   // turns (elven: a long, calm twist, not a rope)
          for (const ph of [0, Math.PI]) {
            const rv = (u) => Math.max(STRAND_MIN, rB(u) * 0.5), a = (u) => rB(u) * 0.85 * (1 - 0.75 * facetOf(P)), phi = (u) => 2 * Math.PI * f * u + ph;
            path(ta, tb, (u, t, side) => noise(k)(u, t, side) * Math.sin(Math.PI * u) + a(u) * Math.sin(phi(u)), rv, 'ring',
              { radialF: (u) => rB(u) - rv(u) + a(u) * Math.cos(phi(u)) });
          }
        }
      }
      g.hosts = [g.main, g.back];
      return out;
    }
    if (g.n >= 2) {   // the upper beam: from the antler's base forward, above the band
      // height above the band: rises from the base, then returns to meet the band at the brow (an almond)
      const H = P.ringSweepLift * 1.6, hf = (u) => H * Math.pow(Math.sin(Math.PI * Math.pow(u, 1.25)), 0.8);
      g.arch = path(hs, tr, (u, t, side) => hf(u) + noise(2)(u, t, side) * Math.sin(Math.PI * u),
        (u) => root * 0.85 * (1 - 0.3 * Math.pow(u, 0.9)), 'ring', { rev: true, ov: 0.12 });
      g.arch.away = 1;   // built from the antler outward
      const archL = out[out.length - 1];
      if (GG > 0) {   // biomechanical: rib-like struts arch out between the upper beam and the band, like a rib cage
        const k = 2 + Math.round(3 * GG);
        for (const [A, M, side] of [[g.arch, g.main, 1], [archL, mainL, -1]]) {
          if (side < 0 && !P.ringAsym) break;
          for (let i = 0; i < k; i++) {
            const a = sampleAt(A, 0.15 + (0.6 * (i + 0.5)) / k).p;
            let b = null, bd = Infinity; for (const q of M.pts) { const d = vlen(sub(q, a)); if (d < bd) { bd = d; b = q; } }
            if (bd < 9) continue;   // nothing to span
            const O = headN(g, mul(add(a, b), 0.5)), bulge = 4 + 6 * GG, pts = [];
            for (let j = 0; j <= 10; j++) { const v = j / 10; pts.push(add(add(b, mul(sub(a, b), v)), mul(O, bulge * Math.sin(Math.PI * v)))); }
            const rr = Math.max(STRAND_MIN, root * 0.5);
            const br = { pts, rad: pts.map((_, j) => rr * (1 + 0.25 * Math.sin((Math.PI * j) / 10) ** 2)), ss: pts.map(() => 0.2), n: 10, length: bd, kind: 'ring', F: [0, 0, 1], ov: 0, sculpt: SC, giger: GG };
            parallelFrames(br);
            out.push(br);
            if (!P.ringAsym) out.push(mirrorX(br));
          }
        }
      }
    }
    if (g.n >= 3) {   // a second back beam, higher, that lifts off behind the antler as a swept flame
      const tf = Math.min(he - 0.12, tr + P.ringSweepReach * DEG), hi = P.ringSweepLift * 0.9;
      g.sweep = path(tr, tf, (u, t, side) => hi * sstep(u / 0.5) + noise(3)(u, t, side) * u,
        (u) => root * 0.7 * (1 - 0.3 * u) * ogive(u, 0.65), 'ring', { free: true, ov: 0.12, radialF: (u) => 14 * sstep((u - 0.5) / 0.5) ** 1.5 });
      g.sweep.away = 1;
    }
    g.hosts = [g.back, g.arch, g.main, g.sweep].filter(Boolean);
    return out;
  }

  // Tines along the beams, following their flow, in the species' character, plus an optional brow piece.
  function ringTines(P, g) {
    const out = [], L = P.ringTineLength * (P._decor || 1), U = [0, 0, 1];   // _decor: shortened to fit the bed
    // Elven tines are steadier in size and angle, lean further with the flow and curl up like flames;
    // biomechanical ones vary more and hook down like claws, and extra spines grow along the beams
    const SC = sculptOf(P), GG = gigerOf(P), pat = P.ringPattern || 'band';
    const out2 = [], vary = (0.2 + P.ringWander) * (1 - 0.75 * SC) * (1 + 0.8 * GG);   // how much tine lengths and angles differ
    for (const side of [1, -1]) {
    if (side < 0 && !P.ringAsym) { for (const br of out2) out.push(mirrorX(br)); break; }
    // the left side draws the same random numbers as the right, blended toward its own stream by Asymmetry
    const rR = rng(P.seed * 977 + 3), rA = rng(P.seed * 977 + 1013);
    const rnd = () => { const a = rR(), b = rA(); return side > 0 ? a : a + (b - a) * P.ringAsym; };
    const jit = (a) => (rnd() * 2 - 1) * a * vary;
    const tine = (base, d0, len, rb, opts) => {
      const o = opts || {}, curve = ((o.curve || 0) + (o.flow === false ? 0 : 22 * SC - 45 * GG)) * DEG;
      let axis = o.axis || cross(d0, U); const al = vlen(axis);
      axis = al > 1e-3 ? mul(axis, 1 / al) : [1, 0, 0];
      const tip = (o.tip == null ? 0.45 : o.tip) * (1 - 0.15 * SC), keep = o.keep || 0;
      rb = Math.max(rb, TINE_BASE_MIN); len = Math.min(len, TINE_REACH * rb);   // sturdy enough to print and wear
      const br = sweep(base, (u) => rotate(d0, axis, curve * u), Math.max(len, 4),
        (u) => Math.max(MIN_R, rb * (o.prof ? o.prof(u) : (1 - 0.3 * u) * Math.max(keep, ogive(u, tip)))));
      br.kind = 'tine'; br.F = o.F || [0, 0, 1]; br.ov = o.ov == null ? P.ovality : o.ov; br.sculpt = SC; br.giger = GG;
      parallelFrames(br);
      if (side > 0) { out.push(br); out2.push(br); } else out.push(mirrorX(br));
      return br;
    };
    const n = Math.max(0, Math.round(P.ringTines / 2)), hosts = g.hosts || [g.main, g.sweep].filter(Boolean), lean = P.ringTineLean + 0.5 * SC;
    const style = SC >= 0.5 && P.ringTineStyle === 'cluster' ? 'spike' : P.ringTineStyle;   // sculpted: single flames, not knots
    // Where a decorated pattern's pieces sit: s along a beam (0 at the brow for the forward beam, the antler for the back)
    const at = (host, s) => {
      const sp = sampleAt(host, s), O = headN(g, sp.p), back = sp.t[1] < 0 ? sp.t : mul(sp.t, -1);
      const away = host.away > 0 ? sp.t : mul(sp.t, -1);   // away from the antler
      return { sp, O, back, away, ang: Math.atan2(sp.p[0], sp.p[1]) };
    };
    const clearOfAntler = (a) => Math.abs(a.ang - g.tr) > 12 * DEG;
    const decorate = () => {
      const hs2 = [g.main, g.back].filter(Boolean);
      if (pat === 'briar') {   // thorns all along, hooked back
        const k = Math.max(3, Math.round((n + 3) * (1 - 0.45 * SC)));   // elven: fewer, finer thorns
        for (const host of hs2) for (let i = 0; i < k; i++) {
          const a = at(host, 0.08 + (0.84 * (i + 0.5)) / k + jit(0.03));
          if (!clearOfAntler(a)) continue;
          const up = i % 2 ? 0.9 : 0.1;
          tine(add(a.sp.p, mul(a.O, a.sp.r * 0.6)), norm(add(add(mul(a.O, 0.45), mul(U, up + 0.2)), mul(a.back, 0.6))), L * (0.7 + 0.3 * rnd()), a.sp.r * 0.75, { curve: 10 - 30 * GG, tip: 0.25 });   // more up and back than out, to fit the bed
        }
      } else if (pat === 'spines') {   // a ring of tall spines, tallest flanking the antlers, each forking once; berries at the base
        const k = Math.max(6, n + 5), Ls = Math.max(L, 30 * (P._decor || 1));
        for (let i = 0; i < k; i++) {
          const a = at(g.main, 0.05 + (0.9 * (i + 0.5)) / k + jit(0.01));
          if (Math.abs(a.ang - g.tr) < 10 * DEG) continue;
          // tall and many, tallest flanking the antlers; a thick base lets them stand tall and still print
          const near = Math.exp(-(((a.ang - g.tr) / 0.9) ** 2)), l = Ls * (1.4 + 1.6 * near) * (1 + jit(0.1)), rb = 5;
          const base = add(a.sp.p, mul(U, a.sp.r * 0.6));
          const sp = tine(base, norm(add(add(U, mul(a.back, 0.18 + 0.2 * Math.abs(a.ang) / Math.PI)), mul(a.O, 0.12))), l, rb, { curve: 8, tip: 0.5 });
          if (SC < 0.5) { const s2 = sampleAt(sp, 0.6); tine(s2.p, norm(add(s2.t, mul(a.O, 0.9))), l * 0.35, rb * 0.72, { curve: 10, tip: 0.4 }); }   // a twig forking off, toward the outside (elven: clean spires)
          if (GG < 0.6 && SC < 0.3) for (const [du, dw] of [[-1, 0.4], [1, 0.4], [0, -0.6]]) {   // a cluster of berries at the base (natural only: elven stays clean)
            const c0 = add(add(a.sp.p, mul(a.O, a.sp.r + 2.2)), add(mul(a.sp.t, du * 4.2), mul(U, dw * 4.2)));
            const br = { pts: [c0, add(c0, mul(a.O, 0.5))], rad: [3.4, 3.4], ss: [0, 1], n: 1, length: 0.5, kind: 'tine', F: U, ov: 0, sculpt: 1, giger: 0 };
            parallelFrames(br);
            if (side > 0) { out.push(br); out2.push(br); } else out.push(mirrorX(br));
          }
        }
      }
    };
    if (GG > 0) for (const host of hosts) {   // biomechanical: stubby spines along the beams, alternately up and out, hooked
      const m = Math.round(2 + 5 * GG);
      for (let i = 0; i < m; i++) {
        const sp = sampleAt(host, Math.min(0.9, 0.1 + (0.8 * (i + 0.5)) / m + jit(0.03)));
        if (Math.abs(Math.atan2(sp.p[0], sp.p[1]) - g.tr) < 12 * DEG) continue;   // clear of the antler's base
        const O = headN(g, sp.p), K = sp.t[1] < 0 ? sp.t : mul(sp.t, -1), up = i % 2 ? 0.8 : -0.25;
        tine(add(sp.p, mul(O, sp.r * 0.3)), norm(add(add(O, mul(U, up)), mul(K, 0.45))), (7 + 9 * GG) * (0.7 + 0.3 * rnd()) * (P._decor || 1), Math.max(TINE_BASE_MIN, sp.r * 0.6), { curve: -35 * GG, flow: false, tip: 0.2 });
      }
    }
    if (DECOR.includes(pat)) decorate();
    else for (let i = 0; i < n; i++) {
      const host = hosts[i % hosts.length], s0 = host === g.main ? 0.12 + (0.8 * (i + 0.5)) / n : host === g.arch ? 0.3 + (0.4 * (i + 0.5)) / n : 0.25 + (0.5 * (i + 0.5)) / n;
      const sp = sampleAt(host, Math.min(0.92, s0 + jit(0.03)));
      const ang = Math.atan2(sp.p[0], sp.p[1]);
      if (Math.abs(ang - g.tr) < 14 * DEG) continue;   // clear of the antler's base
      const O = g.head.kind === 'scan' ? g.head.normal(sp.p) : norm([sp.p[0] / g.head.r[0] ** 2, sp.p[1] / g.head.r[1] ** 2, (sp.p[2] - g.head.c[2]) / g.head.r[2] ** 2]);
      const K = sp.t[1] < 0 ? sp.t : mul(sp.t, -1);   // with the beam's flow, toward the back
      const base = add(sp.p, mul(U, sp.r * 0.5));
      const dir = (o, k, u) => norm(add(add(mul(O, o), mul(K, k)), mul(U, u)));
      const near = Math.exp(-(((ang - g.tr) / 0.8) ** 2));   // bigger near the antlers
      const rb = sp.r * 0.85, l = L * (0.6 + 0.6 * near) * (1 + jit(0.3));
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
    if (pat === 'circlet' && g.strap && P.ringBase !== 'openFront') {   // a domed boss set at the brow, the focal point
      const f = pathFrame(g, 0, (t) => bandH(P, g, t)), c0 = add(f.Q, mul(f.N, g.strap.lift + 2)), rb = 6.5 + 1.5 * SC;
      const br = { pts: [c0, add(c0, mul(f.N, 1.5))], rad: [rb, rb * 0.9], ss: [0, 1], n: 1, length: 1.5, kind: 'tine', F: f.N, ov: 0.35, sculpt: 1, giger: GG };
      parallelFrames(br); out.push(br);
    }
    if (P.ringFront !== 'none' && P.ringBase !== 'openFront' && pat !== 'circlet' && !DECOR.slice(2).includes(pat)) {   // the brow piece, at the band's lowest point (a circlet has its boss)
      const f = pathFrame(g, 0, (t) => bandH(P, g, t)), base = add(f.Q, mul(f.N, OUTER + g.rs)), rsB = Math.max(g.rs, STRAND_MIN);   // sturdy at the base
      // brow pieces are jewels, not points: short and round at every end (small spikes at the brow read as weapons)
      const bead = (u) => Math.sin(Math.PI * Math.min(1, 0.25 + 0.75 * u)) ** 0.6;   // swells, then closes round
      if (P.ringFront === 'point') {   // a rounded drop down the forehead and a rounded bud above it
        const br = sweep(base, () => mul(f.W, -1), Math.min(L * 0.45, 14), (u) => Math.max(2.6, rsB * 1.1 * (1 - 0.35 * u)));
        br.kind = 'tine'; br.F = f.N; br.ov = 0.3 + 0.2 * SC; br.sculpt = SC; br.smooth = SC > 0.3; parallelFrames(br); out.push(br);
        const cr = sweep(base, () => norm(add(mul(f.N, 0.3), U)), Math.min(L * 0.5, 18), (u) => Math.max(2.8, rsB * 1.15 * (0.55 + 0.45 * bead(u))));
        cr.kind = 'tine'; cr.F = f.N; cr.ov = 0.3; cr.sculpt = SC; cr.smooth = SC > 0.3; parallelFrames(cr); out.push(cr);
      } else {   // shovel: a broad, round-ended paddle over the brow
        const br = sweep(base, () => norm(add(f.N, mul(U, 0.35))), L * 1.1, (u) => Math.max(3, rsB * 1.35 * (1 - 0.25 * u)));
        br.kind = 'tine'; br.F = U; br.ov = 0.45; br.sculpt = SC; br.smooth = SC > 0.3; parallelFrames(br); out.push(br);
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
    g.rootR = rS;
    let az = 0; for (const b0 of A.branches) for (const v of b0.pts) az = Math.max(az, v[2]);
    g.antlerH = az * S;   // the crown's parts are proportioned to the antlers (Lyre)
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
        br.antler = true;   // one of the two antlers (a label only; the silhouette tool can leave them out)
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
        // on a crown the burr is where the antler is set into the piece: toward elven it smooths into a collar
        const smooth = 1 - 0.85 * sculptOf(P);
        burrs.push({ c: beam.pts[1], T: beam.T[0], N: beam.N[0], B: beam.B[0], R: R0, rm, amp: rm * 0.85 * smooth,
          beads: Math.max(8, Math.round((2 * Math.PI * R0) / (rm * 1.7))), wild: (0.2 + 0.8 * P.jitter) * smooth });
      }
    }
    if (g.motifs) {   // circlet: small copies of the antler set along the strap's top edge, mirrored
      const SC = sculptOf(P), GG = gigerOf(P);
      for (const mo of g.motifs) {
        const f = pathFrame(g, mo.t, (t) => bandH(P, g, t) + g.strap.hh), R = add(f.Q, mul(f.N, g.strap.lift));
        const m = MOTIF * mo.k * (P._decor || 1) * (P.ornament || 1), c = Math.cos(mo.t - tr), s = Math.sin(mo.t - tr);
        const turn = (v) => [v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2]];   // from the antler's place (tr) round to mo.t
        for (const side of [1, -1]) for (const b0 of A.branches) {
          const F = turn(b0.F || [1, 0, 0]);
          const br = Object.assign({}, b0, {
            pts: b0.pts.map((v) => { const q = turn(v); return [side * (q[0] * m + R[0]), q[1] * m + R[1], q[2] * m + R[2]]; }),
            rad: b0.rad.map((r, i) => Math.max(r * m, MIN_R + (STRAND_MIN - MIN_R) * (1 - (b0.ss ? b0.ss[i] : 0)))),   // sturdy where it's set
            length: b0.length * m, F: [side * F[0], F[1], F[2]], sculpt: SC, giger: GG,
          });
          parallelFrames(br); branches.push(br);
        }
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
      texture: { groove: P.grooveDepth * grainOf(P), grooves: P.grooveCount, pearl: P.pearling * grainOf(P) * (1 + gigerOf(P)), knob: gigerOf(P) }, fillet: P.fillet,
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
  // How the parts share the printer: each part fits on its own (the fit loop sees to that), but they need not fit
  // together. Parts [{ name, w, d }] (footprints in mm, as they sit on the plate) are packed onto as few plates as
  // possible, in rows, with a gap between them. Returns [{ parts: [{ name, w, d, x, y }] }], x/y from the plate's
  // corner inside the brim margin.
  function platesFor(P, parts) {
    const W = P.bedX - 2 * BED_MARGIN, D = P.bedY - 2 * BED_MARGIN, gap = 10, plates = [];
    for (const part of parts.slice().sort((a, b) => b.d - a.d)) {
      let placed = false;
      for (const pl of plates) {
        for (const row of pl.rows) if (row.x + part.w <= W && part.d <= row.h) { pl.parts.push(Object.assign({}, part, { x: row.x, y: row.y })); row.x += part.w + gap; placed = true; break; }
        if (placed) break;
        const last = pl.rows[pl.rows.length - 1], y = last.y + last.h + gap;
        if (y + part.d <= D && part.w <= W) { pl.rows.push({ y, h: part.d, x: part.w + gap }); pl.parts.push(Object.assign({}, part, { x: 0, y })); placed = true; break; }
      }
      if (!placed) plates.push({ rows: [{ y: 0, h: part.d, x: part.w + gap }], parts: [Object.assign({}, part, { x: 0, y: 0 })] });
    }
    return plates.map((pl) => ({ parts: pl.parts }));
  }
  // One line for the notes and the page: how many prints, and what goes on each.
  function platesText(plates) {
    if (plates.length < 2) return '';
    const list = (ps) => { const n = ps.map((p) => p.name); return n.length === 1 ? n[0] : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1]; };
    return `${plates.length} separate prints: the parts don't all fit on the plate at once. ${plates.map((pl, i) => `Print ${i + 1}: ${list(pl.parts)}.`).join(' ')}`;
  }
  function measureSkeleton(sk) {
    const P = sk.params, pts = [];
    let zmax = 0;
    const ring = (c, r) => { for (let k = 0; k < 8; k++) pts.push([c[0] + r * Math.cos(k * Math.PI / 4), c[1] + r * Math.sin(k * Math.PI / 4)]); };
    const fk = 1 + 0.26 * facetOf(P);   // a faceted section's diamond corners reach past the round radius
    for (const br of sk.branches) br.pts.forEach((p, i) => { const r = br.rad[i] * (br.kind === 'liner' ? 1 : fk) + 1; ring(p, r); zmax = Math.max(zmax, p[2] + r); });
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
  // The combined controls, turned into the values they stand for (×1 changes nothing, exactly).
  function applyMacros(P) {
    const Q = Object.assign({}, P), m = (k, f) => { Q[k] = P[k] * f; };
    for (const k of ['tineLength', 'browLength', 'crownLength']) m(k, P.tineScale);
    for (const k of ['baseDia', 'tipDia']) m(k, P.thickness);
    for (const k of ['wobble', 'jitter', 'ringWander']) m(k, P.wildness);
    for (const k of ['ringTineLength', 'ringSweepLift', 'ringLoopDepth']) m(k, P.ornament);
    return Q;
  }
  function buildSkeleton(params) {
    const P = applyMacros(resolveParams(params));
    if (P.style !== 'crown' && P.mount === 'skull') { const g = skullSpec(params); P._mid = { ox: g.Q[0], ex: [g.F.X[0], g.F.Y[0], g.F.Z[0]] }; }   // on its pedicle
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
      // If even the smallest antlers don't fit, the crown's own pieces (tines, thorns, leaves, rays) are
      // too big for the bed: shorten them step by step (they never scale with the antlers otherwise).
      for (const decor of P.style === 'crown' ? [1, 0.85, 0.7, 0.55, 0.4] : [1]) {
        const Pd = decor < 1 ? Object.assign({}, P, { _decor: decor }) : P;
        let lo = 0.05, hi = S;
        const at = (x) => { const k = buildAt(Pd, x), mm = measureSkeleton(k); return { k, mm, ok: Math.max(mm.xyRatio, mm.zRatio) <= 1 }; };
        let best = at(lo);
        if (!best.ok) continue;
        for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2, r = at(mid); if (r.ok) { lo = mid; best = r; } else hi = mid; }
        S = lo; sk = best.k; m = best.mm;
        break;
      }
      if (over > 1 && Math.max(m.xyRatio, m.zRatio) > 1) { S = P.scale; sk = buildAt(P, S); m = measureSkeleton(sk); }   // the band itself is too big for this bed
    }
    sk.fit = Object.assign({ scale: S, requested: P.scale, shrunk: S < P.scale - 1e-6, fits: Math.max(m.xyRatio, m.zRatio) <= 1, cleared: sk.cleared || {} }, m);
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

  /* Skull cap (mount 'skull'): three parts, glued. Each antler has a round flared base with a D-shaped socket
     up into it; the cap carries a pedicle for each antler, topped with a D-shaped peg (the flat faces the
     midline, so an antler only goes on facing the right way). The headband glues into a groove under the cap.
     Pegs and sockets never scale; the socket's gap is half the Peg fit all round. */
  const PEG = { r: 5, flat: 3.4, h: 12 }, SOCKET_WALL = 2.6;

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
    if (P.mount === 'skull') {   // a D-shaped socket up into the base, glued over the skull cap's peg; the base stays round
      const gap = P.pegFit / 2;   // its own fit, tested on the P2S (owner, 2026-10-05): 0.2 mm across slides on with a little friction
      m.socket = { r: PEG.r + gap, flat: PEG.flat + gap, depth: PEG.h + 0.8 };
      zt = m.socket.depth + 1.2; need = m.socket.r + SOCKET_WALL;
      m.tunnelCZ = 0;
    } else if (P.mount !== 'flat') {
      m.floor = Math.max(1.2, P.wall * 0.7);
      m.tw = P.hbWidth + P.clearance;
      m.th = P.hbThick + P.clearance + m.sag;
      zt = m.floor + m.th;
      need = m.tw / 2 + P.wall;
      m.tunnelCZ = m.floor + m.th / 2;
      if (P.mount === 'clip') m.slot = Math.max(2, P.hbWidth - 2 * Math.max(0.8, P.hbWidth * 0.12));
    } else m.tunnelCZ = -P.hbThick / 2;
    // The flare must still cover the tunnel and its walls at the tunnel's roof (zt). Where the antler's base is narrower than
    // that, the flare widens only modestly and the base grows taller instead: widening alone ran away for wide or
    // thick headbands (and grew as the fit loop shrank the antlers).
    m.h = Math.max(P.baseHeight, zt + 4);
    const cover = need + 0.5;   // the radius the base must reach at the roof (need already includes the wall)
    let rf = Math.max(m.rp * P.baseFlare, m.rp);
    if (m.rp < cover) {
      rf = Math.max(rf, cover + Math.max(2, 0.8 * (cover - m.rp)));   // at most ~1.8× the cover: bounded however small the antler
      const gNeed = (cover - m.rp) / (rf - m.rp);   // < 1: the share of the flare left at the roof
      m.h = Math.max(m.h, zt / (1 - Math.pow(gNeed, 1 / FLARE_K)));
    }
    m.rf = P.mount === 'skull' ? Math.max(m.rp * 1.12, need + 0.5) : Math.max(rf, need + 0.5, m.rp);   // on a skull the burr sits straight on the pedicle
    m.ex = P.mount === 'skull' ? 1 : Math.max(1, P.padLength / 2 / m.rf);   // footprint stretched along the band (round on a pedicle)
    m.baseZ = m.h - 0.5;
    return m;
  }

  /* --------------------------------------------------------------- skull cap */
  // A thin plate of bone over the top of the head, worn over the headband: low in the middle and shaped to the head
  // all over, reaching well back, with a jagged, broken edge that comes to a point at the front, a flattened ridge
  // down the middle with sutures and pitted bone, and a collar at each antler's base that blends into the plate, each
  // with a D-shaped peg the antler glues onto. Underneath, a channel the headband glues into, running ear to ear
  // under the antlers so their weight goes straight down into it; ribbon slots either side of the band and four
  // bobby-pin grooves at the edge hold it on. Printed rim-down, flat on the bed; the underside (which faces the hair)
  // prints on tree supports.
  //
  // Band frame: origin at the centre of the band's arc, +X the wearer's right, +Y forward, +Z up; the band's
  // middle surface is the circle of radius hbRadius in the XZ plane. The page places this frame on the head.
  //
  // Plate coordinates (mm): x across, s along the head from the antlers' line (+ toward the face), h up off the head;
  // fromSkull carries them into the band frame, keeping lengths along the head's surface.
  const PLATE = { t: 3.2, edge: 2.4, gap: 0.6, lift: 1, band: 2.2 };   // thickness; at the edge; off the head (hair); the edge's
                                                                      // curl off the head; over the band's channel
  const SLOT = { len: 14, w: 3.2 };            // a ribbon slot: ½ in ribbon, threaded down through the plate
  const PIN = { len: 11, w: 2.2, depth: 1 };   // a bobby-pin groove: on top, running in from the edge (a pin's top prong)
  // A double-wire headband (capBand 'wires': two wires spreading apart over the top of the head from where their ends join,
  // by the ears): the cap splits round each wire. A wire lies across the head in a
  // round channel, half in the cap and half in a thin strip that glues up into a pocket in the cap's underside, trapping it.
  // The pocket's walls surround the strip and it stops short of the plate's edge, so the cap overlaps it all round and
  // the only seam is underneath, against the head. Two small pins on the strip, both on its front side, go into holes in
  // the pocket: they line it up and only let it go in one way round. Under the strip: floor; beside the channel: side;
  // over it: roof (the cap's bone texture is kept shallow there); end: how far in from the edge the strip stops; fit: the
  // gap round the strip in its pocket (for glue).
  // Each wire lies in a plane from where it crosses the top of the head (wireFront, wireBack) down to just above the ear,
  // at the tape line (the head's widest), where the two are wireEarGap apart. From the owner's photo and measurements
  // (2026-10-07): 2¼ in apart over the top and 1⅜ in just above the ears, the pair leaning back as it comes down (lean:
  // its middle moves back this much per mm down), so the front wire leans forward about 15° and the back one is nearly
  // upright.
  const WIRE = { floor: 0.8, side: 2.8, roof: 1.2, end: 3, fit: 0.15, pin: { r: 0.8, h: 1, gap: 0.15 }, lean: 0.168 };
  // the wire's channel: diameter D (the wire plus the Fit clearance), its centre hc off the head (where the strip and the
  // cap meet), and the strip's half-width hw. null for a flat band.
  function capWire(P) {
    if (P.capBand !== 'wires') return null;
    const D = P.wireDia + P.clearance, hc = PLATE.gap + WIRE.floor + D / 2;
    return { D, hc, hw: D / 2 + WIRE.side, pinY: D / 2 + WIRE.side / 2 };
  }
  const rotOf = (P, a) => {   // the antler's print frame in the band frame at band angle a (degrees): the same turn as buildAt
    const sp = (P.splay - a) * DEG, rk = P.rake * DEG, cs = Math.cos(sp), ss = Math.sin(sp), ck = Math.cos(rk), sk = Math.sin(rk);
    const inv = ([X, Y, Z]) => { const x = X * cs - Z * ss, z1 = X * ss + Z * cs; return [x, Y * ck + z1 * sk, -Y * sk + z1 * ck]; };
    return { X: inv([1, 0, 0]), Y: inv([0, 1, 0]), Z: inv([0, 0, 1]) };
  };
  // The head the cap rests on (band frame): the crowns' typical head at the wearer's head circumference, its top on the
  // band line under the band's inner surface (the scalp, with hair, where the band rests). Modelled near the top as an
  // ellipsoid R across and up and ry front to back (ryF in front, where a forehead drops away more steeply than the
  // crown): R is the circle through the top that drops as the head does at the pedicles, ry gives the head's curve over
  // the top from front to back.
  function capHead(P) {
    const cs = Math.sqrt(1 - RING_SEAT * RING_SEAT), ia = P.headCirc / perimeter(1, RING_ASPECT);
    const r = [RING_ASPECT * ia / cs, ia / cs, ia / cs];   // half-width, half-length, height above its centre (as ringSpec)
    const wire = capWire(P), top = P.hbRadius - (wire ? wire.hc : P.hbThick / 2);   // under a wire, the wire's centre is on the band line
    const x0 = clamp(P.capSpacing / 2, 20, 0.8 * r[0]), d = r[2] * (1 - Math.sqrt(1 - (x0 / r[0]) ** 2)), R = (x0 * x0 + d * d) / (2 * d);
    const ry = Math.sqrt((r[1] * r[1]) / r[2] * R), ryF = 0.88 * ry;
    return { r, top, R, ry, ryF, zc: top - R, ryAt: (s) => (s > 0 ? ryF : ry) };
  }
  // The plate's shape, seen from above (plate coordinates): its outline (a smooth base, wide at the antlers, rounded
  // at the back, narrowing to a point at the front, broken along its edge), and how thick it is where. Cached: the
  // antlers' placement asks for it on every build.
  const PLATES = new Map();
  // cover (optional): [x, s] points the plate must reach past, wherever it would otherwise taper in before them: the wires,
  // which should come out through the plate's sides, not its front or back corners.
  function plateForm(P, cover) {
    const key = ['capSpacing', 'capWidth', 'capLength', 'capBack', 'capSnoutWidth', 'capTaper', 'capJag', 'seed'].map((k) => P[k]).join('|')
      + (cover ? '|' + cover.map((c) => c.map((v) => v.toFixed(1)).join(',')).join(';') : '');
    if (PLATES.has(key)) return PLATES.get(key);
    const X = P.capSpacing / 2, Wm = X + 14 + P.capWidth, F = P.capLength, B = P.capBack;
    const pe = 0.6 + 1.6 * P.capTaper, fw = P.capSnoutWidth;
    // in front: a shoulder past the antlers, then in to a narrow neck at Fb, and the nose: a point over the last of it
    const Fb = 0.74 * F, wn = 7 * Math.sqrt(fw), q = wn / Wm;
    const reach = (s) => {   // how wide the plate must stay at s to cover the points (eased off past them)
      let w = 0;
      for (const [x, sc] of cover || []) w = Math.max(w, (Math.min(x, Wm - 2)) * (1 - sstep((Math.abs(s) - Math.abs(sc) - 10) / 14)) * (s * sc > 0 ? 1 : 0));
      return w;
    };
    const wAt = (s) => Math.max(wBase(s), s > -B && s < Fb ? reach(s) : 0);
    const wBase = (s) => {   // the base outline's half-width (before it's broken)
      if (s <= -B || s >= F) return 0;
      if (s <= 0) return Wm * Math.pow(1 - Math.pow(-s / B, 2.4), 1 / 2.4);   // rounded at the back
      if (s >= Fb) return wn * Math.pow(1 - (s - Fb) / (F - Fb), 0.75);
      const t = s / Fb, sh = sstep(s / Math.max(32, 0.5 * Fb)), body = (Math.pow(1 - t, pe) * (1 - q) + q) / (Math.pow(0.75, pe) * (1 - q) + q);
      return Wm * ((1 - sh) + sh * Math.min(1, fw * body, Math.max(q, body)));
    };
    // Not quite symmetric, as no skull is: each side a little wider or narrower, the point a little to one side, and each
    // side broken its own way
    const rnd = rng(P.seed * 7417 + 3), amp = 16 * P.capJag, aw = 0.035 * (rnd() * 2 - 1), ox = 4 * (rnd() * 2 - 1);
    const skew = (s) => ox * sstep(s / F);   // the midline drifts toward the point
    const sideFor = (sg, wf) => {   // one side's outline, back to front, every 0.5 mm along it, broken
      const base = [];
      { let prev = null;
        for (let s = -B; s <= F + 1e-9; s += 0.02) { const p = [sg * wAt(s) * wf + skew(s), s]; if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) >= 0.5) { base.push(p); prev = p; } }
        base.push([skew(F), F]); }
      const len = [0]; for (let i = 1; i < base.length; i++) len.push(len[i - 1] + Math.hypot(base[i][0] - base[i - 1][0], base[i][1] - base[i - 1][1]));
      const L = len[len.length - 1], noseL = (() => { let i = len.length - 1; while (i > 0 && base[i][1] > Fb) i--; return L - len[i]; })();
      // A broken edge: fragments of mixed kinds and sizes (many small, a few large): spikes with uneven sides, leaning one
      // way or the other, blunt lobes, bites out of the edge, now and then a double point; slow bulges along it; fine
      // chipping all along; and here and there a stretch broken along a suture, finely zigzagged. Fragments and bulges
      // stay off the nose, which is only chipped.
      const sd = rnd() * 100, nz = (l, lam, k) => vnoise(l / lam + sd, k + sd * 0.37, 0.5) * 2 - 1, g = amp / 16;
      const frags = [], sut = [], tip = L - noseL;
      if (amp > 0.2) {
        let at = tip - 2;
        while (at > 4) {
          const wd = 5 + 24 * Math.pow(rnd(), 1.6), side = sstep((at / L - 0.2) / 0.3), r = rnd();
          frags.push({ c0: at - wd, c1: at, a: amp * (0.25 + 0.75 * Math.pow(rnd(), 0.7)) * (0.5 + 0.5 * side),
            kind: r < 0.5 ? 'spike' : r < 0.72 ? 'lobe' : r < 0.86 ? 'bite' : 'double', pk: 0.2 + 0.6 * rnd(), e1: 0.8 + 0.9 * rnd(), e2: 0.8 + 0.9 * rnd() });
          at -= wd * (0.8 + 0.4 * rnd());
        }
        for (let l = 10; l < tip - 10; l += 30 + 40 * rnd()) if (rnd() < 0.45) sut.push([l, l + 14 + 18 * rnd()]);
      }
      const offAt = (l) => {
        let o = 0, bite = 0;
        for (const f of frags) {
          if (l < f.c0 || l > f.c1) continue;
          const u = (l - f.c0) / (f.c1 - f.c0), tri = u < f.pk ? Math.pow(u / f.pk, f.e1) : Math.pow((1 - u) / (1 - f.pk), f.e2);
          if (f.kind === 'spike') o = Math.max(o, f.a * tri);
          else if (f.kind === 'lobe') o = Math.max(o, 0.6 * f.a * Math.pow(Math.sin(Math.PI * u), 0.5));
          else if (f.kind === 'bite') bite = Math.min(bite, -0.45 * f.a * Math.pow(Math.sin(Math.PI * u), 0.8));
          else { const v = (u * 2) % 1; o = Math.max(o, f.a * (u < 0.5 ? 1 : 0.7) * Math.pow(1 - Math.abs(2 * v - 1), 1.2)); }
        }
        const body = sstep((tip - l) / 4);   // fragments and bulges fade out before the nose
        let out = body * (o + bite + 0.3 * amp * nz(l, 38, 1.3)) + g * (1.1 * nz(l, 3.4, 5.1) + 0.5 * nz(l, 1.3, 9.7));
        for (const [l0, l1] of sut) if (l > l0 && l < l1) out += g * 1.2 * (Math.abs(((l / 2.6) % 2) - 1) * 2 - 1) * Math.sin(Math.PI * (l - l0) / (l1 - l0));
        return out;
      };
      return base.map((p, i) => {
        const a = base[Math.max(0, i - 1)], b = base[Math.min(base.length - 1, i + 1)], tx = b[0] - a[0], ts = b[1] - a[1], tl = Math.hypot(tx, ts) || 1;
        const o = offAt(len[i]), hk = 0.22 * nz(len[i], 24, 3.3) * Math.min(1, Math.max(0, o) / 4);   // outward, the points leaning
        const nx = sg * ts / tl, ns = -sg * tx / tl, c = Math.cos(hk), sn = Math.sin(hk);
        return [p[0] + (nx * c - ns * sn) * o, p[1] + (nx * sn + ns * c) * o];
      });
    };
    const right = sideFor(1, 1 + aw), left = sideFor(-1, 1 - aw), half = right;
    const poly = right.concat(left.slice(1, -1).reverse());   // the whole outline, closed
    // signed distance to the outline (mm, negative inside), on a 0.5 mm grid, made on first use
    const GS = 0.5, xm = Wm * 1.05 + amp + 20, gx0 = -xm, gs0 = -B - 16, gnx = Math.ceil(2 * xm / GS) + 1, gns = Math.ceil((F + B + amp + 32) / GS) + 1;
    let SDF = null;
    const sdfTable = () => {
      const D = new Float32Array(gnx * gns).fill(8), CAP = 8;
      const segs = []; for (let i = 0; i < poly.length; i++) segs.push([poly[i], poly[(i + 1) % poly.length]]);
      const B8 = new Map(), cell = (x, s) => Math.floor(x / CAP) + ',' + Math.floor(s / CAP);
      for (const sg of segs) {   // bucket the edges, so each grid point only looks at those within 8 mm
        const x0 = Math.min(sg[0][0], sg[1][0]) - CAP, x1 = Math.max(sg[0][0], sg[1][0]) + CAP, s0 = Math.min(sg[0][1], sg[1][1]) - CAP, s1 = Math.max(sg[0][1], sg[1][1]) + CAP;
        for (let cx = Math.floor(x0 / CAP); cx <= Math.floor(x1 / CAP); cx++) for (let cs = Math.floor(s0 / CAP); cs <= Math.floor(s1 / CAP); cs++) { const k = cx + ',' + cs; (B8.get(k) || B8.set(k, []).get(k)).push(sg); }
      }
      for (let j = 0; j < gns; j++) {
        const s = gs0 + j * GS, xs = [];   // where this row crosses the outline, for inside or out
        for (const [a, b] of segs) if ((a[1] <= s) !== (b[1] <= s)) xs.push(a[0] + (b[0] - a[0]) * (s - a[1]) / (b[1] - a[1]));
        xs.sort((u, v) => u - v);
        for (let i = 0; i < gnx; i++) {
          const x = gx0 + i * GS;
          let m = CAP; for (const [a, b] of B8.get(cell(x, s)) || []) {
            const ex = b[0] - a[0], es = b[1] - a[1], l2 = ex * ex + es * es || 1, t = clamp(((x - a[0]) * ex + (s - a[1]) * es) / l2, 0, 1);
            m = Math.min(m, Math.hypot(a[0] + t * ex - x, a[1] + t * es - s));
          }
          let inside = false; for (const c of xs) if (c < x) inside = !inside;
          D[j * gnx + i] = inside ? -m : m;
        }
      }
      return D;
    };
    const sdf = (x, s) => {   // the outline, from above
      if (!SDF) SDF = sdfTable();
      const fx = (x - gx0) / GS, fs = (s - gs0) / GS;
      if (fx < 0 || fx > gnx - 1.001 || fs < 0 || fs > gns - 1.001) return 8;
      const i = fx | 0, j = fs | 0, u = fx - i, v = fs - j, o = j * gnx + i;
      return (SDF[o] + (SDF[o + 1] - SDF[o]) * u) * (1 - v) + (SDF[o + gnx] + (SDF[o + gnx + 1] - SDF[o + gnx]) * u) * v;
    };
    // the narrower side's half-width at s, measured from the middle (for what has to sit inside the plate on both sides):
    // the smooth outline, or where the broken edge comes further in
    const edgeIn = (side, s) => { let m = Infinity; for (let i = 1; i < side.length; i++) { const a = side[i - 1], b = side[i]; if ((a[1] <= s) !== (b[1] <= s)) m = Math.min(m, Math.abs(a[0] + (b[0] - a[0]) * (s - a[1]) / (b[1] - a[1]))); } return m; };
    const wIn = (s) => Math.min(wAt(s) * (1 - Math.abs(aw)) - Math.abs(skew(s)), edgeIn(right, s), edgeIn(left, s));
    const out = { X, Wm, F, B, aw, wAt, wIn, skew, half, poly, sdf, sF: F + amp, sB: -B - amp };
    PLATES.set(key, out); if (PLATES.size > 24) PLATES.delete(PLATES.keys().next().value);
    return out;
  }
  // Where the parts go, in the band frame: the plate, and for the right antler its print frame (origin Q, axes
  // X, Y, Z) standing on its pedicle. The left is the mirror image (x → −x).
  function skullSpec(params, antlerBase) {
    const P = resolveParams(params);
    const band = { r: P.hbRadius, w: P.hbWidth, t: P.hbThick, gap: P.clearance };
    const head = capHead(P), rin = head.top, { ry, ryF, ryAt } = head;
    // between plate coordinates and the band frame, on the head itself: across, along the head's oval (half-width a, height
    // b over the ear-to-ear axis C, so the plate follows it down the sides), and front to back round C (the head's length
    // Ry, so a long nose lies on the forehead). h is straight off the head; x and s are lengths along it at every height.
    const Ry = head.r[1], cz = rin - Ry, oa = head.r[0], ob = head.r[2], e0 = Ry - ob;
    const tw = (t) => Math.sqrt(oa * oa * Math.cos(t) ** 2 + ob * ob * Math.sin(t) ** 2);   // the oval's speed at angle t
    const LN = 1024, LT = 2.4, Lt = new Float64Array(LN + 1);   // arc length over the top, from the middle, by angle
    for (let i = 1; i <= LN; i++) { const t0 = ((i - 1) * LT) / LN, t1 = (i * LT) / LN; Lt[i] = Lt[i - 1] + ((t1 - t0) / 6) * (tw(t0) + 4 * tw((t0 + t1) / 2) + tw(t1)); }
    const arcAt = (t) => { const u = clamp(t / LT, 0, 1) * LN, i = Math.min(LN - 1, Math.floor(u)); return Lt[i] + (Lt[i + 1] - Lt[i]) * (u - i); };
    const turn = (t) => Math.atan2(ob * Math.sin(t), oa * Math.cos(t));   // how far the oval's normal has turned from straight up
    const across = (x, h) => {   // the angle t where the length along the oval, h off it, reaches x (≥ 0)
      let lo = 0, hi = LN;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (Lt[m] < x) lo = m; else hi = m; }
      let t = (lo * LT) / LN;
      for (let i = 0; i < 4; i++) { const v = tw(t); t -= (arcAt(t) + h * turn(t) - x) / (v + h * oa * ob / (v * v)); }
      return t;
    };
    const fromSkull = (x, s, h) => {
      const t = across(Math.abs(x), h), v = tw(t), st = Math.sin(t), ct = Math.cos(t);
      const px = oa * st + (h * ob * st) / v, c = Math.max(10, e0 + ob * ct + (h * oa * ct) / v), ph = s / c;
      return [Math.sign(x) * px, c * Math.sin(ph), cz + c * Math.cos(ph)];
    };
    const toSkull = (p) => {
      const y = p[1], z = p[2] - cz, ph = Math.atan2(y, z), c = Math.hypot(y, z), qx = Math.abs(p[0]), qz = c - e0;
      let t = Math.atan2(qx / oa, qz / ob);
      for (let i = 0; i < 4; i++) {   // the nearest point on the oval
        const st = Math.sin(t), ct = Math.cos(t), dx = qx - oa * st, dz = qz - ob * ct;
        t -= (dx * oa * ct - dz * ob * st) / (-(oa * oa * ct * ct + ob * ob * st * st) - dx * oa * st - dz * ob * ct);
      }
      const st = Math.sin(t), ct = Math.cos(t), v = tw(t), h = ((qx - oa * st) * ob * st + (qz - ob * ct) * oa * ct) / v;
      return [Math.sign(p[0]) * (arcAt(t) + h * turn(t)), ph * c, h];
    };
    // the wires (on a double-wire headband): each in its plane, through where it crosses the top of the head (s0, its
    // centre hc off the head) and where it is just above the ear (J: at the tape line, ob below the top, the pair
    // wireEarGap apart there). dp: signed distance from the plane (+ toward the face); sAt: where it crosses x.
    const wire = capWire(P), crossings = wire ? [fromSkull(0, P.wireFront, wire.hc), fromSkull(0, -P.wireBack, wire.hc)] : [];
    const earY = wire ? (crossings[0][1] + crossings[1][1]) / 2 - WIRE.lean * ob : 0;
    const wires = !wire ? [] : [['front', P.wireFront, 1], ['back', -P.wireBack, -1]].map(([name, s0, sg], i) => {
      const J = [0, earY + sg * P.wireEarGap / 2, rin - ob], T = crossings[i];
      const n = norm([0, T[2] - J[2], J[1] - T[1]]), dp = (p) => (p[1] - J[1]) * n[1] + (p[2] - J[2]) * n[2];
      const sAt = (x) => { let s = s0; for (let i = 0; i < 8; i++) { const d0 = dp(fromSkull(x, s, wire.hc)), d1 = dp(fromSkull(x, s + 0.5, wire.hc)); s -= d0 * 0.5 / (d1 - d0); } return s; };
      return { name, s0, J, n, dp, sAt };
    });
    const wd = (x, s) => { let d = Infinity; for (const w of wires) d = Math.min(d, Math.abs(w.dp(fromSkull(x, s, wire.hc)))); return d; };   // to the nearest wire
    // the outline, wide enough that each wire comes out through the plate's sides (4 mm short of them, its broken edge aside)
    const Wm = P.capSpacing / 2 + 14 + P.capWidth, cover = [];
    for (const w of wires) for (let x = 0; x <= Wm - 6; x += 3) cover.push([x + 4, w.sAt(x)]);
    const form = plateForm(P, wires.length ? cover : null);
    // the plate's underside and top (smooth: no texture), h off the head, from how far in from its edge it is
    const bandH = band.t + band.gap / 2, groW = wire ? wire.hw + WIRE.fit : (band.w + band.gap) / 2;
    // thicker over the channel, eased in: over a wire, enough for its roof all the way out (the plate thins at its edge),
    // and eased in faster, to keep the bump narrow
    const over = (dIn) => (wire ? wire.hc + wire.D / 2 + WIRE.roof - bottomAt(dIn) - thickAt(dIn) : bandH + PLATE.band - PLATE.t);
    const swellAt = (x, s, dIn) => over(dIn) * (1 - (wire ? sstep((wd(x, s) - groW - 1) / 14) : sstep((Math.abs(s) - groW - 1) / 26)));
    const ridgeAt = (x, s) => (1 + 0.8 * sstep((s + form.B) / (form.B + form.F))) * (1 - sstep((Math.abs(x - form.skew(s)) - 3.5) / 6));   // flat-topped, higher in front
    const bottomAt = (dIn) => PLATE.gap + PLATE.lift * (1 - sstep(dIn / 5));                  // the edge curls just off the head
    const thickAt = (dIn) => PLATE.edge + (PLATE.t - PLATE.edge) * sstep(dIn / 7);
    const topAt = (x, s, dIn) => bottomAt(dIn) + thickAt(dIn) + Math.max(swellAt(x, s, dIn), 0) + ridgeAt(x, s);
    const rp = Math.max(antlerBase || 14, PEG.r + 6);   // the pedicle's top matches the antler's base
    const inAt = (x, s) => form.wIn(s) - Math.abs(x);   // near enough, inside the plate
    const B0 = fromSkull(form.X, 0, topAt(form.X, 0, inAt(form.X, 0)) - 0.5), a = Math.atan2(B0[0], B0[2]) / DEG;
    const F = rotOf(P, a), Q = add(B0, mul(F.Z, P.capPedicle));
    // the rim (the outline on the head) and the top, every few mm, for the print plane and the plate's extent
    const rim = [], tops = [];
    for (const [x, s] of form.poly) rim.push(fromSkull(x, s, PLATE.gap + PLATE.lift));   // the edge's underside, curled off the head
    for (let s = -form.B; s <= form.F; s += 4) for (const f of [0, 0.5, 0.85]) { const x = f * form.wAt(s); tops.push(fromSkull(x, s, topAt(x, s, inAt(x, s)) + 1.5)); }
    tops.push(Q);
    // the plane it stands on to print: under the rim, tilted to keep the part as low as it goes
    let best = null;
    for (let kk = -1.6; kk <= 1.6; kk += 0.02) {
      let lo = Infinity, hi = -Infinity;
      for (const p of rim) lo = Math.min(lo, p[2] - kk * p[1]);
      for (const p of tops) hi = Math.max(hi, p[2] - kk * p[1]);
      const height = (hi - lo) / Math.hypot(1, kk);
      if (!best || height < best.height) best = { k: kk, lo, height };
    }
    const n = norm([0, -best.k, 1]), h0 = best.lo / Math.hypot(1, best.k) + 0.8;   // a little into the rim, so it stands on a flat
    // the ribbon slots (right side; the left mirrors them), one behind the band (capTie) and one in front (capTieFront),
    // each where it's best: at the plate's side edge if it can be (a ribbon goes up through it and back down over the
    // edge), outboard of the antler, near the band; never on the antler's collar or off the plate. Where the edge is
    // taken (the plate narrows in front, or is short behind), it moves in rather than going missing.
    // Each slot lies along the edge where it sits (front, the edge runs in toward the nose), with a strip of plate at least
    // 3.5 mm wide between it and the broken edge. Worked out only for the cap itself (antlerBase given), not for every
    // antler build.
    const slots = [], clear = rp * 1.65 + 2.5;
    const ws = (s) => form.wAt(s) * (1 - Math.abs(form.aw)) - Math.abs(form.skew(s));   // the smooth outline, narrower side
    const place = (sg) => {
      let best = null;
      for (let a = groW + 3; a < 160; a += 1) {
        const s = sg * a, w = ws(s); if (!(w > 14)) continue;
        const dw = (ws(s + 1) - ws(s - 1)) / 2, tl = Math.hypot(dw, 1), T = [dw / tl, 1 / tl], N = [-1 / tl, dw / tl];   // along the edge; inward
        for (let d = 6.5; d < 40; d += 0.5) {
          const c = [w + N[0] * d, s + N[1] * d];
          if (c[0] < 8) break;
          let fits = true;
          for (let u = -SLOT.len / 2 - 1; u <= SLOT.len / 2 + 1 && fits; u += 1) {
            const e = [c[0] + T[0] * u, c[1] + T[1] * u];
            if (form.sdf(e[0] - N[0] * (SLOT.w / 2 + 3.5), e[1] - N[1] * (SLOT.w / 2 + 3.5)) > -0.3) fits = false;   // the strip outside it
            if (wire ? sg * e[1] < 2 || wd(e[0], e[1]) < groW + 2 : sg * e[1] < groW + 2) fits = false;            // its own side of the band's channel (clear of a wire's)
            if (Math.hypot(e[0] - form.X, e[1]) < clear) fits = false;                                              // off the antler's collar
          }
          if (!fits) continue;
          // best at the edge and near the band; beside the antler, outboard; never toward the middle (a ribbon there is no use)
          const outboard = c[0] >= form.X + 4 || Math.abs(c[1]) - SLOT.len / 2 >= clear + 8;
          const score = 2 * (d - 6.5) + 0.6 * (a - groW - 3) + (outboard ? 0 : 6) + Math.max(0, 0.65 * form.X - c[0]) * 3;
          if (!best || score < best.score) best = { x: c[0], s: c[1], t: T, score };
          break;   // the outermost spot that fits at this s is the best there
        }
      }
      return best && { x: best.x, s: best.s, t: best.t, p: fromSkull(best.x, best.s, 0) };
    };
    const slotsMissing = [];   // asked for, but the plate's too short there (past the band's channel, clear of the collar)
    if (antlerBase != null) for (const [on, sg] of [[P.capTieFront, 1], [P.capTie, -1]]) if (on) { const q = place(sg); if (q) slots.push(q); else slotsMissing.push(sg > 0 ? 'front' : 'back'); }
    // the bobby-pin grooves: on top, in from the edge, one in front of the antlers and one behind (right side)
    // (the back one where it's furthest from the ribbon slots)
    let sBack = -0.55 * form.B, far = -1;
    const offWire = (sq) => !wire || Math.min(wd(form.wAt(sq) - 1, sq), wd(form.wIn(sq) - PIN.len, sq)) > groW + 3;   // not over a wire's channel
    for (let sq = -0.3 * form.B; sq >= -0.85 * form.B; sq -= 1) {
      if (!offWire(sq)) continue;
      const d = slots.length ? Math.min(...slots.map((sl) => Math.abs(sq - sl.s) - SLOT.len / 2)) : 99;
      if (d > far + 0.5) { far = d; sBack = sq; }
    }
    let sFront = 0.55 * form.F, farF = -1;   // and the front one likewise
    for (let sq = 0.35 * form.F; sq <= 0.75 * form.F; sq += 1) {
      if (!offWire(sq)) continue;
      const d = slots.length ? Math.min(...slots.map((sl) => Math.abs(sq - sl.s) - SLOT.len / 2)) : 99;
      if (d > farF + 0.5) { farF = d; sFront = sq; }
    }
    const pins = P.capPins ? [sFront, sBack].map((s) => ({ s, x0: form.wIn(s) - PIN.len, back: s < 0, p: fromSkull(form.wAt(s), s, 0) })) : [];
    return { P, band, wire, wires, wd, groW, head, rin, ry, ryF, ryAt, form, fromSkull, toSkull, topAt, bottomAt, a, rp, B0, Q, F, n, h0, rim, slots, slotsMissing, pins, peg: PEG };
  }
  function buildSkullCap(params) {
    const ant = buildSkeleton(params);   // the antlers as they'll be printed (after shrink-to-fit), for the pedicle size
    const g = skullSpec(params, ant.mount.rf), P = g.P, k = g.form, H = g.head;
    const toSkull = g.toSkull;
    const groW = g.groW, bandH = g.band.t + g.band.gap / 2, so = P.seed * 1.37, W = g.wire;
    // each wire strip's two pins: both on its front side, so it only goes in one way round (x across; y: from the wire's
    // plane, + toward the face), a third of the way in from each end of the strip (one, in the middle, on a short strip)
    // Each strip runs out from the middle to where its wire first comes within WIRE.end of the edge (run: x from and to), so
    // a notch in the broken edge never leaves a separate scrap of strip beyond it.
    const along = (w, sx, m) => { let x = 0; while (Math.abs(x) < 200 && -k.sdf(x + 0.25 * sx, w.sAt(x + 0.25 * sx)) > m) x += 0.25 * sx; return x; };
    const runs = g.wires.map((w) => [along(w, -1, WIRE.end), along(w, 1, WIRE.end)]);
    const wpins = g.wires.map((w) => {
      const xl = along(w, -1, WIRE.end + 2.5), xr = along(w, 1, WIRE.end + 2.5);
      return (xr - xl > 8 ? [0.3, 0.7] : [0.5]).map((u) => ({ x: xl + u * (xr - xl), y: W.pinY }));
    });
    const peds = [1, -1].map((s) => {
      const fl = (v) => [s * v[0], v[1], v[2]];
      const Q = fl(g.Q), Z = fl(g.F.Z), X = fl(g.F.X), A = add(fl(g.B0), mul(Z, -2));
      return { Q, Z, X, A, L: vlen(sub(Q, A)), s };
    });
    // sutures: thin grooves that meander, interlocking unevenly (the fingers vary in size and spacing), down the middle
    // and across behind the antlers
    const fb = (u, k) => (vnoise(u + so, k, 0.7) - 0.5) * 2;
    const zig = (u, f, a) => {
      const meander = a * (1.6 * fb(u / 14, 4.1) + 0.7 * fb(u / 5, 7.3)), amp = a * (0.55 + 0.6 * Math.abs(fb(u / 9, 2.9)));
      const ph = u * f + 1.4 * fb(u / 6, 5.5), tri = Math.abs(((ph % 2) + 2) % 2 - 1) * 2 - 1;
      return meander + amp * tri * Math.abs(tri) ** -0.3;
    };
    const f = (p) => {   // band frame
      const [x, s, h] = toSkull(p), ax = Math.abs(x);
      const dIn = -k.sdf(x, s);
      let d;
      {
        const bot = PLATE.gap + PLATE.lift * (1 - sstep(dIn / 5));
        const cut = W ? sstep((g.wd(x, s) - groW - 1) / 4) : 1;   // over a wire's channel, nothing cut deep into the roof
        let top = g.topAt(x, s, dIn);
        top += (0.4 + 0.6 * cut) * (0.35 * (vnoise(x * 0.22 + so, s * 0.22, 1.3) - 0.5) + 0.25 * (vnoise(x * 0.6, s * 0.6 + so, 7.7) - 0.5));   // weathered bone
        // its grain, faint and running along the skull, and pores: sparse, uneven, drawn out along the grain
        top -= 0.12 * Math.abs(vnoise(x * 1.6 + so, s * 0.25, 8.8) * 2 - 1) ** 0.5;
        const pore = vnoise(x * 0.9 + so, s * 0.38, 3.3) * 0.75 + vnoise(x * 2.1, s * 0.8 + so, 4.4) * 0.25, deep = vnoise(x * 0.15, s * 0.15 + so, 9.1);
        if (pore > 0.74) top -= cut * (0.25 + 0.7 * deep) * Math.min(1, (pore - 0.74) / 0.1);
        // the broken edge chipped: its top flaked away unevenly near the edge, so the fracture faces vary
        if (dIn < 4) top -= cut * (1 - sstep(dIn / 4)) * Math.min(1, 1.6 * P.capJag) * 1.5 * Math.max(0, vnoise(x * 0.32 + so, s * 0.32, 2.2) * 0.7 + vnoise(x * 0.9, s * 0.9 + so, 6.1) * 0.5 - 0.45);
        const mid = Math.abs(x - k.skew(s) - zig(s, 0.45, 0.7)), cor = Math.abs(s + 14 + zig(x + 40, 0.38, 1.1));   // the sutures
        if (s > -k.B + 6 && s < k.F - 6) top -= cut * 0.5 * Math.max(0, 1 - mid / 0.5);
        if (ax < k.wAt(-14) - 10) top -= cut * 0.45 * Math.max(0, 1 - cor / 0.5);
        top = Math.max(top, bot + 1.2);   // chips, pits and sutures never wear through
        d = smax(smax(-dIn, bot - h, 1), h - top, 1);   // the plate, its edges rounded
      }
      // the pedicles: collars from the plate up to the antler's base, flaring unevenly into the plate (never a turned disc),
      // and the D-shaped pegs on top
      for (const q of peds) {
        const w = sub(p, q.A), hh = dot(w, q.Z), rad = vlen(sub(w, mul(q.Z, hh))), u = clamp(hh / q.L, 0, 1);
        const lump = vnoise(p[0] * 0.18 + so, p[1] * 0.18, p[2] * 0.18) - 0.5, rr = g.rp * (1 + (0.6 + 0.5 * lump) * (1 - sstep(u)));
        d = smin(d, Math.max(rad - rr * (1 + 0.06 * (vnoise(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5) - 0.5)), -hh, hh - q.L), 6 + 3 * lump);
        const wq = sub(p, q.Q), hq = dot(wq, q.Z), xq = dot(wq, q.X);   // q.X is mirrored already: the flat faces the midline on both
        const rq = vlen(sub(wq, mul(q.Z, hq)));
        d = Math.min(d, Math.max(rq - PEG.r + Math.max(0, hq - PEG.h + 0.8), -PEG.flat - xq, hq - PEG.h, -hq - 1));   // chamfered at the top
      }
      // nothing below the plate's underside (the collars stop at it), the headband's channel cut up into it (its edges
      // rounded), the ribbon slots straight through, and the bobby-pin grooves in its top
      d = Math.max(d, PLATE.gap - h);
      if (W) g.wires.forEach((w, i) => {   // each wire: its channel (the upper half here), its strip's pocket under it, and the holes for its pins
        const y = w.dp(p);
        d = Math.max(d, -(Math.hypot(y, h - W.hc) - W.D / 2));
        d = Math.max(d, -Math.max(Math.abs(y) - groW, h - W.hc, WIRE.end - WIRE.fit - dIn, runs[i][0] - WIRE.fit - x, x - runs[i][1] - WIRE.fit));
        for (const q of wpins[i]) d = Math.max(d, -Math.max(Math.hypot(x - q.x, y - q.y) - WIRE.pin.r - WIRE.pin.gap, h - W.hc - WIRE.pin.h - 0.3, W.hc - 1 - h));
      });
      else d = smax(d, -Math.max(Math.abs(p[1]) - groW, h - bandH), 1);
      for (const sl of g.slots) { const qx = ax - sl.x, qs = s - sl.s, u = qx * sl.t[0] + qs * sl.t[1], v = qx * sl.t[1] - qs * sl.t[0]; d = Math.max(d, -Math.max(Math.abs(u) - SLOT.len / 2, Math.abs(v) - SLOT.w / 2)); }
      for (const pn of g.pins) if (Math.abs(s - pn.s) < PIN.w / 2 + 0.01 && ax > pn.x0) d = Math.max(d, -Math.max(Math.abs(s - pn.s) - PIN.w / 2, pn.x0 - ax, g.topAt(x, s, dIn) - PIN.depth - h));
      return d;
    };
    // print frame: the plane under the rim is the bed (Z = 0), lowered onto the plate's actual lowest point, 0.5 mm in so
    // it stands on a flat
    const Zp = g.n, Xp = [1, 0, 0], Yp = cross(Zp, Xp);
    let O = mul(Zp, g.h0);
    const toBand = (x, y, z) => [O[0] + Xp[0] * x + Yp[0] * y + Zp[0] * z, O[1] + Xp[1] * x + Yp[1] * y + Zp[1] * z, O[2] + Xp[2] * x + Yp[2] * y + Zp[2] * z];
    const mir = (v) => [-v[0], v[1], v[2]];
    {   // straight up through the plane from under each rim point; it rests on its few lowest, not one tooth's tip
      const zs = [];
      for (const b of g.rim) for (const m of [b, mir(b)]) {
        const v = sub(m, O), x = dot(v, Xp), y = dot(v, Yp);
        for (let z = -4; z < 12; z += 0.1) if (f(toBand(x, y, z)) < 0) { zs.push(z); break; }
      }
      zs.sort((a, b) => a - b);
      if (zs.length) O = add(O, mul(Zp, zs[Math.min(3, zs.length - 1)] + 0.5));
    }
    // its extent in the print frame: around the rim, the top and the pegs, then measured on a coarse grid
    const wide = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const grow = (b) => { const v = sub(b, O), pp = [dot(v, Xp), dot(v, Yp), dot(v, Zp)]; for (let j = 0; j < 3; j++) { wide[j] = Math.min(wide[j], pp[j] - 12); wide[j + 3] = Math.max(wide[j + 3], pp[j] + 12); } };
    for (const b of g.rim) { grow(b); grow(mir(b)); }
    for (let s = -k.B; s <= k.F; s += 4) grow(g.fromSkull(0, s, 12));
    for (const q of peds) grow(add(q.Q, mul(q.Z, PEG.h + 2)));
    wide[2] = 0;
    const bb = [Infinity, Infinity, 0, -Infinity, -Infinity, -Infinity], st = 2;   // only points inside count
    for (let x = wide[0]; x <= wide[3]; x += st) for (let y = wide[1]; y <= wide[4]; y += st) for (let z = st / 2; z <= wide[5]; z += st) {
      if (f(toBand(x, y, z)) > 0) continue;
      bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[3] = Math.max(bb[3], x); bb[4] = Math.max(bb[4], y); bb[5] = Math.max(bb[5], z);
    }
    const ext = bb.slice();   // the part itself, to within the grid (for the fit); the mesher gets a margin round it
    for (let j = 0; j < 3; j++) { bb[j] -= 4 * st; bb[j + 3] += 4 * st; }   // (a grid step can miss up to st of a thin edge)
    bb[2] = -2;
    const field = (x, y, z) => f(toBand(x, y, z));
    const sk = {
      params: P, kind: 'skull', scale: 1, branches: [], fields: [{ f: field, bb }], mount: { type: 'cap' },
      texture: { groove: 0, grooves: 9, pearl: 0, knob: 0 }, fillet: 2, r0: 0,
      // print frame → band frame, as a column-major 4 × 4 (three.js Matrix4.fromArray)
      toBand: [Xp[0], Xp[1], Xp[2], 0, Yp[0], Yp[1], Yp[2], 0, Zp[0], Zp[1], Zp[2], 0, O[0], O[1], O[2], 1],
      spec: g,
    };
    const w = ext[3] - ext[0] + st, dd = ext[4] - ext[1] + st, h = ext[5] + st / 2;
    const fp = bestFootprint([[ext[0], ext[1]], [ext[0] + w, ext[1]], [ext[0] + w, ext[1] + dd], [ext[0], ext[1] + dd]], P.bedX - 2 * BED_MARGIN, P.bedY - 2 * BED_MARGIN);
    sk.fit = { scale: 1, requested: 1, shrunk: false, angle: fp.angle, w, d: dd, h, xyRatio: fp.ratio, zRatio: h / (P.bedZ - 1), fits: fp.ratio <= 1 && h <= P.bedZ - 1 };
    if (W) {   // a strip for each wire the plate reaches; a wire it doesn't (the front one past a short front reach) is named
      sk.strips = []; sk.wiresMissing = [];
      g.wires.forEach((w, i) => { const st = wireStrip(P, g, w, wpins[i], runs[i]); if (st) sk.strips.push(st); else sk.wiresMissing.push(w.name); });
    }
    return sk;
  }
  // A wire strip (capBand 'wire' or 'wires'): the bottom of the clamshell round one wire, a thin curved strip with the lower
  // half of its channel and two pins on top. It fills its pocket under the cap (less the glue gap) and prints standing on
  // its flat back side (the plane hw behind the wire's, away from the face), its curve flat on the plate: no supports.
  // null if the plate doesn't reach the wire.
  function wireStrip(P, g, w, wpins, run) {
    const W = g.wire, k = g.form, toSkull = g.toSkull;
    const f = (p) => {   // band frame
      const [x, s, h] = toSkull(p), dIn = -k.sdf(x, s), y = w.dp(p);
      let d = Math.max(Math.abs(y) - W.hw, h - W.hc, g.bottomAt(dIn) - h, WIRE.end - dIn, run[0] - x, x - run[1]);
      d = Math.max(d, -(Math.hypot(y, h - W.hc) - W.D / 2));
      for (const q of wpins) {   // chamfered at the tip, so it finds its hole
        const rq = Math.hypot(x - q.x, y - q.y);
        d = Math.min(d, Math.max(rq - WIRE.pin.r + Math.max(0, h - W.hc - WIRE.pin.h + 0.3), h - W.hc - WIRE.pin.h, W.hc - 0.5 - h));
      }
      return d;
    };
    // print frame: x across, z off the back side (the wire plane's normal), y = z × x
    const Zp = w.n, Xp = [1, 0, 0], Yp = cross(Zp, Xp), O = add(w.J, mul(Zp, -W.hw));
    const toBand = (x, y, z) => [O[0] + Xp[0] * x + Yp[0] * y + Zp[0] * z, O[1] + Xp[1] * x + Yp[1] * y + Zp[1] * z, O[2] + Xp[2] * x + Yp[2] * y + Zp[2] * z];
    let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];   // its extent across and along y, from the head's curve under the wire
    for (let x = -k.wAt(w.s0) - 12; x <= k.wAt(w.s0) + 12; x += 2) for (const h of [0, W.hc + WIRE.pin.h + 1]) {
      const v = sub(g.fromSkull(x, w.sAt(x), h), O), px = dot(v, Xp), py = dot(v, Yp);
      lo = [Math.min(lo[0], px), Math.min(lo[1], py)]; hi = [Math.max(hi[0], px), Math.max(hi[1], py)];
    }
    const st = 1, bb = [Infinity, Infinity, 0, -Infinity, -Infinity, -Infinity];
    for (let x = lo[0]; x <= hi[0]; x += st) for (let y = lo[1] - 3; y <= hi[1] + 3; y += st) for (let z = st / 2; z <= 2 * W.hw; z += st) {
      if (f(toBand(x, y, z)) > 0) continue;
      bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[3] = Math.max(bb[3], x); bb[4] = Math.max(bb[4], y); bb[5] = Math.max(bb[5], z);
    }
    if (!(bb[3] > bb[0] + 10)) return null;   // the plate doesn't reach this wire
    const ext = bb.slice();
    for (let j = 0; j < 3; j++) { bb[j] -= 4 * st; bb[j + 3] += 4 * st; }
    bb[2] = -2;
    const sk = {
      params: P, kind: 'skull', scale: 1, branches: [], fields: [{ f: (x, y, z) => f(toBand(x, y, z)), bb }], mount: { type: 'cap' },
      texture: { groove: 0, grooves: 9, pearl: 0, knob: 0 }, fillet: 1, r0: 0, wire: w.name,
      toBand: [Xp[0], Xp[1], Xp[2], 0, Yp[0], Yp[1], Yp[2], 0, Zp[0], Zp[1], Zp[2], 0, O[0], O[1], O[2], 1],   // print frame → band frame (column-major 4 × 4)
    };
    const ww = ext[3] - ext[0] + st, dd = ext[4] - ext[1] + st, h = ext[5] + st / 2;
    const fp = bestFootprint([[ext[0], ext[1]], [ext[0] + ww, ext[1]], [ext[0] + ww, ext[1] + dd], [ext[0], ext[1] + dd]], P.bedX - 2 * BED_MARGIN, P.bedY - 2 * BED_MARGIN);
    sk.fit = { scale: 1, requested: 1, shrunk: false, angle: fp.angle, w: ww, d: dd, h, xyRatio: fp.ratio, zRatio: h / (P.bedZ - 1), fits: fp.ratio <= 1 && h <= P.bedZ - 1 };
    return sk;
  }

  /* ----------------------------------------------------------------- mesher */
  const BIG = 1e4;
  function smin(a, b, k) {
    const h = k - Math.abs(a - b);
    if (h <= 0) return a < b ? a : b;
    const hh = h / k;
    return (a < b ? a : b) - hh * hh * k * 0.25;
  }

  // A branch's section, from one segment: flattened along F (oval), a carved keel, and toward faceted a diamond
  // (the same area as the circle): a crown piece keeps a round back against the head and cuts its outer face into
  // two facets meeting in a ridge; an antler becomes a full diamond. (wx, wy, wz): from the axis point at h; d:
  // the round distance.
  const KH = Math.sqrt(Math.PI / (Math.PI / 2 + 1)), KD = Math.sqrt(Math.PI / 2), R2 = Math.SQRT1_2;
  const smax = (a, b, k) => { const hh = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + hh * hh * k * 0.25; };
  function shapeSection(g, s, h, wx, wy, wz, d) {
    const rloc = s.ra + (s.rb - s.ra) * h, wl = Math.sqrt(wx * wx + wy * wy + wz * wz) + 1e-9, fa = g.facet, u = s.u;
    if (fa > 0) {
      let O0 = s.Oa[0] + (s.Ob[0] - s.Oa[0]) * h, O1 = s.Oa[1] + (s.Ob[1] - s.Oa[1]) * h, O2 = s.Oa[2] + (s.Ob[2] - s.Oa[2]) * h;
      const ou = O0 * u[0] + O1 * u[1] + O2 * u[2]; O0 -= u[0] * ou; O1 -= u[1] * ou; O2 -= u[2] * ou;
      const ol = Math.sqrt(O0 * O0 + O1 * O1 + O2 * O2) || 1; O0 /= ol; O1 /= ol; O2 /= ol;
      const G0 = u[1] * O2 - u[2] * O1, G1 = u[2] * O0 - u[0] * O2, G2 = u[0] * O1 - u[1] * O0;
      // edges get a small polish radius (e), so ridges print and light cleanly instead of as a beaded line
      const e = 0.12 * rloc, gy = wx * G0 + wy * G1 + wz * G2, x = wx * O0 + wy * O1 + wz * O2;
      const y = Math.sqrt(gy * gy + e * e) - e, rp = Math.sqrt(x * x + gy * gy);
      const dg = g.half ? smax(rp - rloc * KH, (x + y - rloc * KH) * R2, e) : (Math.sqrt(x * x + e * e) - e + y - rloc * KD) * R2;
      d += fa * (dg - (rp - rloc));
    }
    if (g.ov > 0) {   // keel: a carved ridge along F
      const F0 = s.Fa[0] + (s.Fb[0] - s.Fa[0]) * h, F1 = s.Fa[1] + (s.Fb[1] - s.Fa[1]) * h, F2 = s.Fa[2] + (s.Fb[2] - s.Fa[2]) * h;
      const cf = (wx * F0 + wy * F1 + wz * F2) / (wl * (Math.sqrt(F0 * F0 + F1 * F1 + F2 * F2) || 1));
      d += rloc * g.ov * cf * cf; if (g.keel && cf > 0) d -= rloc * g.keel * cf ** 8;
    }
    return d;
  }

  function buildGroups(skel, margin) {
    const groups = [], hd = skel.head;
    const T = skel.texture;
    const extra = T.groove + T.pearl + 0.5;
    for (const br of skel.branches) {
      const segs = [];
      const ov = br.ov || 0;
      const gb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      // crown pieces: sculpted = polished; biomechanical = deep grain and nodules; faceted = cut, with crisper joins
      const crownPiece = br.sculpt != null, sc = br.sculpt || 0, gg = br.giger || 0, fa = br.kind === 'liner' ? 0 : facetOf(skel.params);
      // per-point frames, so the section turns smoothly along the curve (per-segment frames left faint creases)
      const pts = br.pts, np = pts.length, tan = pts.map((_, i) => norm(sub(pts[Math.min(np - 1, i + 1)], pts[Math.max(0, i - 1)])));
      const Fpt = pts.map((_, i) => { const f = perp(br.Fp ? br.Fp[i] : br.F, tan[i]); return vlen(f) > 1e-3 ? norm(f) : br.N[i]; });
      // the diamond's ridge faces away from the head on a crown, along F on an antler
      const Opt = fa > 0 && crownPiece && hd ? pts.map((p, i) => { const o = perp(norm([(p[0] - hd.c[0]) / hd.r[0] ** 2, (p[1] - hd.c[1]) / hd.r[1] ** 2, (p[2] - hd.c[2]) / hd.r[2] ** 2]), tan[i]); return vlen(o) > 1e-3 ? norm(o) : Fpt[i]; }) : Fpt;
      for (let i = 0; i < br.pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], ra = br.rad[i], rb = br.rad[i + 1];
        const r = Math.max(ra, rb) * (1 + 0.3 * fa) + margin + T.pearl * (1 + 2 * gg);   // room for diamond corners and nodules
        const bb = [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r,
                    Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r];
        for (let j = 0; j < 3; j++) { gb[j] = Math.min(gb[j], bb[j]); gb[j + 3] = Math.max(gb[j + 3], bb[j + 3]); }
        const dir = norm(sub(b, a));   // Fp: a per-point direction (a crown ribbon's outward normal)
        segs.push({ a, b, ra, rb, bb, N: br.N[i], B: br.B[i], u: dir, Fa: Fpt[i], Fb: Fpt[i + 1], Oa: Opt[i], Ob: Opt[i + 1], s0: br.ss[i], s1: br.ss[i + 1],
          slack: Math.max(ra, rb) * ((br.keel || 0) + 0.3 * fa) + 0.01,   // how far the section's shaping can bring a surface closer
        });
      }
      // crown pieces carry a lighter grain than the antlers (0.35 of it at natural), none when polished
      const cg = crownPiece ? 0.35 * (1 + 1.5 * gg) : 1, kn = T.knob || 0;
      groups.push({ kind: br.kind, segs, bb: gb, ov, groove: br.smooth ? 0 : T.groove * cg, grooves: T.grooves,
        pearl: br.smooth ? 0 : T.pearl * (br.kind === 'beam' ? 1 : 0.45) * cg, pearlEnd: (br.kind === 'beam' ? 0.3 : 0.18) + 0.55 * kn,   // gnarled: knobs run along the piece
        keel: (br.keel || 0) * (1 - fa), facet: fa, half: crownPiece, len: br.length, k: skel.fillet * (1 - 0.4 * fa),
        extra: extra + Math.max(br.rad[0], 1) * ov, r0: skel.r0 });
    }
    for (const fd of skel.fields || []) groups.push({ kind: 'field', f: fd.f, bb: fd.bb, k: 1 });   // a part drawn as a distance field (the skull cap)
    const m = skel.mount;
    if (m.type !== 'crown' && m.type !== 'cap') {   // a crown has no pedicle: its antlers rise straight from the ring
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
          const segs = g.segs, shaped = g.ov > 0 || g.facet > 0, fast = !(g.facet > 0), ov = g.ov, keel = g.keel;
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
                if (shaped) {   // the section's shape, from this segment's own axis point, so the nearest surface wins
                  if (d - s.slack >= tmp[j]) continue;
                  const h = y <= 0 ? 0 : y >= l2 ? 1 : y * il2, wx = px - bx * h, wy = py - by * h, wz = pz - bz * h;
                  if (fast) {   // oval only (no facets): inline, no square roots
                    const Fa = s.Fa, Fb = s.Fb, f0 = Fa[0] + (Fb[0] - Fa[0]) * h, f1 = Fa[1] + (Fb[1] - Fa[1]) * h, f2 = Fa[2] + (Fb[2] - Fa[2]) * h;
                    const wF = wx * f0 + wy * f1 + wz * f2, c2 = (wF * wF) / ((wx * wx + wy * wy + wz * wz) * (f0 * f0 + f1 * f1 + f2 * f2) + 1e-12), rl = r1 + (r2 - r1) * h;
                    d += rl * ov * c2;
                    if (keel && wF > 0) d -= rl * keel * c2 * c2 * c2 * c2;
                  } else d = shapeSection(g, s, h, wx, wy, wz, d);
                  if (d < tmp[j]) { tmp[j] = d; tsid[j] = si; tH[j] = h; }
                } else if (d < tmp[j]) { tmp[j] = d; tsid[j] = si; tH[j] = clamp(y * il2, 0, 1); }
              }
            }
          }
          const gd = g.groove, gc = g.grooves / 6, pe = g.pearl, kf = g.k, r0 = g.r0;
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
        } else if (g.f) {
          for (let iy = g.iy0; iy <= g.iy1; iy++) {
            const y = oy + iy * v;
            for (let ix = g.ix0; ix <= g.ix1; ix++) put(iy * nx + ix, g.f(ox + ix * v, y, z), g.k, 0);
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
      if (m.socket && z < m.socket.depth + v) {   // the D-shaped socket up into the base, over the skull cap's peg (eased at the mouth)
        const so = m.socket;
        for (let iy = 0; iy < ny; iy++) {
          const y = oy + iy * v, row = iy * nx;
          for (let ix = 0; ix < nx; ix++) {
            const x = ox + ix * v, hole = Math.max(Math.hypot(x, y) - so.r - Math.max(0, 0.8 - z), -so.flat - x, z - so.depth);
            const o = row + ix; if (out[o] < -hole) out[o] = -hole;
          }
        }
      }
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
    // on a crown, antler tines that dive into the head can leave slivers poking out of it: drop those too
    return taubin(dropSpecks({ positions: pos.slice(0, pc), indices: I.slice(0, w), attr: at.slice(0, pc / 3) }, skel.mount.type === 'crown' ? 0.008 : 0.002), skel.params.smoothing);
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
  function dropSpecks(mesh, frac) {   // frac: the largest share of the volume a stray shell can have and still be dropped
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
    const keep = new Set(); for (const [r, x] of vol) if (x > Math.max(2, vmax * (frac || 0.002))) keep.add(r);
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
    const watertight = open === 0 && dup === 0 && I.length > 0;   // an empty mesh is nothing, not a solid
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
  // The skull cap's part of the print notes: cap = { report, fit } for its mesh.
  function skullNotes(P, cap, len) {
    const s = cap.report.size, g = cap.report.volume / 1000 * 1.24, wire = capWire(P), strips = cap.strips || [];
    const which = (st) => (st.wire ? `the ${st.wire} wire’s strip` : 'the wire strip'), dims = (st) => st.report.size.map((x) => len(x)).join(' × ');
    return [
      '',
      'Skull cap',
      `- ${s.map((x) => len(x)).join(' × ')}, about ${Math.round(g * 0.55)}–${Math.round(g * 0.7)} g. It prints rim-down on its own plate: the outside (the bone) prints clean, the inside rests on tree supports, which come out easily through the open underside.`,
      ...(wire ? [
        `- ${strips.length > 1 ? 'Wire strips' : 'Wire strip'} (${strips.map((st) => `${which(st)}, ${dims(st)}`).join('; ')}): ${strips.length > 1 ? 'they print' : 'it prints'} standing on ${strips.length > 1 ? 'their' : 'its'} flat side, as in the STL, with no supports. Use a brim so ${strips.length > 1 ? 'they stay' : 'it stays'} put. Clear any support out of the pockets under the cap before gluing.`,
        `- The wires: put the headband on and check they sit where you set them (${len(P.wireFront + P.wireBack)} apart over the top, ${len(P.wireEarGap)} just above the ears); bend them to your head first. Turn the cap over and lay each wire in its channel across the underside (made for ${(P.wireDia / 25.4).toFixed(3)} in / ${P.wireDia.toFixed(2)} mm wire), the same length out each side. Then glue ${strips.length > 1 ? 'each strip into its pocket' : 'the strip into the pocket'} on top, pins down into their holes: they sit off-centre toward the front, so ${strips.length > 1 ? 'each' : 'it'} only goes in one way. E6000 or epoxy in the pocket and along the channel; tape it tight while it cures. The cap overlaps ${strips.length > 1 ? 'the strips' : 'the strip'} all round, so no seam shows from outside.`,
      ] : [`- Glue the headband into the groove under the cap (${len(P.hbWidth + P.clearance)} wide), centred, so the band runs under both pedicles. E6000 or epoxy; clamp or tape it while it cures.`]),
      '- Glue each antler onto its peg (CA or epoxy). Right and left are mirror images: check the flat of the D before the glue goes on.',
      ...(P.capPins ? ['- Four bobby-pin grooves at the edge (two at the front, two at the back): with the headband on, slide a bobby pin onto the edge at each groove, its top prong in the groove and its bottom prong into your hair.'] : []),
      ...(P.capTie ? ['- Strap slots: thread a loop of ½ in elastic (about 14 in, sewn or knotted into a ring) through the two slots at the back and down round the back of your head, under the bump of your skull. Or a strip of cloth, tied there. It holds the cap down so the antlers can’t rock it forward or lift it.'] : []),
    ];
  }
  function printNotes(P, report, fit, opts) {
    const f = (x) => x.toFixed(1);
    const inches = !!(opts && opts.units === 'in'), toIn = (mm) => (mm / 25.4).toFixed(2);
    const len = (mm) => (inches ? `${toIn(mm)} in` : `${f(mm)} mm`);
    const s = report.size, fil = FILAMENTS[P.filament] || FILAMENTS.bone;
    const crown = P.style === 'crown';
    const mount = crown ? { closed: 'closed crown', openBack: 'crown open at the back', openFront: 'crown open at the front' }[P.ringBase]
      : { tunnel: 'flared base with slide-on headband channel', clip: 'flared base with snap-on headband clip', flat: 'flared base for gluing', none: 'burr with a flat-cut base', skull: P.capBand === 'wires' ? 'on a skull cap clamped round a double-wire headband (five parts, glued)' : 'on a skull cap (three parts, glued)' }[P.mount];
    const grams = report.volume / 1000 * 1.24;
    const wood = P.filament === 'oak';
    return [
      'ANTLER FORGE — print notes',
      '',
      `Design     ${(PRESETS[P.preset] || {}).label || 'Custom'} · antler scale ${((fit && fit.scale) || P.scale).toFixed(2)}× · ${mount}`,
      `Filament   ${fil.name}`,
      `Printer    Bambu Lab P2S (${inches ? '10.1 × 10.1 × 10.1 in' : '256 × 256 × 256 mm'})`,
      `${P.mount === 'skull' && !crown ? 'Each antler' : 'Each part '} ${inches ? `${s.map(toIn).join(' × ')} in (${s.map((x) => x.toFixed(0)).join(' × ')} mm)` : `${f(s[0])} × ${f(s[1])} × ${f(s[2])} mm`}${fit && fit.angle ? ` (turned ${fit.angle}° on the plate to fit)` : ''}`,
      `Material   about ${Math.round(grams * 0.45)}–${Math.round(grams * 0.6)} g ${crown ? 'for the crown' : 'per antler'} at the settings below, plus supports`,
      `Mesh       ${report.triangles.toLocaleString()} triangles · one closed solid · watertight=${report.watertight}`,
      ...(opts && opts.plates && opts.plates.length > 1 ? [`Plates     ${platesText(opts.plates)}`] : []),
      '',
      crown ? 'The crown is one complete part, upright as worn, resting on a small flat foot at Z = 0. Supports carry the rest.' : 'Each antler is one complete part, already standing on its flat base at Z = 0.',
      crown ? 'Print it on its own plate.' : opts && opts.plates ? (opts.plates.length > 1 ? 'Print the parts as listed under Plates above.' : 'All the parts fit on one plate: print them together, or one at a time.')
      : 'Print the right and the left on separate plates, or together if both footprints fit.',
      crown && P.headSource === 'scan' && SCANS.has(P.headScan) ? `Fitted to your head scan (${len(SCANS.get(P.headScan).circ)} round at the tape line), plus ${len(P.ringFit)} comfort allowance.`
      : crown ? `Sized for a head ${len(P.headCirc)} around${P.headMeasured ? `, ${len(P.headArcFB)} front to back and ${len(P.headArcEE)} ear to ear over the top` : ''}, plus ${len(P.ringFit)} comfort allowance.`
      : P.mount === 'tunnel' || P.mount === 'clip'
        ? `Headband channel: ${len(P.hbWidth + P.clearance)} wide × ${len(P.hbThick + P.clearance)} tall, plus curve allowance for a ${inches ? len(P.hbRadius) : P.hbRadius + ' mm'} band radius.`
        : P.mount === 'skull' ? `Each antler's base has a D-shaped socket that fits over a peg on the skull cap (${len(2 * PEG.r)} across, ${len(PEG.h)} tall; ${len(P.pegFit / 2)} gap all round for glue). The flat of the D faces the middle of the head, so each antler only goes on facing the right way.`
        : 'The base is flat for gluing to a headband or hair clip (E6000 or CA glue).',
      ...(opts && opts.cap ? skullNotes(P, opts.cap, len) : []),
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
    FILAMENTS, buildSkeleton, buildSkullCap, skullSpec, capHead, capWire, WIRE, PEG, ARM_MAX, platesFor, platesText, meshAntler, meshBounds, plateSize, validateMesh, toSTL, makeZip, printNotes,
    _util: { add, sub, mul, dot, cross, norm, rotate },
  };
});
