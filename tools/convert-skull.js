// Converts the Smithsonian's white-tailed deer skull scan (CC0) into src/deer-skull.js: a signed distance grid of the
// upper skull that the engine carves the skull cap from. Run once, offline; the scan itself isn't bundled.
// Usage: node tools/convert-skull.js USNM_PAL_Deer_skull-150k.obj [step mm]
//   The OBJ is in USNM_PAL_Deer_skull-100k-2048-obj_std.zip, from the scan's page (see NOTICE).
//
// Skull frame (mm): x across (the midline at 0), y along the skull (+ toward the nose), z up (dorsal). The scan is in
// metres with x across, y dorsal and z toward the nose. The skull is made exactly symmetric: one half is kept, about the
// plane that best matches its two sides, and the engine mirrors it. Distances are clamped to ±BAND mm, so only the
// band round the bone carries detail. Stored as int8 (Q mm steps), run-length coded (-128, run, value), base64.
'use strict';
const fs = require('fs');
const path = require('path');
const [, , objPath, stepArg] = process.argv;
if (!objPath) { console.error('usage: node tools/convert-skull.js USNM_PAL_Deer_skull-150k.obj [step mm]'); process.exit(2); }
const STEP = +(stepArg || 1.5), BAND = 6.35, Q = 0.05;

// ---------------------------------------------------------------- the mesh, in the skull frame
const V = [], T = [];
for (const l of fs.readFileSync(objPath, 'utf8').split('\n')) {
  if (l.startsWith('v ')) { const [, x, y, z] = l.trim().split(/\s+/); V.push([+x * 1000, +z * 1000, +y * 1000]); }
  else if (l.startsWith('f ')) T.push(l.trim().split(/\s+/).slice(1, 4).map((t) => parseInt(t, 10) - 1));
}
const tris = T.map((t) => t.map((i) => V[i]));
console.log(`${V.length} vertices, ${tris.length} triangles`);

// the midline: the plane x = c that best matches the dorsal heightfield with its mirror image
const top = new Map(), key = (i, j) => (i + 500) * 2000 + j + 500, C = 2;   // the dorsal heightfield, on 2 mm columns
for (const t of tris) {
  const zt = Math.max(t[0][2], t[1][2], t[2][2]);
  for (let i = Math.floor(Math.min(t[0][0], t[1][0], t[2][0]) / C); i <= Math.floor(Math.max(t[0][0], t[1][0], t[2][0]) / C); i++)
    for (let j = Math.floor(Math.min(t[0][1], t[1][1], t[2][1]) / C); j <= Math.floor(Math.max(t[0][1], t[1][1], t[2][1]) / C); j++) {
      const k = key(i, j); if (!(top.get(k) >= zt)) top.set(k, zt);
    }
}
let mid = 0, bestErr = Infinity;
for (let c = -4; c <= 4; c += 0.25) {   // mirror about x = c: column i (centre (i + ½)C) ↔ column 2c/C − i − 1
  const e = [];
  for (const [k, z] of top) {
    const i = Math.floor(k / 2000) - 500, j = (k % 2000) - 500, m = top.get(key(Math.round(2 * c / C - i - 1), j));
    if (m !== undefined) e.push(Math.abs(m - z));
  }
  e.sort((p, q) => p - q); const med = e[e.length >> 1];
  if (med < bestErr) { bestErr = med; mid = c; }
}
for (const p of V) p[0] -= mid;
console.log(`midline x = ${mid.toFixed(2)} mm (median mirror mismatch ${bestErr.toFixed(2)} mm)`);

