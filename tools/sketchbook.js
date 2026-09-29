'use strict';
// A sketchbook for designing crowns in 2D before building them: pencil-like SVG sketches drawn over a
// front elevation of the real head and antlers (projected from a crown skeleton), so each idea is judged at
// the size and in the place it will be worn. Sketch coordinates are millimetres in the front view: x to the
// wearer's left (the viewer's right), y up, origin at the front of the tape line.
//
// Usage: node tools/sketchbook.js <sheet.js> <out.html>
//   sheet.js exports { title, cols, cell, sketches: [{ name, idea, draw(k) }] } where draw calls k.line(...) etc.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Core = require('../src/antler-core.js');

// ---- the underlay: head, tape line and antlers of a standard crown, seen from the front
function underlay(preset) {
  const P = Object.assign(Core.presetParams(preset || 'stag', Object.assign({}, Core.DEFAULTS, { style: 'crown' })), { ringPattern: 'band' });
  const sk = Core.buildSkeleton(P), liner = sk.branches.filter((b) => b.kind === 'liner');
  const y0 = liner[0].pts[0][2], yF = liner[0].pts[0][1];   // the tape line's height and the head's front, at the front
  const V = (p) => [p[0], p[2] - y0], Vs = (p) => [p[1] - yF, p[2] - y0];   // front view; side view (face to the right)
  return {
    y0, yF,
    headSide: { cx: sk.head.c[1] - yF, cy: sk.head.c[2] - y0, rx: sk.head.r[1], ry: sk.head.r[2] },
    antlersSide: sk.branches.filter((b) => b.antler && b.pts[0][0] > 0).map((b) => ({ pts: b.pts.map(Vs), rad: b.rad })),
    tapeSide: liner[0].pts.map(Vs),
    head: { cx: 0, cy: sk.head.c[2] - y0, rx: sk.head.r[0], ry: sk.head.r[2] },
    antlers: sk.branches.filter((b) => b.antler).map((b) => ({ pts: b.pts.map(V), rad: b.rad })),
    tape: liner.filter((b) => b.pts[0][0] >= -1).slice(0, 1).map((b) => b.pts.filter((p) => p[1] > 0).map(V))[0],   // the front half
    base: (() => { const b = sk.branches.find((x) => x.antler && x.kind === 'beam' && x.pts[0][0] > 0); return V(b.pts[0]); })(),
    baseSide: (() => { const b = sk.branches.find((x) => x.antler && x.kind === 'beam' && x.pts[0][0] > 0); return Vs(b.pts[0]); })(),
  };
}

