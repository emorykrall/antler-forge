// Round 5: develop the Sun (petals behind the head) and look for a third family between Fringe and Seeds.
// The sun must not fight the antlers: its petals sit between and behind them, the tallest at the centre,
// graduated so the antlers stay the outermost, tallest rays.
const B = [67, 38];
const band = (k, w) => k.line([[-88, 22], [-40, 4], [0, 0], [40, 4], [88, 22]], { w: w || 1.4 });
function petals(k, n, spread, R, len, wid, o = {}) {   // a fan of rounded petals from centre (0, cy)
  const cy = o.cy == null ? 20 : o.cy;
  for (let i = -n; i <= n; i++) {
    const a = Math.PI / 2 + (i / Math.max(1, n)) * spread, g = o.grad ? 1 - o.grad * Math.abs(i) / Math.max(1, n) : 1;
    const L = len * g, W = wid * (o.gradW ? g : 1), c = [Math.cos(a) * (R + L / 2), cy + Math.sin(a) * (R + L / 2)];
    k.blob(c, W / 2, L / 2, { fill: o.fill || '#e2d8c2', rot: (a * 180) / Math.PI - 90 });
    if (o.vein) k.line([[Math.cos(a) * (R + 3), cy + Math.sin(a) * (R + 3)], [Math.cos(a) * (R + L - 4), cy + Math.sin(a) * (R + L - 4)]], { w: 0.6, passes: 1, alpha: 0.5 });
  }
}
module.exports = {
  title: 'Round 5 · the Sun, and a third family',
  cols: 4, cell: 300, weight: 1.6, frame: [-150, -70, 150, 190],
  sketches: [
    { name: 'S1 · Five petals', idea: 'five broad petals behind the head, graduated from the centre', draw(k) {
      petals(k, 2, 0.62, 58, 44, 22, { grad: 0.35, vein: true }); band(k); } },
    { name: 'S2 · Seven slim petals', idea: 'seven slimmer petals: finer, more like a flower', draw(k) {
      petals(k, 3, 0.7, 58, 46, 15, { grad: 0.4, vein: true }); band(k); } },
    { name: 'S3 · Petals + disc', idea: 'a ring (the sun’s disc) behind the head, petals springing from it', draw(k) {
      k.line(k.spline([[-58, 30], [-50, 70], [0, 96], [50, 70], [58, 30]], 14), { raw: true, w: 2 }); petals(k, 2, 0.6, 72, 34, 18, { grad: 0.3, vein: true }); band(k); } },
    { name: 'S4 · Double row', idea: 'a long row behind, a short row in front, offset: a real flower head', draw(k) {
      petals(k, 3, 0.7, 58, 48, 15, { grad: 0.35, fill: '#d4c8ae' }); petals(k, 2, 0.55, 58, 30, 15, { grad: 0.2 }); band(k); } },
    { name: 'S5 · Sun + moon', idea: 'the sun behind, the moon (with its pearl) in front: day and night', draw(k) {
      petals(k, 2, 0.62, 58, 40, 20, { grad: 0.35 });
      const o = k.spline([[-70, 44], [-52, 8], [0, -12], [52, 8], [70, 44]], 14), i = k.spline([[-66, 40], [-40, 22], [0, 8], [40, 22], [66, 40]], 14);
      k.parts.push(`<polygon points="${o.concat(i.reverse()).map((p) => (p[0] * k.S).toFixed(1) + ',' + (-p[1] * k.S).toFixed(1)).join(' ')}" fill="#e2d8c2"/>`);
      k.line(o, { raw: true, w: 2 }); k.blob([0, 16], 7, 7, { fill: '#efe7d4' }); } },
    { name: 'S6 · Pointed petals', idea: 'petals with a soft point (a lotus): more upward energy', draw(k) {
      for (let i = -2; i <= 2; i++) { const a = Math.PI / 2 + i * 0.3, g = 1 - 0.3 * Math.abs(i) / 2, r0 = 56, L = 46 * g;
        const bse = [Math.cos(a) * r0, 20 + Math.sin(a) * r0], tip = [Math.cos(a) * (r0 + L), 20 + Math.sin(a) * (r0 + L)], nrm = [-Math.sin(a), Math.cos(a)];
        const mid = (f, w) => [bse[0] + (tip[0] - bse[0]) * f + nrm[0] * w, bse[1] + (tip[1] - bse[1]) * f + nrm[1] * w];
        k.line([bse, mid(0.4, 10 * g), mid(0.8, 5 * g), tip], { w: 1.6 }); k.line([bse, mid(0.4, -10 * g), mid(0.8, -5 * g), tip], { w: 1.6 }); }
      band(k); } },
    { name: 'D1 · Fringe of drops', idea: 'a graduated fringe of pear drops hangs from the band', draw(k) {
      band(k, 1.8); for (let i = -4; i <= 4; i++) { const x = i * 11, L = 12 - Math.abs(i) * 2.2, y0 = Math.abs(x) ** 2 * 0.0026; k.line([[x, y0], [x, y0 - L]], { w: 1.2 }); k.blob([x, y0 - L - 4], 3.4, 5, { fill: '#e2d8c2' }); } } },
    { name: 'D2 · Drops on a moon', idea: 'the moon, with three drops hanging from its lower edge', draw(k) {
      const o = k.spline([[-70, 44], [-52, 8], [0, -12], [52, 8], [70, 44]], 14), i = k.spline([[-66, 40], [-40, 22], [0, 8], [40, 22], [66, 40]], 14);
      k.parts.push(`<polygon points="${o.concat(i.reverse()).map((p) => (p[0] * k.S).toFixed(1) + ',' + (-p[1] * k.S).toFixed(1)).join(' ')}" fill="#e2d8c2"/>`);
      k.line(o, { raw: true, w: 2 }); for (const [x, L] of [[0, 10], [-20, 6], [20, 6]]) { const y = -12 + Math.abs(x) * 0.25; k.line([[x, y], [x, y - L]], { w: 1 }); k.blob([x, y - L - 4], 3.4, 5, { fill: '#e2d8c2' }); } } },
    { name: 'W1 · Seed circlet', idea: 'close-set seeds, tips pointing back, larger toward the antlers', draw(k) {
      for (let i = -6; i <= 6; i++) { const x = i * 11, y = Math.abs(x) ** 2 * 0.0035, s = 1 + Math.abs(i) * 0.07; k.blob([x, y], 5.5 * s, 3 * s, { fill: '#e2d8c2', rot: -Math.sign(i) * (12 + Math.abs(i) * 3) }); } } },
    { name: 'W2 · Seeds rising', idea: 'seeds stand up, fanning, a tall one at the centre: a seed head', draw(k) {
      band(k); for (let i = -4; i <= 4; i++) { const x = i * 12, h = 22 - Math.abs(i) * 3.5, y = Math.abs(x) ** 2 * 0.0026 + h / 2 + 2; k.blob([x, y], 4, h / 2, { fill: '#e2d8c2', rot: -i * 7 }); } } },
    { name: 'W3 · Acorn and oak', idea: 'an acorn cup at the brow, a band of oak-leaf lobes', draw(k) {
      band(k); k.blob([0, 12], 7, 9, { fill: '#e2d8c2' }); k.line([[-8, 8], [0, 4], [8, 8]], { w: 1.6 }); for (const s of [1, -1]) for (const x of [22, 40]) k.blob([s * x, 8 + x * 0.15], 7, 4.5, { fill: '#e2d8c2', rot: s * 20 }); } },
    { name: 'W4 · Pod pair', idea: 'two long pods lie along the band, splitting at the brow to show a seed', draw(k) {
      k.bodyBoth([[4, 4], [24, 6], [48, 18], [66, 34]], (u) => 4 + 7 * Math.sin(Math.PI * u), {}); k.blob([0, 6], 5, 5, { fill: '#efe7d4' }); } },
  ],
};
