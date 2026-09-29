// Round 2: five directions from round 1, four variations each. Lesson from round 1: a symmetric line that dips
// at the centre and rises at the sides reads as a moustache over a face, so every centre here gets an upward
// accent, or the dip is carried by a shape with its own body (a moon, not a line).
const B = [67, 38];
const crescent = (k, r0, r1, dy, o) => {   // a crescent: outer arc (lower) and inner arc (upper) meeting at the horns
  const outer = [[-70, 44], [-52, 8], [0, -14 + dy], [52, 8], [70, 44]], inner = [[-66, 40], [-40, r1], [0, r0 + dy], [40, r1], [66, 40]];
  const po = k.spline(outer, 14), pi = k.spline(inner, 14);
  k.parts.push(`<polygon points="${po.concat(pi.reverse()).map((p) => (p[0] * k.S).toFixed(1) + ',' + (-p[1] * k.S).toFixed(1)).join(' ')}" fill="${(o && o.fill) || '#e2d8c2'}" stroke="none"/>`);
  k.line(outer, { w: 2.2 }); k.line(inner, { w: 1.3 });
};
module.exports = {
  title: 'Round 2 · five directions, four variations each',
  cols: 4, cell: 300, weight: 1.6, frame: [-150, -70, 150, 170],
  sketches: [
    // I. Crescent moon
    { name: 'I.1 Crescent, full body', idea: 'the moon has weight: thick at the centre, fining to horns at the antlers', draw(k) { crescent(k, 8, 22, 0); } },
    { name: 'I.2 Crescent + rising star', idea: 'a small four-point star stands in the crescent’s bowl: the upward accent', draw(k) {
      crescent(k, 8, 22, 0); k.line([[0, 10], [0, 40]], { w: 1.8 }); k.line([[-9, 26], [9, 26]], { w: 1.3 }); } },
    { name: 'I.3 Crescent + drop', idea: 'a drop hangs from the lowest point, onto the forehead', draw(k) {
      crescent(k, 8, 22, 0); k.line([[0, -14], [0, -20]], { w: 1 }); k.blob([0, -27], 5, 7.5, { fill: '#e2d8c2' }); } },
    { name: 'I.4 Nested crescents', idea: 'two moons, the upper one thinner and higher: depth and rhythm', draw(k) {
      crescent(k, 8, 22, 0); k.line([[-58, 58], [-30, 34], [0, 26], [30, 34], [58, 58]], { w: 1.4 }); } },
    // II. Lyre with an upward heart
    { name: 'II.1 Lyre + almond', idea: 'the S-lines rise from a V; an almond stands in the V', draw(k) {
      k.both([[0, -8], [20, 4], [42, 24], [58, 34], B], { w: 2.3 }); k.both([[0, -2], [10, 18], [0, 44]], { w: 1.5 }); } },
    { name: 'II.2 Lyre, open', idea: 'no centre piece: the two lines turn up at the V like a flame', draw(k) {
      k.both([[0, -8], [20, 4], [42, 24], [58, 34], B], { w: 2.3 }); k.both([[0, -8], [-4, 6], [2, 26]], { w: 1.5 }); } },
    { name: 'II.3 Lyre, doubled', idea: 'a second, finer S above the first, both springing from the antler', draw(k) {
      k.both([[0, -8], [20, 4], [42, 24], [58, 34], B], { w: 2.3 }); k.both([[8, 12], [24, 22], [42, 40], B], { w: 1.3 }); k.both([[0, -2], [8, 16], [0, 38]], { w: 1.4 }); } },
    { name: 'II.4 Lyre on a quiet band', idea: 'a plain band all round; the lyre sits on it as a front ornament', draw(k) {
      k.line([[-88, 22], [-40, 4], [0, 0], [40, 4], [88, 22]], { w: 1.3 });
      k.both([[0, 0], [16, 12], [30, 32], [44, 44]], { w: 2.1 }); k.both([[0, 4], [8, 22], [0, 48]], { w: 1.4 }); } },
    // III. Swept
    { name: 'III.1 Swept back from the brow', idea: 'lines leave the brow, pass under the antlers and stream back over the ears', draw(k) {
      k.both([[0, -4], [30, 4], [62, 22], [88, 28], [108, 18]], { w: 2.3 }); k.both([[8, 4], [40, 20], [70, 44], [96, 46], [112, 34]], { w: 1.3 }); } },
    { name: 'III.2 Swept from the antlers', idea: 'the antlers shed streamers back along the head; a slim band in front', draw(k) {
      k.line([[-67, 38], [-30, 6], [0, 0], [30, 6], [67, 38]], { w: 1.5 }); k.both([B, [88, 44], [104, 34], [114, 16]], { w: 2.2 }); k.both([B, [86, 54], [106, 50], [118, 36]], { w: 1.3 }); } },
    { name: 'III.3 Wings, contained', idea: 'wings rise from the brow but stop at the antlers: they carry them', draw(k) {
      k.both([[0, -6], [26, 4], [50, 20], [66, 44], [76, 70]], { w: 2.3 }); k.both([[0, -6], [30, -2], [58, 10], [80, 26]], { w: 1.3 }); k.line([[0, -6], [0, 16]], { w: 1.4 }); } },
    { name: 'III.4 Feathered sweep', idea: 'a sweep with feather barbs along its upper edge, shortening outward', draw(k) {
      k.both([[0, -4], [30, 4], [62, 22], [88, 28], [108, 18]], { w: 2.2 }); for (const [x, y, h] of [[18, 2, 18], [34, 7, 15], [50, 15, 12], [66, 23, 9]]) k.both([[x, y], [x + 6, y + h]], { w: 1.2 }); } },
    // IV. Diadem: one strong centre on a calm band
    { name: 'IV.1 Almond plate', idea: 'an openwork almond standing at the centre, a calm band', draw(k) {
      k.line([[-88, 22], [-40, 4], [0, 0], [40, 4], [88, 22]], { w: 1.5 }); k.both([[0, 0], [16, 22], [0, 60]], { w: 2.2 }); k.both([[0, 12], [7, 26], [0, 44]], { w: 1.1 }); } },
    { name: 'IV.2 Shield', idea: 'a heater-shield plate: weight low, point down to the brow', draw(k) {
      k.line([[-88, 22], [-40, 8], [-20, 10]], { w: 1.5 }); k.line([[88, 22], [40, 8], [20, 10]], { w: 1.5 }); k.both([[0, -10], [16, 8], [22, 30], [0, 34]], { w: 2.2 }); } },
    { name: 'IV.3 Rising flame', idea: 'a single flame, flicked to one side: asymmetry as life', draw(k) {
      k.line([[-88, 22], [-40, 4], [0, 0], [40, 4], [88, 22]], { w: 1.5 }); k.line([[-10, 2], [-14, 26], [0, 48], [10, 66], [2, 84]], { w: 2.2 }); k.line([[10, 2], [14, 24], [4, 44]], { w: 1.3 }); } },
    { name: 'IV.4 Drop crown', idea: 'a tall drop, point up, with a smaller drop hung inside', draw(k) {
      k.line([[-88, 22], [-40, 4], [0, 0], [40, 4], [88, 22]], { w: 1.5 }); k.both([[0, 0], [16, 12], [14, 34], [0, 64]], { w: 2.2 }); k.blob([0, 22], 5, 9, { fill: '#e2d8c2' }); } },
    // V. Knot
    { name: 'V.1 Brow knot', idea: 'the two sides cross at the brow, pass over-under, and turn up as scrolls', draw(k) {
      k.both([B, [42, 20], [14, 4], [-10, 8], [-18, 22], [-10, 32], [-4, 26]], { w: 2 }); } },
    { name: 'V.2 Figure-eight', idea: 'a figure-eight on its side at the brow, loops tying into the antlers', draw(k) {
      k.both([B, [40, 34], [16, 26], [0, 12], [-16, -2], [-34, 6], [-40, 20]], { w: 2 }); } },
    { name: 'V.3 Lover’s knot', idea: 'two loops standing up from a crossing at the brow', draw(k) {
      k.both([B, [44, 20], [20, 6], [0, 4], [-14, 14], [-16, 34], [-4, 40], [4, 30], [0, 4]], { w: 1.9 }); } },
    { name: 'V.4 Tied band', idea: 'a plain band with a single tied knot at the brow, ends flying up', draw(k) {
      k.line([[-88, 22], [-40, 6], [-10, 2]], { w: 1.6 }); k.line([[88, 22], [40, 6], [10, 2]], { w: 1.6 }); k.blob([0, 3], 9, 7, { fill: '#e2d8c2' }); k.both([[6, 8], [16, 24], [12, 40]], { w: 1.5 }); } },
  ],
};