// ---- drawing
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function spline(knots, n) {   // centripetal Catmull-Rom through the knots, n points per span
  if (knots.length < 3) return knots.slice();
  const P = [[2 * knots[0][0] - knots[1][0], 2 * knots[0][1] - knots[1][1]], ...knots,
    [2 * knots[knots.length - 1][0] - knots[knots.length - 2][0], 2 * knots[knots.length - 1][1] - knots[knots.length - 2][1]]];
  const out = [], d = (a, b) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])) || 1e-6;
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]], a = d(p0, p1), b = d(p1, p2), c = d(p2, p3);
    const m1 = [0, 1].map((k) => ((p1[k] - p0[k]) / a - (p2[k] - p0[k]) / (a + b) + (p2[k] - p1[k]) / b) * b);
    const m2 = [0, 1].map((k) => ((p2[k] - p1[k]) / b - (p3[k] - p1[k]) / (b + c) + (p3[k] - p2[k]) / c) * b);
    for (let j = i === 1 ? 0 : 1; j <= n; j++) {
      const u = j / n, h00 = 2 * u ** 3 - 3 * u * u + 1, h10 = u ** 3 - 2 * u * u + u, h01 = -2 * u ** 3 + 3 * u * u, h11 = u ** 3 - u * u;
      out.push([0, 1].map((k) => h00 * p1[k] + h10 * m1[k] + h01 * p2[k] + h11 * m2[k]));
    }
  }
  return out;
}
const mirror = (pts) => pts.map(([x, y]) => [-x, y]);
function scrollPts(c, r0, turns, a0, sgn, shrink) {   // a log spiral: centre c, starting radius r0 at angle a0
  const out = [], n = Math.ceil(turns * 40);
  for (let i = 0; i <= n; i++) { const a = a0 + sgn * (i / n) * turns * 2 * Math.PI, r = r0 * Math.pow(shrink, (i / n) * turns); out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
  return out;
}

// A sketch context: strokes collect SVG. Coordinates in mm; the sheet maps them into the cell.
function kit(opts) {
  const parts = [], S = opts.scale;
  const X = (p) => (p[0] * S).toFixed(1) + ',' + (-p[1] * S).toFixed(1);
  const jit = (pts, a) => { const o1 = rnd() * 6, o2 = rnd() * 6; return pts.map(([x, y], i) => [x + a * Math.sin(i * 0.21 + o1), y + a * Math.cos(i * 0.17 + o2)]); };
  const k = {
    spline, mirror, scroll: scrollPts,
    // a pencil line: a few light passes, slightly off one another
    line(knots, o = {}) {
      const pts = o.raw ? knots : spline(knots, 14), w = (o.w || 1.1) * (opts.weight || 1), passes = o.passes || 3, col = o.col || '#2b2620';
      for (let p = 0; p < passes; p++) {
        const q = jit(pts, (o.loose == null ? 0.9 : o.loose) * (p ? 1 : 0.4));
        parts.push(`<polyline points="${q.map(X).join(' ')}" fill="none" stroke="${col}" stroke-width="${(w * (p ? 0.7 : 1)).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" opacity="${(o.alpha || 0.75) * (p ? 0.55 : 1)}"/>`);
      }
      return pts;
    },
    both(knots, o) { k.line(knots, o); k.line(mirror(knots), o); },
    // a modulated stroke: a filled shape whose width follows wf(u) (mm), like a pen or a sculpted member
    body(knots, wf, o = {}) {
      const pts = o.raw ? knots : spline(knots, 16), n = pts.length, L = [], R = [];
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], t = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(t[0], t[1]) || 1;
        const nx = -t[1] / l, ny = t[0] / l, w = wf(i / (n - 1)) / 2;
        L.push([pts[i][0] + nx * w, pts[i][1] + ny * w]); R.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
      }
      const poly = L.concat(R.reverse());
      parts.push(`<polygon points="${poly.map(X).join(' ')}" fill="${o.fill || '#d9cfb8'}" stroke="${o.col || '#2b2620'}" stroke-width="${o.w || 0.9}" stroke-linejoin="round" opacity="${o.alpha || 0.95}"/>`);
      if (o.spine) k.line(pts, { raw: true, w: 0.5, passes: 1, alpha: 0.35, loose: 0 });   // a midrib or ridge
      return pts;
    },
    bodyBoth(knots, wf, o) { const a = k.body(knots, wf, o); k.body(mirror(o && o.raw ? knots : spline(knots, 16)), wf, Object.assign({}, o, { raw: true })); return a; },
    blob(c, rx, ry, o = {}) { parts.push(`<ellipse cx="${(c[0] * S).toFixed(1)}" cy="${(-c[1] * S).toFixed(1)}" rx="${(rx * S).toFixed(1)}" ry="${(ry * S).toFixed(1)}" fill="${o.fill || '#d9cfb8'}" stroke="${o.col || '#2b2620'}" stroke-width="${o.w || 0.9}" transform="rotate(${-(o.rot || 0)} ${(c[0] * S).toFixed(1)} ${(-c[1] * S).toFixed(1)})"/>`); },
    hatch(poly, o = {}) {   // light shading: parallel strokes clipped to a polygon
      const id = 'h' + Math.floor(rnd() * 1e9);
      parts.push(`<clipPath id="${id}"><polygon points="${poly.map(X).join(' ')}"/></clipPath><g clip-path="url(#${id})" opacity="${o.alpha || 0.35}">`);
      const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]), x0 = Math.min(...xs) - 50, x1 = Math.max(...xs) + 50, y0 = Math.min(...ys), y1 = Math.max(...ys), g = o.gap || 2.2;
      for (let x = x0; x < x1; x += g) parts.push(`<line x1="${(x * S).toFixed(1)}" y1="${(-y0 * S).toFixed(1)}" x2="${((x + (y1 - y0) * 0.6) * S).toFixed(1)}" y2="${(-y1 * S).toFixed(1)}" stroke="#2b2620" stroke-width="0.5"/>`);
      parts.push('</g>');
    },
    note(p, text, o = {}) { parts.push(`<text x="${(p[0] * S).toFixed(1)}" y="${(-p[1] * S).toFixed(1)}" font-size="${o.size || 9}" fill="#6b5f4f" font-family="'Segoe Print','Bradley Hand','Comic Sans MS',cursive" text-anchor="${o.anchor || 'middle'}">${text}</text>`); },
    parts,
  };
  return k;
}

