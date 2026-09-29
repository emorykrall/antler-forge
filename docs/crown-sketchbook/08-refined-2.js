// Round 8: the refined sketches, corrected after critique.
//  Moon: at 16 mm deep a horns-up crescent over a face reads as a smile; now 13 mm, horns steeper, pearl larger.
//  Lotus: drawn honestly: the petals stand behind the head, which hides their lower half from the front.
//  Roots: the temple roots hung down like fangs; now they sweep back toward the ears; the rootlet is gone.
const fill = (k, pts, f, stroke) => k.parts.push(`<polygon points="${pts.map((p) => (p[0] * k.S).toFixed(1) + ',' + (-p[1] * k.S).toFixed(1)).join(' ')}" fill="${f || '#e4dac4'}" stroke="${stroke || 'none'}" stroke-width="0.9"/>`);
const ink = { w: 1.5, passes: 2, loose: 0.35 };
const sym = (k, half) => [...half, ...k.mirror(half).reverse().slice(1)];

const MOON = { out: [[70, 54], [66, 38], [54, 20], [30, 0], [0, -9]], in: [[67, 48], [58, 34], [40, 18], [18, 8], [0, 4]], ridge: [[69, 51], [62, 36], [47, 19], [24, 4], [0, -2]], pearl: [0, 14.5, 9.5] };
function moonFront(k) {
  const o = k.spline(sym(k, MOON.out), 16), i = k.spline(sym(k, MOON.in), 16), r = k.spline(sym(k, MOON.ridge), 16);
  fill(k, o.concat(i.slice().reverse())); k.hatch(o.concat(r.slice().reverse()), { gap: 2, alpha: 0.28 });
  k.line(o, Object.assign({ raw: true }, ink, { w: 2 })); k.line(i, Object.assign({ raw: true }, ink)); k.line(r, { raw: true, w: 0.8, passes: 1, alpha: 0.6 });
  const [px, py, pr] = MOON.pearl; k.blob([px, py], pr, pr, { fill: '#f3ecdc', w: 1.4 });
  k.line(k.spline([[-10, 9], [-6, 5.5], [0, 4.2], [6, 5.5], [10, 9]], 10), { raw: true, w: 1, passes: 1 });
  k.parts.push(`<circle cx="${(-3.2 * k.S).toFixed(1)}" cy="${(-18 * k.S).toFixed(1)}" r="${(2.2 * k.S).toFixed(1)}" fill="#fffaf0"/>`);
}
const PET = [[0, 1], [0.34, 0.82], [0.68, 0.67]];
function petal(base, ang, L, W) {
  const d = [Math.sin(ang), Math.cos(ang)], n = [d[1], -d[0]], at = (f, w) => [base[0] + d[0] * L * f + n[0] * w, base[1] + d[1] * L * f + n[1] * w];
  return { l: [at(0, 0), at(0.3, W * 0.46), at(0.62, W * 0.42), at(0.88, W * 0.16), at(1, 0)], r: [at(0, 0), at(0.3, -W * 0.46), at(0.62, -W * 0.42), at(0.88, -W * 0.16), at(1, 0)], v: [at(0.04, 0), at(0.55, 0)] };
}
function lotusPetals(k, o = {}) {
  for (const [a, s] of PET.slice().reverse()) for (const sd of a ? [1, -1] : [1]) {
    const P = petal([sd * a * 55, -14], sd * a, 150 * s, 46 * s);
    fill(k, k.spline(P.l, 16).concat(k.spline(P.r, 16).reverse()), '#f1eadb');
    k.line(P.l, Object.assign({}, ink, { w: 1.7 })); k.line(P.r, Object.assign({}, ink, { w: 1.7 })); k.line(P.v, { w: 1, passes: 2, alpha: 0.7 });
  }
}
const ROOT = { a: [[65, 36], [54, 24], [38, 12], [20, 3], [7, -3], [0, -4]], b: [[67, 32], [71, 20], [78, 10], [85, 4]], c: [[70, 36], [80, 30], [88, 22]] };
function rootsFront(k) {
  k.bodyBoth(ROOT.a, (u) => 11 - 4.2 * u, { fill: '#e4dac4' });
  k.bodyBoth(ROOT.b, (u) => 9.5 - 5 * u ** 1.3, { fill: '#e4dac4' });
  k.bodyBoth(ROOT.c, (u) => 9 - 3 * u, { fill: '#e4dac4' });
  k.blob([0, -4], 5, 4.5, { fill: '#e4dac4', w: 1.2 });
  fill(k, k.spline([[0, -7.5], [5, -13], [4.5, -20], [0, -24], [-4.5, -20], [-5, -13], [0, -7.5]], 10), '#efe6d2', '#2b2620');
}
module.exports = {
  title: 'Round 8 · refined sketches, corrected',
  cols: 2, cell: 520, weight: 1.3,
  sketches: [
    { name: 'Moon · front', idea: '13 mm deep; horns rise steeply and tuck behind the antler bases; a 19 mm pearl in a bezel', frame: [-110, -40, 110, 110], draw: moonFront },
    { name: 'Moon · side', idea: 'the crescent lies a few mm off the brow; the pearl stands 8 mm proud; a slim band carries on round the back', view: 'side', frame: [-240, -60, 30, 120], draw(k) {
      k.body([[4, -8], [-6, 2], [-28, 16], [-52, 32], [-72, 44], [-76, 52]], (u) => 13 - 8 * u, { fill: '#e4dac4' });
      k.blob([8, 14.5], 6.5, 9.5, { fill: '#f3ecdc', w: 1.3 });
      k.body([[-74, 44], [-110, 38], [-160, 24], [-210, 6]], () => 6, { fill: '#e4dac4' }); } },
    { name: 'Lotus · front', idea: 'five openwork petals stand behind the head; the head hides their lower halves, so the tips rise as a halo between the antlers', frame: [-150, -50, 150, 160], draw(k) {
      lotusPetals(k); k.under(); k.body(sym(k, [[88, 22], [60, 10], [30, 3], [0, 1]]), () => 6, { fill: '#e4dac4' }); } },
    { name: 'Lotus · side', idea: 'petals rise from the back of the band, near upright (a halo, not a crest), the tallest at the centre back', view: 'side', frame: [-270, -60, 40, 170], draw(k) {
      for (const [x, L, a] of [[-160, 118, -0.2], [-185, 138, -0.1], [-205, 150, -0.04]]) { const P = petal([x, -14], a, L, 14); k.line(P.l, Object.assign({}, ink)); k.line(P.r, Object.assign({}, ink)); }
      k.body([[0, 0], [-60, 4], [-120, -2], [-170, -12], [-210, -18]], () => 6, { fill: '#e4dac4' }); } },
    { name: 'Roots · front', idea: 'the front roots meet at the brow in a knot that holds a seed; the others sweep back toward the ears', frame: [-110, -40, 110, 110], draw: rootsFront },
    { name: 'Roots · side', idea: 'one root flows down and forward to the brow, one back over the ear, one back along the head into the band', view: 'side', frame: [-240, -60, 30, 120], draw(k) {
      k.body([[-74, 38], [-52, 28], [-26, 12], [-6, 2], [2, -4]], (u) => 11 - 4 * u, { fill: '#e4dac4' });
      k.body([[-76, 34], [-90, 20], [-108, 10], [-124, 6]], (u) => 9.5 - 5 * u, { fill: '#e4dac4' });
      k.body([[-78, 38], [-112, 32], [-160, 20], [-210, 4]], (u) => 9 - 3 * u, { fill: '#e4dac4' });
      k.blob([4, -13], 4.5, 7, { fill: '#efe6d2' }); } },
  ],
};
