// Round 7: refined sketches of the three chosen designs. Front and side elevations at wearing size, with real
// member widths (mm), shading for form, and a details panel: sections, joins and terminals. These are the
// drawings the 3D models are built from and compared against. Sturdiness is designed in: members at least
// 6 mm thick except where a free end fines to its tip.
const B = [67, 38];
const fill = (k, pts, f, stroke) => k.parts.push(`<polygon points="${pts.map((p) => (p[0] * k.S).toFixed(1) + ',' + (-p[1] * k.S).toFixed(1)).join(' ')}" fill="${f || '#e4dac4'}" stroke="${stroke || 'none'}" stroke-width="0.9"/>`);
const ink = { w: 1.5, passes: 2, loose: 0.35 };

// ---- MOON: a crescent with body; horns hold the antler bases; a pearl sits in its bowl
const MOON_OUT = [[72, 50], [66, 34], [52, 16], [28, -4], [0, -12]], MOON_IN = [[68, 44], [56, 30], [38, 16], [18, 7], [0, 4]];
const MOON_RIDGE = [[70, 47], [61, 32], [45, 16], [23, 2], [0, -4]];
function moonFront(k) {
  const o = k.spline([...MOON_OUT, ...k.mirror(MOON_OUT).reverse().slice(1)], 16), i = k.spline([...MOON_IN, ...k.mirror(MOON_IN).reverse().slice(1)], 16);
  fill(k, o.concat(i.slice().reverse()));
  k.hatch(o.concat(k.spline([...MOON_RIDGE, ...k.mirror(MOON_RIDGE).reverse().slice(1)], 16).reverse()), { gap: 2, alpha: 0.28 });   // the lower facet in shade
  k.line(o, Object.assign({ raw: true }, ink, { w: 2 })); k.line(i, Object.assign({ raw: true }, ink));
  k.line([...MOON_RIDGE, ...k.mirror(MOON_RIDGE).reverse().slice(1)], { w: 0.8, passes: 1, alpha: 0.6 });   // the ridge: two planes meet
  k.blob([0, 15.5], 8.5, 8.5, { fill: '#f3ecdc', w: 1.4 });   // the pearl
  k.line(k.spline([[-9, 10], [-6, 6], [0, 4.5], [6, 6], [9, 10]], 10), { raw: true, w: 1, passes: 1 });   // its bezel
  k.parts.push(`<circle cx="${(-2.8 * k.S).toFixed(1)}" cy="${(-18.5 * k.S).toFixed(1)}" r="${(2 * k.S).toFixed(1)}" fill="#fffaf0"/>`);   // a highlight
}
// ---- LOTUS: pointed openwork petals stand behind the head, a halo framed by the antlers
const PETALS = [[0, 1], [0.3, 0.82], [0.6, 0.67]];   // (angle from vertical, size)
function petalShape(base, ang, L, W) {   // an openwork petal: two edges swelling out and meeting in a soft point, plus a vein
  const d = [Math.sin(ang), Math.cos(ang)], nrm = [d[1], -d[0]], at = (f, w) => [base[0] + d[0] * L * f + nrm[0] * w, base[1] + d[1] * L * f + nrm[1] * w];
  return { left: [at(0, 0), at(0.3, W * 0.46), at(0.62, W * 0.42), at(0.88, W * 0.16), at(1, 0)], right: [at(0, 0), at(0.3, -W * 0.46), at(0.62, -W * 0.42), at(0.88, -W * 0.16), at(1, 0)], vein: [at(0.05, 0), at(0.55, 0)] };
}
function lotusFront(k) {
  const baseY = -10;
  for (const [a, s] of PETALS.slice().reverse()) for (const sd of a ? [1, -1] : [1]) {
    const P = petalShape([sd * a * 60, baseY], sd * a, 145 * s, 44 * s);
    const outline = k.spline(P.left, 16).concat(k.spline(P.right, 16).reverse());
    fill(k, outline, '#f1eadb'); k.line(P.left, Object.assign({}, ink, { w: 1.7 })); k.line(P.right, Object.assign({}, ink, { w: 1.7 })); k.line(P.vein, { w: 1, passes: 2, alpha: 0.7 });
  }
}
// ---- ROOTS: the antlers grown from the head; roots grip the temples and meet at the brow around a seed
const ROOT_A = [[65, 36], [54, 24], [38, 12], [20, 3], [7, -3], [0, -4]], ROOT_B = [[66, 32], [63, 18], [58, 2], [55, -10], [52, -20]];
const ROOTLET = [[60, 10], [66, 2], [68, -6]], ROOT_C = [[70, 34], [80, 26], [88, 16]];
function rootsFront(k) {
  k.bodyBoth(ROOT_A, (u) => 11 - 4.2 * u, { fill: '#e4dac4' });
  k.bodyBoth(ROOT_B, (u) => 9.5 - 5.5 * u ** 1.3, { fill: '#e4dac4' });
  k.bodyBoth(ROOTLET, (u) => 6 - 3.5 * u, { fill: '#e4dac4' });
  k.bodyBoth(ROOT_C, (u) => 9 - 3 * u, { fill: '#e4dac4' });
  k.blob([0, -4], 6.5, 5.5, { fill: '#e4dac4', w: 1.2 });   // the knot where the roots meet
  const seed = k.spline([[0, -8], [4.6, -13], [4, -19], [0, -22.5], [-4, -19], [-4.6, -13], [0, -8]], 10);
  fill(k, seed, '#efe6d2', '#2b2620');   // the seed, hanging
}
module.exports = {
  title: 'Round 7 · refined sketches: Moon, Lotus, Roots',
  cols: 3, cell: 400, weight: 1.3,
  sketches: [
    { name: 'Moon · front', idea: 'the crescent is 16 mm deep at the centre, horns fining into the antler bases; the pearl (17 mm) sits in a bezel in its bowl', frame: [-110, -40, 110, 110], draw: moonFront },
    { name: 'Moon · side', idea: 'the crescent follows the brow a few mm off the skin; the pearl stands proud; a slim band carries on round the back', view: 'side', frame: [-230, -60, 30, 110], draw(k) {
      k.body([[4, -10], [-8, 0], [-30, 14], [-56, 30], [-74, 40]], (u) => 16 - 11 * u, { fill: '#e4dac4' });
      k.blob([7, 15], 6, 8.5, { fill: '#f3ecdc', w: 1.3 });
      k.body([[-74, 40], [-110, 36], [-160, 22], [-205, 6]], () => 6, { fill: '#e4dac4' }); } },
    { name: 'Moon · details', idea: 'section: a lens with a ridge on the face and a round back against the head; horn tip tucks behind the burr', underlay: false, frame: [-60, -40, 60, 50], draw(k) {
      k.note([-30, 42], 'section at the centre'); fill(k, k.spline([[-40, 30], [-44, 18], [-40, 6], [-30, 4], [-24, 18], [-30, 32], [-40, 30]], 10), '#e4dac4', '#2b2620'); k.note([-52, 18], 'head', { size: 8 }); k.note([-12, 18], 'face ↑', { size: 8 });
      k.note([28, 42], 'pearl in its bezel'); k.blob([28, 18], 12, 12, { fill: '#f3ecdc' }); k.line(k.spline([[14, 12], [20, 6], [28, 4], [36, 6], [42, 12]], 10), { raw: true, w: 1.4 });
      k.note([0, -8], 'horn tip → behind the burr'); k.blob([0, -26], 11, 5, { fill: '#e8e1d2', col: '#b8ae9c' }); k.body([[-26, -30], [-14, -26], [-4, -22], [6, -20]], (u) => 6 - 4.5 * u, { fill: '#e4dac4' }); } },
    { name: 'Lotus · front', idea: 'five openwork petals stand behind the head, graduated ×0.82, a halo framed by the antlers; the brow band stays quiet', frame: [-150, -50, 150, 160], draw(k) {
      lotusFront(k); k.body([[-88, 22], [-60, 10], [-30, 3], [0, 1], [30, 3], [60, 10], [88, 22]], () => 6, { fill: '#e4dac4' }); } },
    { name: 'Lotus · side', idea: 'the petals rise from the back of the band, leaning back 12° off the head, fanning like a crest behind the antlers', view: 'side', frame: [-260, -60, 40, 170], draw(k) {
      k.body([[0, 0], [-60, 4], [-120, -2], [-170, -12], [-205, -18]], () => 6, { fill: '#e4dac4' });
      for (const [x, L, a] of [[-150, 110, -0.55], [-175, 135, -0.3], [-200, 150, -0.12]]) { const P = petalShape([x, -12], a, L, 16); k.line(P.left, Object.assign({}, ink)); k.line(P.right, Object.assign({}, ink)); } } },
    { name: 'Lotus · details', idea: 'a petal: two 6 mm edges meeting in a soft point, a vein to stiffen it; the base splays into the band like a stem', underlay: false, frame: [-60, -40, 60, 90], draw(k) {
      const P = petalShape([0, -20], 0, 100, 44); fill(k, k.spline(P.left, 16).concat(k.spline(P.right, 16).reverse()), '#f1eadb');
      k.body(P.left, () => 6, {}); k.body(P.right, () => 6, {}); k.body(P.vein, (u) => 6 - 2 * u, {});
      k.body([[-40, -24], [-20, -21], [0, -20], [20, -21], [40, -24]], () => 7, {}); k.note([0, -34], 'band'); k.note([30, 84], 'soft point'); } },
    { name: 'Roots · front', idea: 'three roots per antler: the front pair meet at the brow in a knot holding a seed; one grips the temple; one runs back', frame: [-110, -40, 110, 110], draw: rootsFront },
    { name: 'Roots · side', idea: 'from the antler base roots flow down and forward to the brow, down the temple, and back along the head into the band', view: 'side', frame: [-230, -60, 30, 110], draw(k) {
      k.body([[-74, 38], [-52, 28], [-26, 12], [-6, 2], [2, -4]], (u) => 11 - 4 * u, { fill: '#e4dac4' });
      k.body([[-74, 36], [-78, 20], [-80, 2], [-78, -14]], (u) => 9.5 - 5 * u, { fill: '#e4dac4' });
      k.body([[-76, 36], [-110, 30], [-160, 18], [-205, 4]], (u) => 9 - 3 * u, { fill: '#e4dac4' });
      k.blob([4, -12], 4, 6, { fill: '#efe6d2' }); } },
    { name: 'Roots · details', idea: 'roots swell where they leave the antler (a flare, not a joint), taper to fine tips; the seed hangs from a knot', underlay: false, frame: [-60, -40, 60, 50], draw(k) {
      k.body([[-50, 30], [-30, 22], [-10, 12], [10, 4], [30, -2]], (u) => 16 - 10 * u, {}); k.note([-38, 42], 'flare from the burr');
      k.blob([30, 0], 7, 6, {}); fill(k, k.spline([[30, -5], [35, -11], [34, -18], [30, -22], [26, -18], [25, -11], [30, -5]], 10), '#efe6d2', '#2b2620'); k.note([30, -32], 'knot + seed');
      k.body([[-40, -10], [-30, -20], [-18, -26], [-4, -28]], (u) => 6 - 4.5 * u, {}); k.note([-24, -36], 'fine tip'); } },
  ],
};
