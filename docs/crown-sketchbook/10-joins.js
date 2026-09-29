// Round 10: close-ups of the joins, model against sketch: where each design meets the antler roots.
const Core = require('../../src/antler-core.js');
const ref = require('./08-refined-2.js').sketches;
const crown = (pat, ch) => Object.assign(Core.presetParams('stag', Object.assign({}, Core.DEFAULTS, { style: 'crown' })), { ringPattern: pat, character: ch == null ? 0.5 : ch });
const Z = [20, -20, 110, 70];
module.exports = { title: 'Round 10 · joins at the antler roots', cols: 3, cell: 420, weight: 1.3, sketches: [
  Object.assign({}, ref[0], { name: 'Moon · horn meets antler', idea: '', frame: Z, model: crown('moon'), modelOpts: { res: 0.5, px: 0.2 } }),
  Object.assign({}, ref[2], { name: 'Lotus · band meets antler', idea: '', frame: Z, model: crown('lotus'), modelOpts: { res: 0.5, px: 0.2 } }),
  Object.assign({}, ref[4], { name: 'Roots · roots leave the antler', idea: '', frame: Z, model: crown('roots'), modelOpts: { res: 0.5, px: 0.2 } }),
] };
