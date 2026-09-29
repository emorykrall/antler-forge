// Round 6: back to round 1's Roots, untested since. The antlers look grown from the head: roots leave each
// antler base and grip the head. Risk: claws (horror) or a spider. Keep them few, long, tapering and flowing,
// Art Nouveau rather than anatomical, and let them join into a band so the piece is one object.
const B = [67, 38];
module.exports = {
  title: 'Round 6 · Roots, revisited',
  cols: 4, cell: 300, weight: 1.6, frame: [-150, -70, 150, 170],
  sketches: [
    { name: 'R1 · Three roots', idea: 'three long roots per antler, the front one meeting its twin at the brow', draw(k) {
      k.both([B, [50, 20], [24, 6], [0, 2]], { w: 2.2 }); k.both([B, [60, 18], [58, -2], [52, -16]], { w: 1.5 }); k.both([B, [74, 22], [84, 4]], { w: 1.3 }); } },
    { name: 'R2 · Roots braid to a band', idea: 'roots from both antlers twist together across the brow', draw(k) {
      k.both([B, [48, 18], [26, 8], [0, 4], [-24, 2]], { w: 1.9 }); k.both([B, [52, 28], [30, 4], [8, -2], [-16, 6]], { w: 1.3 }); } },
    { name: 'R3 · Roots + drop', idea: 'two roots per side meet at the brow and hang a single seed', draw(k) {
      k.both([B, [48, 22], [22, 8], [0, -2]], { w: 2.2 }); k.both([B, [56, 16], [40, -2], [16, -8], [0, -2]], { w: 1.4 }); k.blob([0, -10], 4, 6, { fill: '#e2d8c2' }); } },
    { name: 'R4 · Crown of roots', idea: 'roots rise as well as grip: up-curling tendrils flank each antler', draw(k) {
      k.both([B, [48, 20], [24, 6], [0, 2]], { w: 2 }); k.both([[56, 28], [48, 44], [52, 58], [60, 60]], { w: 1.3 }); k.both([B, [80, 24], [88, 8]], { w: 1.3 }); } },
  ],
};
