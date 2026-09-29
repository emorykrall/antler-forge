// Round 9: the 3D models against the refined sketches: each drawing's lines laid over the built crown,
// rendered in the same frame (front and side), so any drift between drawing and model shows directly.
const Core = require('../../src/antler-core.js');
const ref = require('./08-refined-2.js').sketches;
const crown = (pat, ch) => Object.assign(Core.presetParams('stag', Object.assign({}, Core.DEFAULTS, { style: 'crown' })), { ringPattern: pat, character: ch == null ? 0.5 : ch });
const sheet = [];
for (const [i, pat] of [[0, 'moon'], [2, 'lotus'], [4, 'roots']]) {
  for (const s of [ref[i], ref[i + 1]]) sheet.push(Object.assign({}, s, { name: s.name + ' · model + sketch', idea: '', model: crown(pat) }));
}
module.exports = { title: 'Round 9 · models against the sketches', cols: 2, cell: 520, weight: 1.3, sketches: sheet };