// ---------------------------------------------------------------- landmarks: the pedicles' cut discs (flat, near the top, behind the eye sockets)
function disc(side) {
  const cand = [];
  for (const [a, b, c] of tris) {
    const m = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3);
    if (Math.hypot(m[0] - side * 38, m[1] + 61) > 18 || m[2] < 20) continue;
    const e1 = b.map((v, k) => v - a[k]), e2 = c.map((v, k) => v - a[k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], ar = Math.hypot(...n) / 2;
    if (ar > 0) cand.push({ m, n: n.map((v) => v / (2 * ar)), ar });
  }
  let best = null;
  for (const c of cand) { let s = 0; for (const d of cand) if (c.n[0] * d.n[0] + c.n[1] * d.n[1] + c.n[2] * d.n[2] > 0.985) s += d.ar; if (!best || s > best.s) best = { s, n: c.n }; }
  const on = (d) => d.n[0] * best.n[0] + d.n[1] * best.n[1] + d.n[2] * best.n[2] > 0.97;
  const offs = cand.filter(on).map((d) => d.m[0] * best.n[0] + d.m[1] * best.n[1] + d.m[2] * best.n[2]).sort((a, b) => a - b), o = offs[offs.length >> 1];
  let A = 0; const C = [0, 0, 0];
  for (const d of cand) if (on(d) && Math.abs(d.m[0] * best.n[0] + d.m[1] * best.n[1] + d.m[2] * best.n[2] - o) < 1) { A += d.ar; for (let k = 0; k < 3; k++) C[k] += d.m[k] * d.ar; }
  const n = best.n[2] < 0 ? best.n.map((v) => -v) : best.n;   // outward (the frame swap mirrored the winding)
  return { c: C.map((v) => v / A), n, r: Math.sqrt(A / Math.PI) };
}
const discs = [disc(1), disc(-1)];
// keep the half whose disc is the rounder, flatter cut; its pedicle becomes the right one (+x)
const keep = discs[0].r >= discs[1].r ? 1 : -1, D = discs[keep > 0 ? 0 : 1];
if (keep < 0) { for (const p of V) p[0] = -p[0]; D.c[0] = -D.c[0]; D.n[0] = -D.n[0]; }
console.log(`pedicle disc (kept side ${keep}): centre ${D.c.map((v) => v.toFixed(1))}, normal ${D.n.map((v) => v.toFixed(2))}, radius ${D.r.toFixed(1)}`);

// ---------------------------------------------------------------- the grid: half the skull (x ≥ 0), down to the jaw line
let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (const p of V) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
const zFloor = -40;   // well under any cut the cap makes (the cap is the skull above the eye sockets' middle)
const org = [-2 * STEP, lo[1] - 2 * STEP, zFloor];
const n = [Math.ceil((hi[0] + 2 * STEP - org[0]) / STEP) + 1, Math.ceil((hi[1] + 2 * STEP - org[1]) / STEP) + 1, Math.ceil((hi[2] + 2 * STEP - org[2]) / STEP) + 1];
const N = n[0] * n[1] * n[2], idx = (i, j, k) => (k * n[1] + j) * n[0] + i;
console.log(`grid ${n.join(' × ')} = ${N} cells at ${STEP} mm`);
const dist = new Float32Array(N).fill(BAND);