function drawUnderlay(k, U, o = {}) {
  if (k.useSym) { k.parts.push(`<use href="#sb-front" transform="scale(${k.S.toFixed(4)})"/>`); return; }   // defined once per page (underlaySymbols)
  const S = k.S, p = k.parts, h = U.head, X = (q) => (q[0] * S).toFixed(1) + ',' + (-q[1] * S).toFixed(1);
  p.push(`<ellipse cx="0" cy="${(-h.cy * S).toFixed(1)}" rx="${(h.rx * S).toFixed(1)}" ry="${(h.ry * S).toFixed(1)}" fill="#efe9dc" stroke="#d8d0bf" stroke-width="1"/>`);
  // a few face marks for scale: brows, eyes, nose, ears
  for (const sx of [-1, 1]) {
    p.push(`<path d="M${X([sx * 16, -16])} Q${X([sx * 32, -10])} ${X([sx * 48, -17])}" fill="none" stroke="#d3cab8" stroke-width="1.4"/>`);
    p.push(`<ellipse cx="${(sx * 33 * S).toFixed(1)}" cy="${(38 * S).toFixed(1)}" rx="${(11 * S).toFixed(1)}" ry="${(5 * S).toFixed(1)}" fill="none" stroke="#d3cab8" stroke-width="1"/>`);
    p.push(`<ellipse cx="${(sx * (h.rx + 4) * S).toFixed(1)}" cy="${(52 * S).toFixed(1)}" rx="${(9 * S).toFixed(1)}" ry="${(28 * S).toFixed(1)}" fill="#efe9dc" stroke="#d8d0bf" stroke-width="1"/>`);
  }
  p.push(`<path d="M${X([-7, -80])} Q${X([0, -86])} ${X([7, -80])}" fill="none" stroke="#d3cab8" stroke-width="1"/>`);
  p.push(`<path d="M${X([-16, -108])} Q${X([0, -113])} ${X([16, -108])}" fill="none" stroke="#d3cab8" stroke-width="1"/>`);
  if (o.antlers !== false) for (const a of U.antlers) for (let i = 1; i < a.pts.length; i++) {
    p.push(`<line x1="${(a.pts[i - 1][0] * S).toFixed(1)}" y1="${(-a.pts[i - 1][1] * S).toFixed(1)}" x2="${(a.pts[i][0] * S).toFixed(1)}" y2="${(-a.pts[i][1] * S).toFixed(1)}" stroke="#d6cfc2" stroke-width="${(2 * a.rad[i] * S).toFixed(1)}" stroke-linecap="round"/>`);
  }
  if (U.tape && o.tape !== false) p.push(`<polyline points="${U.tape.map(X).join(' ')}" fill="none" stroke="#c9b27a" stroke-width="0.8" stroke-dasharray="3 3"/>`);
}

function drawUnderlaySide(k, U, o = {}) {
  if (k.useSym) { k.parts.push(`<use href="#sb-side" transform="scale(${k.S.toFixed(4)})"/>`); return; }
  const S = k.S, p = k.parts, h = U.headSide, X = (q) => (q[0] * S).toFixed(1) + ',' + (-q[1] * S).toFixed(1);
  p.push(`<ellipse cx="${(h.cx * S).toFixed(1)}" cy="${(-h.cy * S).toFixed(1)}" rx="${(h.rx * S).toFixed(1)}" ry="${(h.ry * S).toFixed(1)}" fill="#efe9dc" stroke="#d8d0bf" stroke-width="1"/>`);
  // brow, eye, nose and ear, lightly, for scale
  p.push(`<path d="M${X([-2, -16])} Q${X([6, -28])} ${X([4, -40])} L${X([16, -80])} L${X([2, -88])}" fill="none" stroke="#d3cab8" stroke-width="1.2"/>`);
  p.push(`<ellipse cx="${(-12 * S).toFixed(1)}" cy="${(38 * S).toFixed(1)}" rx="${(5 * S).toFixed(1)}" ry="${(4 * S).toFixed(1)}" fill="none" stroke="#d3cab8" stroke-width="1"/>`);
  p.push(`<ellipse cx="${((h.cx - 4) * S).toFixed(1)}" cy="${(52 * S).toFixed(1)}" rx="${(14 * S).toFixed(1)}" ry="${(28 * S).toFixed(1)}" fill="none" stroke="#d3cab8" stroke-width="1"/>`);
  if (o.antlers !== false) for (const a of U.antlersSide) for (let i = 1; i < a.pts.length; i++)
    p.push(`<line x1="${(a.pts[i - 1][0] * S).toFixed(1)}" y1="${(-a.pts[i - 1][1] * S).toFixed(1)}" x2="${(a.pts[i][0] * S).toFixed(1)}" y2="${(-a.pts[i][1] * S).toFixed(1)}" stroke="#d6cfc2" stroke-width="${(2 * a.rad[i] * S).toFixed(1)}" stroke-linecap="round"/>`);
  if (o.tape !== false) p.push(`<polyline points="${U.tapeSide.map(X).join(' ')}" fill="none" stroke="#c9b27a" stroke-width="0.8" stroke-dasharray="3 3"/>`);
}

