'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

test('tools/build-page.js builds all three outputs', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'antler-forge-'));
  try {
    execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'build-page.js'), out], { stdio: 'pipe' });
    const page = fs.readFileSync(path.join(out, 'antler-forge.html'), 'utf8');
    const standalone = fs.readFileSync(path.join(out, 'antler-forge-standalone.html'), 'utf8');
    assert.ok(!page.includes('/*__CORE__*/') && page.includes('AntlerCore'), 'engine is inlined');
    assert.ok(standalone.startsWith('<!doctype html>'), 'standalone is a full document');
    const site = path.join(out, 'site');
    assert.equal(fs.readFileSync(path.join(site, 'index.html'), 'utf8'), standalone);
    assert.ok(fs.existsSync(path.join(site, 'serve.js')));
    const vendor = fs.readdirSync(path.join(site, 'vendor', 'face_mesh'));
    // the page asks for the tracker's binaries by these names, and file:// needs the .b64.js copies
    for (const f of ['face_mesh.js', 'face_mesh.binarypb.wasm', 'face_mesh_solution_packed_assets.data.wasm']) assert.ok(vendor.includes(f), f);
    for (const f of vendor.filter((f) => f.endsWith('.wasm'))) assert.ok(vendor.includes(f + '.b64.js'), f + '.b64.js');
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
