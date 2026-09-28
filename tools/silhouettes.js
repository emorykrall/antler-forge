// Silhouette contact sheets for judging a crown's composition: flat black shapes from several angles,
// with the head as a pale reference, so only form, hierarchy and negative space are left to read. The head
// hides what's behind it, as when the crown is worn (add :object to a config to see the whole object).
// Usage: node tools/silhouettes.js out.png [config ...]
//   config: preset:pattern:character[:crown][:object]   e.g. stag:circlet:0.9   spirit:spines:0.3:crown (crown only)
// One row per config; columns: front, three-quarter, side, back, top.
const fs = require('fs');
const zlib = require('zlib');
const Core = require('../src/antler-core.js');

const VIEWS = [['front', 0, 0], ['3/4', 35, 12], ['side', 90, 0], ['back', 180, 0], ['top', 0, 90]];
const CELL = 260;

function viewMatrix(yaw, pitch) {   // camera looks along -forward; returns [right, up] basis in model space
  const y = (yaw * Math.PI) / 180, p = (pitch * Math.PI) / 180;
  const fwd = [Math.sin(y) * Math.cos(p), Math.cos(y) * Math.cos(p), Math.sin(p)];   // from the model toward the camera
  let right = [Math.cos(y), -Math.sin(y), 0];
  const up = [fwd[1] * right[2] - fwd[2] * right[1], fwd[2] * right[0] - fwd[0] * right[2], fwd[0] * right[1] - fwd[1] * right[0]];
  return { right, up: up.map((v) => -v), fwd };
}
function render(configs) {
  const W = CELL * VIEWS.length, H = CELL * configs.length, img = new Uint8Array(W * H).fill(255), stats = [];
  configs.forEach((cfg, row) => {
    const [preset, pattern, character, ...flags] = cfg.split(':'), only = flags.includes('crown') ? 'crown' : '', object = flags.includes('object');
    const P = Object.assign(Core.presetParams(preset, Object.assign({}, Core.DEFAULTS, { style: 'crown' })), { ringPattern: pattern, ringCharacter: Number(character) });
    const sk = Core.buildSkeleton(P);
    if (only === 'crown') { sk.branches = sk.branches.filter((b) => !b.antler); sk.burrs = []; sk.palms = []; }
    const mesh = Core.meshAntler(sk, 1.4), pos = mesh.positions, idx = mesh.indices;
    const hc = sk.head.c, hr = sk.head.r;
    // one scale for every view of a row, from the model's largest extent
    let ext = 0; for (let i = 0; i < pos.length; i += 3) ext = Math.max(ext, Math.hypot(pos[i] - hc[0], pos[i + 1] - hc[1], pos[i + 2] - hc[2]));
    const k = (CELL * 0.46) / ext;
    VIEWS.forEach(([, yaw, pitch], col) => {
      const { right, up, fwd: f } = viewMatrix(yaw, pitch), ox = col * CELL + CELL / 2, oy = row * CELL + CELL / 2;   // f: toward the camera
      const headZ = new Float32Array(CELL * CELL).fill(-Infinity);   // depth of the head's near surface, per pixel
      const P2 = (x, y, z) => { const d = [x - hc[0], y - hc[1], z - hc[2]]; return [ox + k * (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]), oy - k * (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]), d[0] * f[0] + d[1] * f[1] + d[2] * f[2]]; };
      // the head, pale grey, for scale and placement
      for (let py = row * CELL; py < (row + 1) * CELL; py++) for (let px = col * CELL; px < (col + 1) * CELL; px++) {
        // inverse-project: a point is inside the head's silhouette if the ray through it hits the ellipsoid
        const u = (px - ox) / k, v = -(py - oy) / k, q = [u * right[0] + v * up[0], u * right[1] + v * up[1], u * right[2] + v * up[2]];
        let A = 0, B = 0, C = -1;
        for (let a = 0; a < 3; a++) { A += (f[a] / hr[a]) ** 2; B += (2 * q[a] * f[a]) / hr[a] ** 2; C += (q[a] / hr[a]) ** 2; }
        const disc = B * B - 4 * A * C;
        if (disc >= 0) { img[py * W + px] = 225; if (!object) headZ[(py - row * CELL) * CELL + (px - col * CELL)] = (-B + Math.sqrt(disc)) / (2 * A); }
      }
      for (let t = 0; t < idx.length; t += 3) {   // fill every triangle black
        const a = P2(pos[3 * idx[t]], pos[3 * idx[t] + 1], pos[3 * idx[t] + 2]), b = P2(pos[3 * idx[t + 1]], pos[3 * idx[t + 1] + 1], pos[3 * idx[t + 1] + 2]), c = P2(pos[3 * idx[t + 2]], pos[3 * idx[t + 2] + 1], pos[3 * idx[t + 2] + 2]);
        const x0 = Math.max(col * CELL, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min((col + 1) * CELL - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
        const y0 = Math.max(row * CELL, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min((row + 1) * CELL - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
        const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
        if (Math.abs(d) < 1e-9) continue;
        for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
          const l1 = ((b[1] - c[1]) * (px + 0.5 - c[0]) + (c[0] - b[0]) * (py + 0.5 - c[1])) / d, l2 = ((c[1] - a[1]) * (px + 0.5 - c[0]) + (a[0] - c[0]) * (py + 0.5 - c[1])) / d;
          if (!(l1 >= -0.02 && l2 >= -0.02 && l1 + l2 <= 1.02)) continue;
          const z = l1 * a[2] + l2 * b[2] + (1 - l1 - l2) * c[2];   // hidden behind the head?
          if (z < headZ[(py - row * CELL) * CELL + (px - col * CELL)] - 1) continue;
          img[py * W + px] = 0;
        }
      }
      let ink = 0, top = CELL, bot = 0;   // how much of this view the shape takes, and its height
      for (let py = row * CELL; py < (row + 1) * CELL; py++) for (let px = col * CELL; px < (col + 1) * CELL; px++) if (img[py * W + px] === 0) { ink++; top = Math.min(top, py - row * CELL); bot = Math.max(bot, py - row * CELL); }
      stats.push({ cfg, view: VIEWS[col][0], ink: ink / k / k, height: (bot - top) / k });   // in mm² and mm
      for (let i = 0; i < CELL; i++) { img[(row * CELL) * W + col * CELL + i] = 180; img[(row * CELL + i) * W + col * CELL] = 180; }   // grid lines
    });
  });
  return { W, H, img, stats };
}
function png({ W, H, img }) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((W + 1) * H); for (let y = 0; y < H; y++) { raw[y * (W + 1)] = 0; Buffer.from(img.buffer, y * W, W).copy(raw, y * (W + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
if (require.main === module) {
  const [out, ...configs] = process.argv.slice(2);
  const r = render(configs);
  fs.writeFileSync(out, png(r));
  console.log('wrote ' + out);
  for (const st of r.stats) if (st.view === 'front' || st.view === 'side') console.log(`${st.cfg.padEnd(28)} ${st.view.padEnd(5)} area ${st.ink.toFixed(0).padStart(6)} mm²  height ${st.height.toFixed(0).padStart(4)} mm`);
}
module.exports = { render, png };
