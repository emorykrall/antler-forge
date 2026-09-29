// Round 4: back to thumbnails for more families. What round 1–3 taught: over a face, lines across the
// forehead read as features (a dip is a moustache, slanted lines are eyebrows, loops are a bow tie). What
// works: shapes with their own body (a moon), and accents that rise. So: look above and behind the head
// (halos), along the parting, and at forms that stand up.
const B = [67, 38];
const band = (k, w) => k.line([[-88, 22], [-40, 4], [0, 0], [40, 4], [88, 22]], { w: w || 1.4 });
module.exports = {
  title: 'Round 4 · going back: more families',
  cols: 4, cell: 300, weight: 1.6, frame: [-150, -70, 150, 170],
  sketches: [
    { name: 'H1 · Halo', idea: 'a ring standing behind the head between the antlers, like a saint’s nimbus', draw(k) {
      band(k); k.line(k.spline([[-60, 40], [-70, 90], [-40, 130], [0, 142], [40, 130], [70, 90], [60, 40]], 14), { raw: true, w: 2.2 }); } },
    { name: 'H2 · Petal halo', idea: 'rounded petals (not rays) fan behind the head: a sunflower', draw(k) {
      band(k); for (let i = -3; i <= 3; i++) { const a = Math.PI / 2 + i * 0.3, c = [Math.cos(a) * 88, 30 + Math.sin(a) * 88]; k.blob(c, 9, 20, { fill: '#e2d8c2', rot: (a * 180) / Math.PI - 90 }); } } },
    { name: 'H3 · Moon halo', idea: 'the crescent stands up behind the head, horns up, the antlers in its arms', draw(k) {
      band(k); k.line(k.spline([[-96, 110], [-94, 60], [-60, 26], [0, 12], [60, 26], [94, 60], [96, 110]], 14), { raw: true, w: 2.4 }); k.line(k.spline([[-86, 104], [-78, 64], [-50, 38], [0, 28], [50, 38], [78, 64], [86, 104]], 14), { raw: true, w: 1.3 }); } },
    { name: 'P1 · Parting', idea: 'a line runs back along the parting; a pendant hangs at the hairline', draw(k) {
      band(k); k.line([[0, 0], [0, 70]], { w: 2 }); k.line([[0, 0], [0, -8]], { w: 1 }); k.blob([0, -16], 6, 8.5, { fill: '#e2d8c2' }); } },
    { name: 'P2 · Parting + side chains', idea: 'the parting line, and a swag from it to each antler', draw(k) {
      k.line([[0, 0], [0, 70]], { w: 2 }); k.both([[0, 30], [26, 10], [50, 18], B], { w: 1.5 }); k.blob([0, -6], 6, 8.5, { fill: '#e2d8c2' }); } },
    { name: 'U1 · Rising serpent', idea: 'one S rears up at the centre of a plain band (an uraeus)', draw(k) {
      band(k); k.line([[0, 0], [8, 14], [-6, 30], [2, 46], [10, 50]], { w: 2.4 }); } },
    { name: 'U2 · Twin serpents', idea: 'two S-lines rise from the antlers, meeting face to face above the brow', draw(k) {
      k.both([B, [44, 20], [24, 16], [14, 30], [6, 44]], { w: 2.2 }); band(k, 1.2); } },
    { name: 'F1 · Fringe', idea: 'drops hang from the band in a graduated fringe, longest at the centre', draw(k) {
      band(k, 1.8); for (let i = -4; i <= 4; i++) { const x = i * 12, L = 16 - Math.abs(i) * 3, y0 = Math.abs(x) * 0.08 + Math.abs(x) ** 2 * 0.0025; k.line([[x, y0], [x, y0 - L]], { w: 0.9 }); k.blob([x, y0 - L - 3], 2.4, 3.4, { fill: '#e2d8c2' }); } } },
    { name: 'F2 · Temple drops', idea: 'drops hang at the temples below the antlers; the front stays clear', draw(k) {
      band(k); k.both([[74, 26], [76, 8]], { w: 1 }); k.blob([76, 2], 4, 6, { fill: '#e2d8c2' }); k.blob([-76, 2], 4, 6, { fill: '#e2d8c2' }); } },
    { name: 'W1 · Wreath of seeds', idea: 'a band of close-set seeds/pods, larger toward the antlers', draw(k) {
      for (let i = -6; i <= 6; i++) { const x = i * 12, y = Math.abs(x) * 0.12 + Math.abs(x) ** 2 * 0.003, s = 1 + Math.abs(i) * 0.08; k.blob([x, y], 5 * s, 3.4 * s, { fill: '#e2d8c2', rot: i * 6 }); } } },
    { name: 'G1 · Gate', idea: 'two uprights beside the brow joined by a lintel arch: a portal on the forehead', draw(k) {
      band(k); k.both([[18, 2], [20, 40]], { w: 2 }); k.line([[-20, 40], [-10, 50], [0, 54], [10, 50], [20, 40]], { w: 2 }); } },
    { name: 'T1 · Temple rosettes', idea: 'the antlers rise from round rosettes; a plain band links them', draw(k) {
      band(k); k.blob(B, 14, 14, { fill: '#e2d8c2' }); k.blob([-67, 38], 14, 14, { fill: '#e2d8c2' }); } },
  ],
};
