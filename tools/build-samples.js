#!/usr/bin/env node
// Regenerates samples/: one right-hand STL per preset at 0.6 mm voxels (the resolution the original samples used).
// Usage: node tools/build-samples.js [preset ...]   (all presets when none are given)
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const Core = require('../src/antler-core.js');

const repo = path.join(__dirname, '..');
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(Core.PRESETS);
let failed = 0;
for (const name of names) {
  if (!Core.PRESETS[name]) { console.error(`unknown preset "${name}" (see --list-presets)`); failed++; continue; }
  console.log(`— ${name}`);
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'build-antlers.js'), '--preset', name, '--side', 'right', '--notes', 'false', '--res', '0.6', '--out', path.join(repo, 'samples')], { stdio: 'inherit' });
  } catch (e) { failed++; }
}
process.exitCode = failed ? 1 : 0;