function ptTri(p, a, b, c) {   // squared distance from p to triangle abc (Ericson)
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dt = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const d1 = dt(ab, ap), d2 = dt(ac, ap); if (d1 <= 0 && d2 <= 0) return dt(ap, ap);
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]], d3 = dt(ab, bp), d4 = dt(ac, bp); if (d3 >= 0 && d4 <= d3) return dt(bp, bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3), q = [ap[0] - v * ab[0], ap[1] - v * ab[1], ap[2] - v * ab[2]]; return dt(q, q); }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], d5 = dt(ab, cp), d6 = dt(ac, cp); if (d6 >= 0 && d5 <= d6) return dt(cp, cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6), q = [ap[0] - w * ac[0], ap[1] - w * ac[1], ap[2] - w * ac[2]]; return dt(q, q); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)), q = [bp[0] - w * (c[0] - b[0]), bp[1] - w * (c[1] - b[1]), bp[2] - w * (c[2] - b[2])]; return dt(q, q); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den, q = [ap[0] - ab[0] * v - ac[0] * w, ap[1] - ab[1] * v - ac[1] * w, ap[2] - ab[2] * v - ac[2] * w];
  return dt(q, q);
}
const t0 = Date.now();
for (const [a, b, c] of tris) {
  const g0 = [0, 1, 2].map((k) => Math.max(0, Math.floor((Math.min(a[k], b[k], c[k]) - BAND - org[k]) / STEP)));
  const g1 = [0, 1, 2].map((k) => Math.min(n[k] - 1, Math.ceil((Math.max(a[k], b[k], c[k]) + BAND - org[k]) / STEP)));
  for (let k = g0[2]; k <= g1[2]; k++) for (let j = g0[1]; j <= g1[1]; j++) for (let i = g0[0]; i <= g1[0]; i++) {
    const o = idx(i, j, k), d = Math.sqrt(ptTri([org[0] + i * STEP, org[1] + j * STEP, org[2] + k * STEP], a, b, c));
    if (d < dist[o]) dist[o] = d;
  }
}
console.log(`distances in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// inside or outside: crossings along vertical rays through each column (the mesh is closed); three nudged rays vote
const inside = new Uint8Array(N);
const cols = new Map();   // column (i, j) → triangles whose xy footprint covers it
tris.forEach((t, ti) => {
  const i0 = Math.max(0, Math.floor((Math.min(t[0][0], t[1][0], t[2][0]) - org[0]) / STEP)), i1 = Math.min(n[0] - 1, Math.ceil((Math.max(t[0][0], t[1][0], t[2][0]) - org[0]) / STEP));
  const j0 = Math.max(0, Math.floor((Math.min(t[0][1], t[1][1], t[2][1]) - org[1]) / STEP)), j1 = Math.min(n[1] - 1, Math.ceil((Math.max(t[0][1], t[1][1], t[2][1]) - org[1]) / STEP));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const kk = j * n[0] + i; let l = cols.get(kk); if (!l) cols.set(kk, (l = [])); l.push(ti); }
});
const NUDGE = [[0.0137, 0.0071], [-0.0093, 0.0121], [0.0049, -0.0158]];
for (const [kk, list] of cols) {
  const i = kk % n[0], j = (kk - i) / n[0], votes = new Uint8Array(n[2]);
  for (const [ex, ey] of NUDGE) {
    const x = org[0] + i * STEP + ex, y = org[1] + j * STEP + ey, zs = [];
    for (const ti of list) {
      const [a, b, c] = tris[ti];
      const d = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]); if (Math.abs(d) < 1e-12) continue;
      const u = ((x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1])) / d, v = ((b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1])) / d;
      if (u < 0 || v < 0 || u + v > 1) continue;
      zs.push(a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]));
    }
    zs.sort((p, q) => p - q);
    for (let k = 0, h = 0; k < n[2]; k++) { const z = org[2] + k * STEP; while (h < zs.length && zs[h] < z) h++; if (h & 1) votes[k]++; }
  }
  for (let k = 0; k < n[2]; k++) if (votes[k] >= 2) inside[idx(i, j, k)] = 1;
}

// ---------------------------------------------------------------- encode
const q = new Int8Array(N);
for (let o = 0; o < N; o++) q[o] = Math.max(-127, Math.min(127, Math.round((inside[o] ? -dist[o] : dist[o]) / Q)));
const bytes = [];
for (let o = 0; o < N;) {
  let r = 1; while (o + r < N && q[o + r] === q[o] && r < 255) r++;
  if (r >= 3 || q[o] === -128) { bytes.push(0x80, r, q[o] & 255); o += r; } else { bytes.push(q[o] & 255); o++; }
}
const b64 = Buffer.from(bytes).toString('base64');
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;
const meta = { step: STEP, q: Q, band: BAND, org: org.map(r1), n, disc: { c: D.c.map(r1), n: D.n.map(r3), r: r1(D.r) } };
const out = path.join(__dirname, '..', 'src', 'deer-skull.js');
fs.writeFileSync(out, `// A white-tailed deer's skull (Odocoileus virginianus), from the Smithsonian's CC0 scan "White-tailed Deer: Skull
// and Mandible" (USNM PAL; see NOTICE). Generated by tools/convert-skull.js; don't edit.
// Half the skull (x ≥ 0, mirrored for the other side) as a signed distance grid in mm, negative inside the bone:
// x across, y along the skull toward the nose, z up. int8 in steps of q mm, clamped to ±band; run-length coded as
// (-128, run, value); base64. disc: the right pedicle's cut face (centre, outward normal, radius).
(function (root) {
  const DEER_SKULL = ${JSON.stringify(meta)};
  DEER_SKULL.data = '${b64}';
  if (typeof module === 'object' && module.exports) module.exports = DEER_SKULL;
  else root.DEER_SKULL = DEER_SKULL;
})(typeof self !== 'undefined' ? self : this);
`);
console.log(`wrote ${path.relative(process.cwd(), out)}: ${(b64.length / 1024).toFixed(0)} KB of data (${bytes.length} bytes)`);
