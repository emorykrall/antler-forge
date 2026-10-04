'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

test('tools/build-page.js builds all the outputs, in both editions', () => {
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
    // the Yellowjackets edition: its own page from the same source, with its blocks swapped in
    const yj = fs.readFileSync(path.join(site, 'yellowjackets.html'), 'utf8');
    assert.ok(yj.startsWith('<!doctype html>') && yj.includes('AntlerCore'), 'a full document with the engine');
    assert.ok(yj.includes('DEER_SKULL.data =') && !standalone.includes('DEER_SKULL.data ='), 'the skull cap\'s scan is inlined where the cap is offered');
    assert.ok(yj.includes('<title>Antler Forge: Yellowjackets</title>') && yj.includes("'yellowjackets'/*@/edition*/") && yj.includes('function buildShade'), 'its blocks are swapped in');
    assert.ok(!page.includes('function buildShade') && page.includes("'storybook'/*@/edition*/"), 'the storybook page keeps its own');
    assert.ok(fs.existsSync(path.join(out, 'yellowjackets.html')) && fs.existsSync(path.join(out, 'yellowjackets-standalone.html')));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
