// Round 1: gesture thumbnails. One idea each, lines only: where does the eye enter, where does it go, what
// holds the two antlers together? Front elevation, mm; the antler bases are at about (±67, 38).
const B = [67, 38];   // right antler base (viewer's right)
module.exports = {
  title: 'Round 1 · gesture thumbnails',
  cols: 5, cell: 260, weight: 1.7, frame: [-150, -70, 150, 170],
  sketches: [
    { name: 'A · Lyre rise', idea: 'a V at the brow, each side one S up into the antler', draw(k) {
      k.both([[0, -10], [18, 2], [40, 22], [58, 32], B], { w: 2.4 });
      k.both([[0, -10], [10, 18], [8, 44]], { w: 1.2 }); } },
    { name: 'B · Crossing at the brow', idea: 'each antler sends a line across the forehead; they cross and scroll', draw(k) {
      k.both([B, [46, 22], [16, 6], [-14, 2], [-30, 10], [-28, 20], [-20, 18]], { w: 2 });
      k.both([B, [80, 20], [88, -2]], { w: 1.2 }); } },
    { name: 'C · Bridge', idea: 'an arch from antler to antler, high over the forehead', draw(k) {
      k.line([[-67, 38], [-44, 62], [0, 78], [44, 62], [67, 38]], { w: 2.2 });
      k.line([[-78, 20], [-40, 4], [0, 0], [40, 4], [78, 20]], { w: 1.4 }); } },
    { name: 'D · Crescent', idea: 'a crescent moon across the brow, horns rising into the antlers', draw(k) {
      k.line([[-70, 42], [-50, 10], [0, -12], [50, 10], [70, 42]], { w: 2.4 });
      k.line([[-66, 38], [-40, 20], [0, 10], [40, 20], [66, 38]], { w: 1.3 }); } },
    { name: 'E · Roots', idea: 'the antlers grip the head: roots spread down onto the forehead', draw(k) {
      for (const r of [[[62, 30], [44, 10], [30, -6]], [[60, 30], [50, 8], [46, -14]], [[64, 30], [66, 8], [70, -8]]]) k.both([B, ...r], { w: 1.6 }); } },
    { name: 'F · Wings', idea: 'from the brow two long lines sweep out and up past the antlers', draw(k) {
      k.both([[0, -6], [30, 8], [70, 34], [110, 70], [130, 100]], { w: 2.4 });
      k.both([[0, -6], [36, 0], [80, 14], [120, 40]], { w: 1.2 }); } },
    { name: 'G · Flame fan', idea: 'a tall centre flame, flames graduated out toward the antlers', draw(k) {
      k.line([[0, 0], [-6, 40], [0, 90]], { w: 2.2 });
      k.both([[14, 2], [16, 34], [26, 64]], { w: 1.6 }); k.both([[30, 8], [36, 30], [46, 48]], { w: 1.2 });
      k.line([[-80, 20], [-40, 4], [0, 0], [40, 4], [80, 20]], { w: 1.4 }); } },
    { name: 'H · Pendant', idea: 'a calm circlet dipping to one hanging drop', draw(k) {
      k.line([[-88, 30], [-60, 16], [-20, 6], [0, -4], [20, 6], [60, 16], [88, 30]], { w: 1.8 });
      k.line([[0, -4], [0, -14]], { w: 1 }); k.blob([0, -20], 5, 7, { fill: 'none' }); } },
    { name: 'I · Vine', idea: 'one tendril winds from one antler across the brow to the other', draw(k) {
      k.line([B, [50, 14], [26, 20], [10, 4], [-8, -4], [-24, 12], [-48, 18], [-67, 38]], { w: 2.2 });
      k.line(k.scroll([30, 26], 6, 1.3, 0, 1, 0.5), { raw: true, w: 1 }); k.line(k.scroll([-20, -2], 6, 1.3, 3.14, 1, 0.5), { raw: true, w: 1 }); } },
    { name: 'J · Heart', idea: 'lines from the antler bases curl in and meet in a heart at the brow', draw(k) {
      k.both([B, [40, 44], [16, 40], [6, 24], [0, 4]], { w: 2.2 });
      k.line([[-80, 20], [-40, 4], [0, 0], [40, 4], [80, 20]], { w: 1.2 }); } },
    { name: 'K · Ogee', idea: 'an ogee arch at the centre: S-curves meeting in a point', draw(k) {
      k.both([[26, 2], [24, 30], [8, 54], [0, 86]], { w: 2.2 });
      k.both([[26, 2], [46, 20], B], { w: 1.4 }); k.line([[-80, 20], [-26, 2], [0, 0], [26, 2], [80, 20]], { w: 1.2 }); } },
    { name: 'L · Canopy', idea: 'branches from each antler arch in and interlace over the forehead', draw(k) {
      k.both([B, [40, 60], [10, 70], [-24, 58]], { w: 2 }); k.both([[40, 60], [34, 84]], { w: 1.2 }); k.both([[10, 70], [4, 90]], { w: 1 }); } },
    { name: 'M · Tide', idea: 'the band is a wave: crests at the temples, a trough at the brow', draw(k) {
      k.line([[-110, 10], [-88, 44], [-67, 40], [-40, 10], [-20, -2], [0, 0], [20, -2], [40, 10], [67, 40], [88, 44], [110, 10]], { w: 2.2 }); } },
    { name: 'N · Volutes', idea: 'a spiral scroll set at each temple; the band runs between', draw(k) {
      k.both([[0, 0], [30, 4], [54, 14], [64, 22]], { w: 1.8 });
      k.line(k.scroll([60, 30], 14, 1.4, -2.2, 1, 0.45), { raw: true, w: 2 }); k.line(k.mirror(k.scroll([60, 30], 14, 1.4, -2.2, 1, 0.45)), { raw: true, w: 2 }); } },
    { name: 'O · Crest', idea: 'the band peaks up at the centre, lifting the eye (no dip)', draw(k) {
      k.line([[-88, 20], [-50, 14], [-20, 20], [0, 44], [20, 20], [50, 14], [88, 20]], { w: 2.2 }); } },
    { name: 'P · Echo', idea: 'small antler forms rise from the band, graduated toward the centre', draw(k) {
      k.line([[-88, 22], [-40, 4], [0, 0], [40, 4], [88, 22]], { w: 1.6 });
      for (const [x, h] of [[0, 34], [22, 24], [42, 16]]) { k.both([[x, 2], [x + 2, h]], { w: 1.4 }); k.both([[x + 1, h * 0.6], [x + 8, h * 0.9]], { w: 1 }); } } },
    { name: 'Q · Gothic arcade', idea: 'a row of pointed arches, tallest at the centre', draw(k) {
      k.line([[-80, 20], [-40, 4], [0, 0], [40, 4], [80, 20]], { w: 1.4 });
      for (const [x, w, h] of [[0, 14, 50], [30, 12, 34], [54, 10, 22]]) k.both([[x - w, 2], [x - w * 0.8, h * 0.6], [x, h]], { w: 1.4 }); } },
    { name: 'R · Swept locks', idea: 'from the antlers, long strands flow back along the head like hair', draw(k) {
      k.both([B, [84, 40], [104, 28], [120, 6]], { w: 2 }); k.both([B, [86, 50], [110, 44], [130, 26]], { w: 1.4 });
      k.line([[-67, 38], [-30, 8], [0, 2], [30, 8], [67, 38]], { w: 1.6 }); } },
    { name: 'S · Leaf pair', idea: 'two great leaves meet at the brow, tips up into the antlers', draw(k) {
      k.both([[0, 0], [20, -2], [44, 12], [60, 34], [64, 50]], { w: 2.2 }); k.both([[0, 0], [22, 18], [44, 32], [64, 50]], { w: 1.4 }); } },
    { name: 'T · Diadem', idea: 'a tall, narrow front plate standing on a plain band', draw(k) {
      k.both([[0, 0], [22, 8], [26, 40], [10, 66], [0, 72]], { w: 2 }); k.line([[-88, 22], [-40, 4], [0, 0], [40, 4], [88, 22]], { w: 1.4 }); } },
  ],
};
