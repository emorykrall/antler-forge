'use strict';
// PARAM_SPEC drives both the page controls and the CLI flags; its groups only arrange the page.
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/antler-core.js');

test('every setting appears exactly once in PARAM_SPEC, in a known tier', () => {
  const keys = Core.PARAM_SPEC.flatMap((g) => g.items.map((it) => it.k));
  assert.equal(new Set(keys).size, keys.length, 'duplicate key');
  assert.deepEqual([...keys].sort(), Object.keys(Core.DEFAULTS).filter((k) => k !== 'preset').sort());
  for (const g of Core.PARAM_SPEC) assert.ok(['essentials', 'details', 'advanced'].includes(g.tier), g.group);
});