// A built crown, rendered into the sketch's own frame (orthographic, lit), for comparing model and sketch.
function png(W, H, rgba) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; rgba.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const meshCache = new Map();
function modelImage(params, U, view, frame, o = {}) {
  const key = JSON.stringify(params) + (o.res || 0.8);
  if (!meshCache.has(key)) {
    const sk = Core.buildSkeleton(params), b = sk.branches.find((x) => x.antler && x.kind === 'beam' && x.pts[0][0] > 0).pts[0];
    if (o.crownOnly) { sk.branches = sk.branches.filter((x) => !x.antler); sk.burrs = []; sk.palms = []; }
    meshCache.set(key, { mesh: Core.meshAntler(sk, o.res || 0.8), head: sk.head, root: b });
  }
  const { mesh: m, head, root } = meshCache.get(key), pos = m.positions, idx = m.indices, px = o.px || 0.4;   // mm per pixel
  // aligned by the antler's root, where the sketches are anchored (a design's band can sit the whole piece higher or lower)
  const oz = root[2] - U.base[1], oy = root[1] - U.baseSide[0];
  // the head hides what's behind it: its near surface's depth along each pixel's ray
  const headDepth = (u, v) => {
    const hc = head.c, hr = head.r, q = view === 'side' ? [null, u + oy - hc[1], v + oz - hc[2]] : [u - hc[0], null, v + oz - hc[2]];
    const a = view === 'side' ? 1 - (q[1] / hr[1]) ** 2 - (q[2] / hr[2]) ** 2 : 1 - (q[0] / hr[0]) ** 2 - (q[2] / hr[2]) ** 2;
    if (a <= 0) return -Infinity;
    return view === 'side' ? hc[0] + hr[0] * Math.sqrt(a) : hc[1] + hr[1] * Math.sqrt(a);
  };
  const W = Math.ceil((frame[2] - frame[0]) / px), H = Math.ceil((frame[3] - frame[1]) / px);
  const zb = new Float32Array(W * H).fill(-Infinity), img = Buffer.alloc(W * H * 4);
  const proj = view === 'side' ? (i) => [pos[i + 1] - oy, pos[i + 2] - oz, pos[i]] : (i) => [pos[i], pos[i + 2] - oz, pos[i + 1]];
  const L = view === 'side' ? [0.55, 0.45, 0.7] : [-0.45, 0.5, 0.74];   // light from the viewer's upper left (u, v, toward camera)
  for (let t = 0; t < idx.length; t += 3) {
    const a = proj(3 * idx[t]), b = proj(3 * idx[t + 1]), c = proj(3 * idx[t + 2]);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const nl = Math.hypot(...n) || 1; n = n.map((v) => v / nl); if (view !== 'side') n = [n[0], n[1], n[2]]; else n = [-n[0], -n[1], -n[2]];
    const sh = Math.max(0, Math.abs(n[0] * L[0] + n[1] * L[1] + n[2] * L[2]));
    const P2 = (q) => [(q[0] - frame[0]) / px, (frame[3] - q[1]) / px, q[2]];
    const A = P2(a), Bq = P2(b), Cq = P2(c);
    const x0 = Math.max(0, Math.floor(Math.min(A[0], Bq[0], Cq[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(A[0], Bq[0], Cq[0])));
    const y0 = Math.max(0, Math.floor(Math.min(A[1], Bq[1], Cq[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(A[1], Bq[1], Cq[1])));
    const den = (Bq[1] - Cq[1]) * (A[0] - Cq[0]) + (Cq[0] - Bq[0]) * (A[1] - Cq[1]);
    if (Math.abs(den) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const w1 = ((Bq[1] - Cq[1]) * (x + 0.5 - Cq[0]) + (Cq[0] - Bq[0]) * (y + 0.5 - Cq[1])) / den, w2 = ((Cq[1] - A[1]) * (x + 0.5 - Cq[0]) + (A[0] - Cq[0]) * (y + 0.5 - Cq[1])) / den, w3 = 1 - w1 - w2;
      if (w1 < 0 || w2 < 0 || w3 < 0) continue;
      const z = w1 * A[2] + w2 * Bq[2] + w3 * Cq[2], j = y * W + x;
      if (z <= zb[j]) continue;
      if (o.occlude !== false && z < headDepth(frame[0] + (x + 0.5) * px, frame[3] - (y + 0.5) * px) - 0.5) continue;   // behind the head
      zb[j] = z; const g = 0.42 + 0.58 * sh;
      img[j * 4] = Math.round(203 * g); img[j * 4 + 1] = Math.round(198 * g); img[j * 4 + 2] = Math.round(184 * g); img[j * 4 + 3] = 255;
    }
  }
  return { uri: 'data:image/png;base64,' + png(W, H, img).toString('base64'), W, H };
}

// The underlays as SVG symbols in mm, for a page that shows many sketches: each sketch then references them.
function underlaySymbols(U) {
  const f = kit({ scale: 1 }); f.S = 1; drawUnderlay(f, U);
  const s = kit({ scale: 1 }); s.S = 1; drawUnderlaySide(s, U);
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><g id="sb-front">${f.parts.join('')}</g><g id="sb-side">${s.parts.join('')}</g></defs></svg>`;
}
function renderFigures(sheet, U, opt = {}) {
  const cols = sheet.cols || 4, cell = sheet.cell || 300, frame = sheet.frame || [-150, -70, 150, 170];   // mm: x0, y0, x1, y1
  const S = cell / (frame[2] - frame[0]), ch = (frame[3] - frame[1]) * S;
  const cells = sheet.sketches.map((sk, i) => {
    seed = 7 + i * 131;
    const fr = sk.frame || frame, Sx = cell / (fr[2] - fr[0]), chx = (fr[3] - fr[1]) * Sx;
    const k = kit({ scale: Sx, weight: sheet.weight || 1 }); k.S = Sx; k.useSym = !!opt.symbols;
    if (sk.underlay !== false) (sk.view === 'side' ? drawUnderlaySide : drawUnderlay)(k, U, sk.underlayOpts || {});
    k.under = (o) => (sk.view === 'side' ? drawUnderlaySide : drawUnderlay)(k, U, Object.assign({}, sk.underlayOpts, o));   // re-draw the head over what's behind it
    if (sk.model) {   // the built crown, in the same frame, under the sketch lines
      const im = modelImage(sk.model, U, sk.view, fr, sk.modelOpts || {});
      k.parts.push(`<image href="${im.uri}" x="${(fr[0] * Sx).toFixed(1)}" y="${(-fr[3] * Sx).toFixed(1)}" width="${cell}" height="${chx.toFixed(1)}" opacity="${sk.modelAlpha || 1}"/>`);
    }
    if (sk.draw) { if (sk.model) k.parts.push('<g opacity="0.55">'); sk.draw(k, U); if (sk.model) k.parts.push('</g>'); }
    const vb = `${(fr[0] * Sx).toFixed(0)} ${(-fr[3] * Sx).toFixed(0)} ${cell} ${chx.toFixed(0)}`;
    return { name: sk.name, idea: sk.idea || '', svg: `<svg viewBox="${vb}" width="${cell}" height="${chx.toFixed(0)}" role="img" aria-label="${sk.name.replace(/"/g, '')}">${k.parts.join('')}</svg>`, cell };
  });
  return cells;
}
function renderSheet(sheet, U) {
  const cols = sheet.cols || 4, cell = sheet.cell || 300;
  const cells = renderFigures(sheet, U).map((f) => `<figure>${f.svg}<figcaption><b>${f.name}</b>${f.idea ? ' — ' + f.idea : ''}</figcaption></figure>`);
  return `<!doctype html><meta charset="utf-8"><title>${sheet.title}</title><style>
body{margin:0;padding:18px;background:#f6f1e6;font:13px/1.35 Georgia,serif;color:#3a3226}
h1{font:400 20px Georgia,serif;margin:0 0 12px}
.grid{display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:10px}
figure{margin:0;background:#fbf8f0;border:1px solid #e3dac6;padding:4px}
figcaption{padding:4px 6px 6px;font-size:12px}
</style><h1>${sheet.title}</h1><div class="grid">${cells.join('')}</div>`;
}

if (require.main === module) {
  const [sheetFile, out] = process.argv.slice(2);
  const sheet = require(path.resolve(sheetFile));
  const U = underlay(sheet.preset);
  fs.writeFileSync(out, renderSheet(sheet, U));
  console.log('wrote', out, sheet.sketches.length, 'sketches');
}
module.exports = { underlay, renderSheet, renderFigures, underlaySymbols, spline, scrollPts, mirror, modelImage };
