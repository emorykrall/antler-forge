// Round 3: develop the two new families (Crescent, Infinity) and try the swept idea where it belongs: as the
// moon's horns streaming back past the antlers, not as lines across the forehead (which read as eyebrows).
const B = [67, 38];
const fillPoly = (k, pts, fill) => k.parts.push(`<polygon points="${pts.map((p) => (p[0] * k.S).toFixed(1) + ',' + (-p[1] * k.S).toFixed(1)).join(' ')}" fill="${fill || '#e2d8c2'}" stroke="none"/>`);
function moon(k, o = {}) {   // outer (lower) and inner (upper) edges meeting at the horns h
  const h = o.h || [[70, 44]], H = h[h.length - 1], lo = o.lo == null ? -14 : o.lo, hi = o.hi == null ? 8 : o.hi;
  const outer = [[-H[0], H[1]], ...h.slice(0, -1).map(([x, y]) => [-x, y]).reverse(), [-52, 8], [0, lo], [52, 8], ...h];
  const inner = [[-H[0] + 4, H[1] - 4], [-40, hi + 14], [0, hi], [40, hi + 14], [H[0] - 4, H[1] - 4]];
  const po = k.spline(outer, 14), pi = k.spline(inner, 14);
  if (o.solid !== false) fillPoly(k, po.concat(pi.slice().reverse()));
  k.line(outer, { w: o.wo || 2.2 }); k.line(inner, { w: o.wi || 1.3 });
  return { po, pi };
}
module.exports = {
  title: 'Round 3 · Crescent and Infinity, developed',
  cols: 4, cell: 300, weight: 1.6, frame: [-150, -70, 150, 170],
  sketches: [
    { name: 'C1 · Openwork moon + drop', idea: 'two edges only, meeting at the horns; the drop hangs in the opening', draw(k) {
      moon(k, { solid: false, wi: 1.8 }); k.line([[0, 8], [0, 0]], { w: 1 }); k.blob([0, -4], 3.6, 5.5, { fill: '#e2d8c2' }); } },
    { name: 'C2 · Moon, engraved', idea: 'a solid moon with a finer crescent cut along it', draw(k) {
      moon(k); k.line([[-58, 34], [-36, 10], [0, -4], [36, 10], [58, 34]], { w: 0.9 }); } },
    { name: 'C3 · Streaming horns', idea: 'the horns carry on past the antlers and stream back over the ears', draw(k) {
      moon(k, { h: [[70, 44], [92, 50], [110, 40], [118, 24]] }); } },
    { name: 'C4 · Moon + drop, low', idea: 'the moon sits lower, a drop below it on the brow', draw(k) {
      moon(k, { lo: -18, hi: 4 }); k.line([[0, -18], [0, -24]], { w: 1 }); k.blob([0, -31], 5, 7.5, { fill: '#e2d8c2' }); } },
    { name: 'C5 · Waxing moons', idea: 'small moons repeat back along the band, each smaller (0.7)', draw(k) {
      moon(k); for (const [x, y, s] of [[92, 22, 1], [108, 8, 0.7]]) { k.both([[x - 8 * s, y + 6 * s], [x, y - 2 * s], [x + 8 * s, y + 6 * s]], { w: 1.3 }); } } },
    { name: 'C6 · Moon holding a pearl', idea: 'a round pearl sits in the bowl of the moon: the upward accent', draw(k) {
      moon(k); k.blob([0, 17], 8, 8, { fill: '#efe7d4' }); } },
    { name: 'C7 · Moon with a leaf', idea: 'a single slim leaf rises from the bowl, leaning, alive', draw(k) {
      moon(k); k.line([[0, 8], [4, 24], [-2, 44], [6, 60]], { w: 1.8 }); k.line([[0, 8], [-8, 24], [-2, 44]], { w: 1.2 }); } },
    { name: 'C8 · Thin moon', idea: 'the same moon at half the depth: finer, more like a circlet', draw(k) { moon(k, { lo: -8, hi: 4 }); } },
    { name: 'K1 · Infinity', idea: 'a lemniscate lying at the brow; its outer ends run up into the antlers', draw(k) {
      k.both([B, [50, 26], [34, 18], [18, 6], [0, 0], [-18, -6], [-30, -2], [-34, 8], [-26, 16], [-12, 10], [0, 0]], { w: 2 }); } },
    { name: 'K2 · Infinity + pearl', idea: 'a pearl at the crossing hides the knot and gives it a centre', draw(k) {
      k.both([B, [50, 26], [34, 18], [18, 6], [0, 0], [-18, -6], [-30, -2], [-34, 8], [-26, 16], [-12, 10], [0, 0]], { w: 2 }); k.blob([0, 1], 6, 6, { fill: '#efe7d4' }); } },
    { name: 'K3 · Tall infinity', idea: 'the loops stand up (an 8 on its side, taller): less like a moustache', draw(k) {
      k.both([B, [50, 22], [30, 10], [14, 4], [0, 8], [-14, 20], [-24, 34], [-18, 44], [-6, 38], [0, 8]], { w: 2 }); } },
    { name: 'K4 · Infinity on a moon', idea: 'the moon’s inner edge ties itself into one loop at the centre', draw(k) {
      moon(k, { solid: false }); k.line([[-14, 10], [-18, 24], [-8, 32], [0, 22], [8, 32], [18, 24], [14, 10]], { w: 1.6 }); } },
  ],
};
