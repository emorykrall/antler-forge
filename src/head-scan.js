/*
 * head-scan.js — turn a 3D head scan (STL, OBJ or PLY) into the compact head description the
 * crown engine fits to (see registerHeadScan in antler-core.js).
 *
 * Steps: parse → guess units and orientation (upright, face toward +Y) → find the tape line (the
 * widest cross-section below the top of the head) → cast rays from the head's centre to record its
 * radius in every direction. Runs in the browser (nothing is uploaded) and in Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HeadScan = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RING_SEAT = 0.38;   // must match antler-core.js: the tape line sits at this fraction of the head's height
  const NT = 240, NP = 121; // 1.5° directions: azimuth × polar angle

  /* ---------------------------------------------------------------- parsing */
  function parse(buf, name) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const ext = String(name || '').split('.').pop().toLowerCase();
    if (ext === 'stl') return parseSTL(u8);
    if (ext === 'obj') return parseOBJ(text(u8));
    if (ext === 'ply') return parsePLY(u8);
    throw new Error('Use an STL, OBJ or PLY file.');
  }
  const text = (u8) => (typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(u8) : Buffer.from(u8).toString('latin1'));
  function parseSTL(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const n = u8.byteLength >= 84 ? dv.getUint32(80, true) : 0;
    if (u8.byteLength === 84 + n * 50 && n > 0) {   // binary
      const pos = new Float32Array(n * 9);
      for (let f = 0; f < n; f++) for (let k = 0; k < 9; k++) pos[f * 9 + k] = dv.getFloat32(84 + f * 50 + 12 + k * 4, true);
      return { pos, tri: Uint32Array.from({ length: n * 3 }, (_, i) => i) };
    }
    const vs = [];
    for (const m of text(u8).matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) vs.push(+m[1], +m[2], +m[3]);
    if (!vs.length) throw new Error('That STL has no triangles.');
    return { pos: Float32Array.from(vs), tri: Uint32Array.from({ length: vs.length / 3 }, (_, i) => i) };
  }
  function parseOBJ(src) {
    const vs = [], ts = [];
    for (const line of src.split('\n')) {
      if (line.startsWith('v ')) { const p = line.trim().split(/\s+/); vs.push(+p[1], +p[2], +p[3]); }
      else if (line.startsWith('f ')) {
        const nv = vs.length / 3;
        const ids = line.trim().split(/\s+/).slice(1).map((w) => { const k = parseInt(w, 10); return k < 0 ? nv + k : k - 1; });
        for (let i = 1; i + 1 < ids.length; i++) ts.push(ids[0], ids[i], ids[i + 1]);   // fan
      }
    }
    if (!ts.length) throw new Error('That OBJ has no faces.');
    return { pos: Float32Array.from(vs), tri: Uint32Array.from(ts) };
  }
  function parsePLY(u8) {
    const head = text(u8.subarray(0, Math.min(u8.length, 4096)));
    const end = head.indexOf('end_header');
    if (!head.startsWith('ply') || end < 0) throw new Error('That PLY file has no header.');
    const lines = head.slice(0, end).split('\n').map((l) => l.trim());
    const fmt = (lines.find((l) => l.startsWith('format')) || '').split(/\s+/)[1];
    const elems = [];
    for (const l of lines) {
      const w = l.split(/\s+/);
      if (w[0] === 'element') elems.push({ name: w[1], n: +w[2], props: [] });
      else if (w[0] === 'property' && elems.length) elems[elems.length - 1].props.push(w[1] === 'list' ? { list: true, ct: w[2], it: w[3], name: w[4] } : { t: w[1], name: w[2] });
    }
    let off = u8.indexOf(10, head.indexOf('end_header')) + 1;   // after the header's newline
    const vs = [], ts = [];
    if (fmt === 'ascii') {
      const words = text(u8.subarray(off)).split(/\s+/).filter(Boolean).map(Number);
      let k = 0;
      for (const e of elems) for (let i = 0; i < e.n; i++) {
        const rec = {};
        for (const p of e.props) { if (p.list) { const c = words[k++]; rec[p.name] = words.slice(k, k + c); k += c; } else rec[p.name] = words[k++]; }
        if (e.name === 'vertex') vs.push(rec.x, rec.y, rec.z);
        else if (e.name === 'face') { const f = rec.vertex_indices || rec.vertex_index || []; for (let j = 1; j + 1 < f.length; j++) ts.push(f[0], f[j], f[j + 1]); }
      }
    } else {
      const le = fmt !== 'binary_big_endian', dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      const SZ = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
      const rd = (t) => {
        let v;
        switch (t) {
          case 'char': case 'int8': v = dv.getInt8(off); break;
          case 'uchar': case 'uint8': v = dv.getUint8(off); break;
          case 'short': case 'int16': v = dv.getInt16(off, le); break;
          case 'ushort': case 'uint16': v = dv.getUint16(off, le); break;
          case 'int': case 'int32': v = dv.getInt32(off, le); break;
          case 'uint': case 'uint32': v = dv.getUint32(off, le); break;
          case 'float': case 'float32': v = dv.getFloat32(off, le); break;
          default: v = dv.getFloat64(off, le);
        }
        off += SZ[t] || 8;
        return v;
      };
      for (const e of elems) for (let i = 0; i < e.n; i++) {
        const rec = {};
        for (const p of e.props) { if (p.list) { const c = rd(p.ct), a = []; for (let j = 0; j < c; j++) a.push(rd(p.it)); rec[p.name] = a; } else rec[p.name] = rd(p.t); }
        if (e.name === 'vertex') vs.push(rec.x, rec.y, rec.z);
        else if (e.name === 'face') { const f = rec.vertex_indices || rec.vertex_index || []; for (let j = 1; j + 1 < f.length; j++) ts.push(f[0], f[j], f[j + 1]); }
      }
    }
    if (!ts.length) throw new Error('That PLY has no faces (a point cloud can’t be used).');
    return { pos: Float32Array.from(vs), tri: Uint32Array.from(ts) };
  }

  /* ---------------------------------------------------------- orientation */
  // Rotations are 3×3 row-major; head frame: +Z up, +Y the front of the face, +X the wearer's right.
  const matMul = (a, b) => { const o = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]; return o; };
  const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
  const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
  const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
  const BASES = {   // file axes → head frame
    'y-up': [-1, 0, 0, 0, 0, 1, 0, 1, 0],   // OBJ/PLY/glTF habit: Y up, the face toward +Z
    'z-up': [1, 0, 0, 0, 1, 0, 0, 0, 1],    // STL habit: Z up
  };
  function transform(mesh, o) {   // o: { scale, base, yaw, pitch, roll, flip } → positions in the head frame, mm
    const deg = Math.PI / 180;
    let R = BASES[o.base] || BASES['z-up'];
    if (o.flip) R = matMul(rotX(Math.PI), R);
    R = matMul(rotZ((o.yaw || 0) * deg), matMul(rotX((o.pitch || 0) * deg), matMul(rotY((o.roll || 0) * deg), R)));
    const p = mesh.pos, out = new Float32Array(p.length), s = o.scale || 1;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i] * s, y = p[i + 1] * s, z = p[i + 2] * s;
      out[i] = R[0] * x + R[1] * y + R[2] * z; out[i + 1] = R[3] * x + R[4] * y + R[5] * z; out[i + 2] = R[6] * x + R[7] * y + R[8] * z;
    }
    return out;
  }
  function extent(p) {
    const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let j = 0; j < 3; j++) { bb[j] = Math.min(bb[j], p[i + j]); bb[j + 3] = Math.max(bb[j + 3], p[i + j]); }
    return bb;
  }
  // Units: the one that makes the object head-sized (a head alone is ~250 mm, with shoulders ~500).
  function guessScale(mesh) {
    const bb = extent(mesh.pos), e = Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]);
    let best = 1, err = Infinity;
    for (const s of [1, 10, 25.4, 1000]) { const d = Math.abs(Math.log((e * s) / 300)); if (e * s > 150 && e * s < 800 && d < err) { err = d; best = s; } }
    return best;
  }
  // The face points where, at nose height, one bump stands out with nothing opposite it (ears pair up).
  function findFront(p) {
    const top = percentileZ(p, 0.999), bins = 72, rho = new Float32Array(bins);
    let cx = 0, cy = 0, n = 0;
    for (let i = 0; i < p.length; i += 3) if (p[i + 2] < top - 115 && p[i + 2] > top - 175) { cx += p[i]; cy += p[i + 1]; n++; }
    if (n < 30) return null;
    cx /= n; cy /= n;
    for (let i = 0; i < p.length; i += 3) {
      if (!(p[i + 2] < top - 115 && p[i + 2] > top - 175)) continue;
      const a = Math.atan2(p[i + 1] - cy, p[i] - cx), b = Math.floor(((a + Math.PI) / (2 * Math.PI)) * bins) % bins;
      rho[b] = Math.max(rho[b], Math.hypot(p[i] - cx, p[i + 1] - cy));
    }
    const prom = (b) => {   // how far this direction stands out from its surroundings
      const around = [];
      for (let k = 5; k <= 14; k++) around.push(rho[(b + k) % bins], rho[(b - k + bins) % bins]);
      around.sort((x, y) => x - y);
      return rho[b] - around[around.length >> 1];
    };
    let best = null, score = -Infinity;
    for (let b = 0; b < bins; b++) { if (!rho[b]) continue; const sc = prom(b) - Math.max(0, prom((b + bins / 2) % bins)); if (sc > score) { score = sc; best = b; } }
    if (best == null || score < 4) return null;   // no clear nose
    return -Math.PI + ((best + 0.5) * 2 * Math.PI) / bins;   // azimuth of the face
  }
  function percentileZ(p, q) {
    const z = []; for (let i = 2; i < p.length; i += 3) z.push(p[i]);
    z.sort((a, b) => a - b); return z[Math.min(z.length - 1, Math.floor(q * z.length))];
  }
  // A first guess: units, which way is up (by file type), and yaw so the face looks toward +Y.
  function guessOrientation(mesh, name) {
    const ext = String(name || '').split('.').pop().toLowerCase();
    const o = { scale: guessScale(mesh), base: ext === 'stl' ? 'z-up' : 'y-up', yaw: 0, pitch: 0, roll: 0, flip: false };
    const a = findFront(transform(mesh, o));
    if (a != null) o.yaw = Math.round(((Math.PI / 2 - a) * 180) / Math.PI);   // turn the face to +Y
    o.faceFound = a != null;
    return o;
  }

  /* ---------------------------------------------------------- measuring */
  function hull2(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  const perim = (h) => h.reduce((s, q, i) => s + Math.hypot(q[0] - h[(i + 1) % h.length][0], q[1] - h[(i + 1) % h.length][1]), 0);
  function slice(p, z, half) { const out = []; for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i + 2] - z) <= half) out.push([p[i], p[i + 1]]); return out; }

  // Everything the engine needs, from a transformed mesh (positions in mm, head frame).
  function measure(mesh, pos) {
    const top = percentileZ(pos, 0.999);
    let best = null;
    for (let d = 40; d <= 105; d += 2) {   // the tape line: the widest cross-section below the top
      const s = slice(pos, top - d, 1.5);
      if (s.length < 12) continue;
      const h = hull2(s), c = perim(h);
      if (!best || c > best.circ) best = { d, hull: h, circ: c };
    }
    if (!best) throw new Error('Couldn’t find the head in that scan. Check it’s upright.');
    const xs = best.hull.map((q) => q[0]), ys = best.hull.map((q) => q[1]);
    const hw = (Math.max(...xs) - Math.min(...xs)) / 2, hl = (Math.max(...ys) - Math.min(...ys)) / 2;
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const s = RING_SEAT, cs = Math.sqrt(1 - s * s), zt = top - best.d;
    const fit = [hw / cs, hl / cs, best.d / (1 - s)];            // the matching ellipsoid (tape-model conventions)
    const c = [cx, cy, zt - s * fit[2]];                          // head-frame origin: the ellipsoid's centre
    return { top, tapeZ: zt, c, fit, seat: [hw, hl], dome: best.d, circ: best.circ };
  }

  // The head's radius from c in every direction: the outermost surface each ray meets.
  function radialMap(mesh, pos, c, fit) {
    const tri = mesh.tri, nTri = tri.length / 3, cells = Array.from({ length: NT * NP }, () => []);
    const dirOf = (i) => {
      const x = pos[i * 3] - c[0], y = pos[i * 3 + 1] - c[1], z = pos[i * 3 + 2] - c[2], l = Math.hypot(x, y, z) || 1e-9;
      return [((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * NT, (Math.acos(Math.max(-1, Math.min(1, z / l))) / Math.PI) * (NP - 1)];
    };
    for (let f = 0; f < nTri; f++) {   // bin triangles by the directions they cover
      const d = [dirOf(tri[f * 3]), dirOf(tri[f * 3 + 1]), dirOf(tri[f * 3 + 2])];
      let ts = d.map((q) => q[0]);
      if (Math.max(...ts) - Math.min(...ts) > NT / 2) ts = ts.map((t) => (t < NT / 2 ? t + NT : t));   // straddles the seam
      let t0 = Math.floor(Math.min(...ts)) - 1, t1 = Math.ceil(Math.max(...ts)) + 1;
      const p0 = Math.max(0, Math.floor(Math.min(d[0][1], d[1][1], d[2][1])) - 1), p1 = Math.min(NP - 1, Math.ceil(Math.max(d[0][1], d[1][1], d[2][1])) + 1);
      if (p0 === 0 || p1 === NP - 1) { t0 = 0; t1 = NT - 1; }   // touches a pole: every azimuth
      for (let j = p0; j <= p1; j++) for (let ii = t0; ii <= t1; ii++) cells[j * NT + (((ii % NT) + NT) % NT)].push(f);
    }
    const r = new Float32Array(NT * NP), eps = 1e-9;
    for (let j = 0; j < NP; j++) {
      const ph = (Math.PI * j) / (NP - 1);
      for (let i = 0; i < NT; i++) {
        const th = -Math.PI + (2 * Math.PI * i) / NT, u = [Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)];
        let far = -1;
        for (const f of cells[j * NT + i]) {   // Möller–Trumbore, keep the farthest hit
          const a = tri[f * 3] * 3, b = tri[f * 3 + 1] * 3, cc = tri[f * 3 + 2] * 3;
          const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], e2 = [pos[cc] - pos[a], pos[cc + 1] - pos[a + 1], pos[cc + 2] - pos[a + 2]];
          const pv = [u[1] * e2[2] - u[2] * e2[1], u[2] * e2[0] - u[0] * e2[2], u[0] * e2[1] - u[1] * e2[0]];
          const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
          if (Math.abs(det) < eps) continue;
          const inv = 1 / det, tv = [c[0] - pos[a], c[1] - pos[a + 1], c[2] - pos[a + 2]];
          const uu = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) * inv; if (uu < 0 || uu > 1) continue;
          const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
          const vv = (u[0] * qv[0] + u[1] * qv[1] + u[2] * qv[2]) * inv; if (vv < 0 || uu + vv > 1) continue;
          const t = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) * inv;
          if (t > far) far = t;
        }
        r[j * NT + i] = far > 0 ? far : NaN;
      }
    }
    // Holes (an open neck, a scan that stops at the chin): carry the nearest radius above down the
    // same azimuth, so the surface continues smoothly; with nothing above, the ellipsoid stands in.
    for (let i = 0; i < NT; i++) {
      let last = NaN;
      for (let j = 0; j < NP; j++) {
        const k = j * NT + i;
        if (Number.isNaN(r[k])) {
          if (Number.isNaN(last)) { const ph = (Math.PI * j) / (NP - 1), th = -Math.PI + (2 * Math.PI * i) / NT; r[k] = 1 / Math.hypot((Math.sin(ph) * Math.cos(th)) / fit[0], (Math.sin(ph) * Math.sin(th)) / fit[1], Math.cos(ph) / fit[2]); }
          else r[k] = last;
        } else last = r[k];
      }
    }
    const sm = new Float32Array(r.length);   // a light smoothing pass takes out scan noise
    for (let j = 0; j < NP; j++) for (let i = 0; i < NT; i++) {
      let s = 0, w = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const jj = Math.max(0, Math.min(NP - 1, j + dj)), ii = (i + di + NT) % NT, k = dj || di ? 1 : 4;
        s += r[jj * NT + ii] * k; w += k;
      }
      sm[j * NT + i] = s / w;
    }
    return sm;
  }

  // The whole pipeline, for a mesh and an orientation (from guessOrientation, or adjusted by hand).
  function build(mesh, o) {
    const pos0 = transform(mesh, o), m = measure(mesh, pos0);
    const pos = new Float32Array(pos0.length);   // centre on the head frame's origin
    for (let i = 0; i < pos0.length; i += 3) { pos[i] = pos0[i] - m.c[0]; pos[i + 1] = pos0[i + 1] - m.c[1]; pos[i + 2] = pos0[i + 2] - m.c[2]; }
    const r = radialMap(mesh, pos, [0, 0, 0], m.fit);
    return { v: 1, nt: NT, np: NP, r, fit: m.fit, seat: m.seat, dome: m.dome, circ: m.circ, orient: o, c: Array.from(m.c) };   // c: where the source mesh's origin went
  }

  // Compact storage: the radius map as base64 Float32.
  function pack(scan) {
    const b = new Uint8Array(scan.r.buffer.slice(0));
    let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    const b64 = typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(b).toString('base64');
    return Object.assign({}, scan, { r: b64 });
  }
  function unpack(obj) {
    if (typeof obj.r !== 'string') return obj;
    const bin = typeof atob !== 'undefined' ? atob(obj.r) : Buffer.from(obj.r, 'base64').toString('latin1');
    const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return Object.assign({}, obj, { r: new Float32Array(u.buffer) });
  }

  /* ------------------------------------------------ head-turn reconstruction */
  // Frames from the built-in head-turn scan. Each gives the head frame's axes in image space (side,
  // fwd, up: image x right, y up, z toward the camera), where the head frame's origin projects
  // (o, px), the scale (s, px per mm) and the person's outline cropped round the head
  // (mask: { x0, y0, k, w, h, data }, cell (ix, iy) centred at x0 + (ix+½)k, y0 + (iy+½)k, y up).
  // A smooth head shape is fitted to every outline above Z_CUT (so the neck, face and shoulders
  // don't count) and to skin points from the face tracker, then meshed and measured exactly like an
  // imported scan. Hair: the camera can't see through it, so the outline is modelled as the skull
  // plus a hair layer of fitted thickness everywhere except the face. The face's skin points
  // (forehead and temples) lie on the skull itself, which is what separates skull from hair.
  const Z_CUT = 5;   // mm above the head frame's origin (which sits a little above ear level)
  // model: [half-width, half-length front, half-length back, height, centre y, centre z, boxiness n]
  // model: … plus hair thickness (mm) over everything but the face
  const LO = [55, 60, 60, 60, -40, -40, 1.6, 0], HI = [110, 130, 140, 140, 40, 40, 3.2, 60];
  const SKIN_W = 0.004;   // skin points' weight against the outlines' mismatch (Huber beyond 3 mm)
  const DEG = 180 / Math.PI;
  function faceArea(skin) {   // the face, as seen from the head frame's origin: skin, not hair
    if (!skin.length) return null;
    let az = 0, el = -90;
    for (const v of skin) { const len = Math.hypot(v[0], v[1], v[2]) || 1; az = Math.max(az, Math.abs(Math.atan2(v[0], v[1])) * DEG); el = Math.max(el, Math.asin(v[2] / len) * DEG); }
    return { az: az + 4, el: el + 4 };
  }
  function hairCover(face, q) {   // 0 on the face, rising to 1 past its sides or above its top
    if (!face) return 1;
    const len = Math.hypot(q[0], q[1], q[2]) || 1, az = Math.abs(Math.atan2(q[0], q[1])) * DEG, el = Math.asin(q[2] / len) * DEG;
    return Math.min(1, Math.max(0, (az - face.az) / 10, (el - face.el) / 8));
  }
  function modelR(p, ux, uy, uz) {
    const ry = uy > 0 ? p[1] : p[2], n = p[6];
    return 1 / Math.pow(Math.pow(Math.abs(ux) / p[0], n) + Math.pow(Math.abs(uy) / ry, n) + Math.pow(Math.abs(uz) / p[3], n), 1 / n);
  }
  const DIRS = (() => { const o = [[0, 0, 1]]; for (let j = 1; j < 24; j++) { const ph = (Math.PI * j) / 24; for (let i = 0; i < 48; i++) { const th = (2 * Math.PI * i) / 48; o.push([Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)]); } } return o; })();
  function modelPoints(p, face) {   // the outline's surface: skull, plus hair where there is hair
    const pts = [], t = p[7] || 0;
    for (const u of DIRS) {
      const r = modelR(p, u[0], u[1], u[2]), q = [u[0] * r, u[1] * r + p[4], u[2] * r + p[5]];
      if (q[2] <= Z_CUT - 30) continue;
      const h = t * hairCover(face, q);
      pts.push([q[0] + u[0] * h, q[1] + u[1] * h, q[2] + u[2] * h]);
    }
    return pts;
  }
  function prepFrame(f) {
    const m = f.mask, U0 = f.up[0], U1 = f.up[1], lim = Z_CUT * f.s * (U0 * U0 + U1 * U1);
    const clip = new Uint8Array(m.w * m.h), obs = new Uint8Array(m.w * m.h);
    let area = 0;
    for (let iy = 0; iy < m.h; iy++) for (let ix = 0; ix < m.w; ix++) {
      const i = iy * m.w + ix, x = m.x0 + (ix + 0.5) * m.k - f.o[0], y = m.y0 + (iy + 0.5) * m.k - f.o[1];
      if (x * U0 + y * U1 > lim) { clip[i] = 1; obs[i] = m.data[i] ? 1 : 0; area += obs[i]; }   // above the cut
    }
    return { f, clip, obs, area };
  }
  function frameLoss(pf, pts) {   // mismatched cells between the model's outline and the observed one, above the cut
    const f = pf.f, m = f.mask;
    const hull = hull2(pts.map((q) => [
      (f.o[0] + f.s * (f.side[0] * q[0] + f.fwd[0] * q[1] + f.up[0] * q[2]) - m.x0) / m.k - 0.5,
      (f.o[1] + f.s * (f.side[1] * q[0] + f.fwd[1] * q[1] + f.up[1] * q[2]) - m.y0) / m.k - 0.5]));
    let diff = 0;
    for (let iy = 0; iy < m.h; iy++) {
      let xl = Infinity, xr = -Infinity;
      for (let e = 0; e < hull.length; e++) {
        const a = hull[e], b = hull[(e + 1) % hull.length];
        if ((a[1] <= iy && b[1] > iy) || (b[1] <= iy && a[1] > iy)) { const x = a[0] + ((iy - a[1]) * (b[0] - a[0])) / (b[1] - a[1]); if (x < xl) xl = x; if (x > xr) xr = x; }
      }
      const row = iy * m.w;
      for (let ix = 0; ix < m.w; ix++) { const i = row + ix; if (pf.clip[i] && (ix >= xl && ix <= xr ? 1 : 0) !== pf.obs[i]) diff++; }
    }
    return diff / Math.max(1, pf.area);
  }
  function nelderMead(fn, x0, step, iters) {
    const n = x0.length, pts = [x0.slice()];
    for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += step[i]; pts.push(x); }
    let vals = pts.map(fn);
    for (let it = 0; it < iters; it++) {
      const ord = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
      const P = ord.map((i) => pts[i]), V = ord.map((i) => vals[i]);
      const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += P[i][j] / n;
      const at = (t) => c.map((cj, j) => cj + t * (P[n][j] - cj));
      const xr = at(-1), fr = fn(xr);
      if (fr < V[0]) { const xe = at(-2), fe = fn(xe); if (fe < fr) { P[n] = xe; V[n] = fe; } else { P[n] = xr; V[n] = fr; } }
      else if (fr < V[n - 1]) { P[n] = xr; V[n] = fr; }
      else { const xc = at(0.5), fc = fn(xc); if (fc < V[n]) { P[n] = xc; V[n] = fc; } else for (let i = 1; i <= n; i++) { P[i] = P[i].map((x, j) => P[0][j] + 0.5 * (x - P[0][j])); V[i] = fn(P[i]); } }
      pts.splice(0, pts.length, ...P); vals = V;
    }
    const b = vals.indexOf(Math.min(...vals));
    return { x: pts[b], v: vals[b] };
  }
  function modelMesh(p) {   // the fitted head as a closed mesh, for build() to measure like any scan
    const nu = 96, nv = 64, pos = [], tri = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i < nu; i++) {
      const ph = (Math.PI * j) / nv, th = (2 * Math.PI * i) / nu, u = [Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)], r = modelR(p, u[0], u[1], u[2]);
      pos.push(u[0] * r, u[1] * r + p[4], u[2] * r + p[5]);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * nu + i, b = j * nu + ((i + 1) % nu), c = a + nu, d = b + nu; tri.push(a, c, b, b, c, d); }
    return { pos: Float32Array.from(pos), tri: Uint32Array.from(tri) };
  }
  // frames: see above; skin: points on the forehead and temple skin in the head frame (mm).
  function fromHeadTurn(frames, skin) {
    const pfs = frames.filter((f) => f.mask && f.mask.w).map(prepFrame).filter((pf) => pf.area > 20);
    if (pfs.length < 6) throw new Error('Not enough of the head turn was seen. Try again, turning slowly.');
    const fh = (skin || []).filter((v) => v[2] > -20), face = faceArea(fh);   // skin down to about ear level
    const loss = (p) => {
      let pen = 0; const q = p.map((x, i) => { const c = Math.min(HI[i], Math.max(LO[i], x)); pen += (x - c) ** 2; return c; });
      if (!face) q[7] = 0;   // without skin points, hair can't be told from head
      let L = 0; const pts = modelPoints(q, face);
      for (const pf of pfs) L += frameLoss(pf, pts);
      L /= pfs.length;
      for (const v of fh) {   // skin lies on the skull; robust, since tracked points can sit a few mm off
        const d = [v[0], v[1] - q[4], v[2] - q[5]], len = Math.hypot(d[0], d[1], d[2]) || 1, e = len - modelR(q, d[0] / len, d[1] / len, d[2] / len);
        const a = Math.abs(e), rho = a < 3 ? a * a : 6 * a - 9;
        L += (SKIN_W * rho) / fh.length;
      }
      return L + pen;
    };
    let best = null;
    for (const start of [[78, 98, 105, 95, -8, 0, 2.2, 4], [72, 92, 100, 88, -4, -6, 2.6, 15]]) {   // two starts, keep the better
      const r = nelderMead(loss, start, [6, 8, 8, 8, 6, 6, 0.3, 6], 320);
      if (!best || r.v < best.v) best = r;
    }
    for (const k of [0.5, 0.2]) {   // restart from the best with a smaller simplex: Nelder-Mead stalls early on this loss
      const r = nelderMead(loss, best.x, [6, 8, 8, 8, 6, 6, 0.3, 6].map((v) => v * k), 200);
      if (r.v < best.v) best = r;
    }
    const p = best.x.map((x, i) => Math.min(HI[i], Math.max(LO[i], x)));
    if (!face) p[7] = 0;
    const mm = modelMesh(p), scan = build(mm, { scale: 1, base: 'z-up', yaw: 0, pitch: 0, roll: 0, flip: false });
    Object.defineProperty(scan, 'mesh', { value: mm });   // the fitted surface, for tests (not stored)
    return Object.assign(scan, { source: 'head-turn', frames: pfs.length, mismatch: best.v, model: p.slice(0, 7), hair: Math.round(p[7] * 10) / 10 });
  }

  /* ------------------------------------------------ FLAME head model */
  // FLAME 2023 Open (Max Planck Institute for Intelligent Systems, CC BY 4.0; see NOTICE), trimmed by
  // tools/convert-flame.py to its template and first K identity components, in mm, x side, y forward,
  // z up. A head is template + Σ beta[k] · component[k], beta in standard deviations.
  function flameModel(buf) {
    const b = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const h = new Uint32Array(b, 0, 4);
    if (h[0] !== 0x314d4c46) throw new Error('Not a head model file.');   // 'FLM1'
    const V = h[1], F = h[2], K = h[3];
    let o = 16;
    const scales = new Float32Array(b, o, K); o += 4 * K;
    const tpl = new Float32Array(b, o, 3 * V); o += 12 * V;
    const tri = new Uint16Array(b, o, 3 * F); o += 6 * F; o += o % 4;
    const dirs = new Int16Array(b, o, K * 3 * V);
    return { V, F, K, scales, tpl, tri, dirs };
  }
  function flameShape(m, beta, out) {   // vertex positions (mm) for shape coefficients beta
    const n = 3 * m.V, pos = out || new Float32Array(n);
    pos.set(m.tpl);
    for (let k = 0; k < Math.min(m.K, beta.length); k++) {
      const w = beta[k] * m.scales[k];
      if (!w) continue;
      const d = m.dirs, o = k * n;
      for (let i = 0; i < n; i++) pos[i] += w * d[o + i];
    }
    return pos;
  }

  // Fitting FLAME to a head turn: the same outlines, skin points and hair layer as fromHeadTurn, but the
  // head is FLAME's statistical head (shape coefficients beta, in standard deviations, with FLAME's own
  // unit-Gaussian prior), so the unseen back and the skull under the hair follow real head shapes.
  // Iterated closest points: pair the model's outline with the observed one in every view (both ways)
  // and each skin point with the nearest face vertex, then solve the linear least-squares problem for
  // beta, translation T, hair thickness at the sides and on top (all linear once the pairs are fixed) and
  // a pitch step (linearised), since FLAME's "up" can differ from the face tracker's. Pitch is solved
  // smoothly rather than picked from a grid: a grid let one stray skin point flip the result.
  const FL_MAIN = 3931;                 // FLAME's head vertices; the eyeballs follow
  const FL_SIDE = [730, 2212];          // FLAME vertices at MediaPipe 234 / 454 (face sides, cheekbone level)
  function hullIdx(xs, ys, idx) {       // convex hull (monotone chain) of the given points, counter-clockwise
    const o = idx.slice().sort((a, b) => xs[a] - xs[b] || ys[a] - ys[b]);
    const cr = (a, b, c) => (xs[b] - xs[a]) * (ys[c] - ys[a]) - (ys[b] - ys[a]) * (xs[c] - xs[a]);
    const lo = [], hi = [];
    for (const i of o) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], i) <= 0) lo.pop(); lo.push(i); }
    for (let k = o.length - 1; k >= 0; k--) { const i = o[k]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], i) <= 0) hi.pop(); hi.push(i); }
    lo.pop(); hi.pop();
    return lo.concat(hi);
  }
  function outlineOf(pf) {   // the observed outline above the cut: points (px) and outward normals
    const f = pf.f, m = f.mask, w = m.w, h = m.h, obs = pf.obs, clip = pf.clip, pts = [];
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : obs[y * w + x]);
    const cl = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 1 : clip[y * w + x]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!at(x + dx, y + dy) && cl(x + dx, y + dy)) edge = true;   // not the cut itself
      if (!edge) continue;
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const n = Math.hypot(gx, gy);
      if (!n) continue;
      const nx = -gx / n, ny = -gy / n;   // the true edge is about half a cell out from this edge cell's centre
      pts.push({ x: m.x0 + (x + 0.5 + 0.5 * nx) * m.k, y: m.y0 + (y + 0.5 + 0.5 * ny) * m.k, nx, ny });
    }
    return pts;
  }
  function solveSym(A, b, n) {   // Gaussian elimination with partial pivoting (A is n×n, row-major; both copied)
    const M = A.slice(), x = b.slice();
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r * n + c]) > Math.abs(M[p * n + c])) p = r;
      if (p !== c) { for (let k = 0; k < n; k++) { const t = M[c * n + k]; M[c * n + k] = M[p * n + k]; M[p * n + k] = t; } const t = x[c]; x[c] = x[p]; x[p] = t; }
      const d = M[c * n + c] || 1e-12;
      for (let r = c + 1; r < n; r++) { const f = M[r * n + c] / d; if (!f) continue; for (let k = c; k < n; k++) M[r * n + k] -= f * M[c * n + k]; x[r] -= f * x[c]; }
    }
    for (let c = n - 1; c >= 0; c--) { let s = x[c]; for (let k = c + 1; k < n; k++) s -= M[c * n + k] * x[k]; x[c] = s / (M[c * n + c] || 1e-12); }
    return x;
  }
  // K shape components; outline and skin-point noise (mm); outline pairs per view that count as independent;
  // how far pitch may stray from level (°); iterations. Tuned on synthetic FLAME heads with hair and noise.
  const FL_OPT = { K: 30, sigSil: 2, sigSkin: 1.5, nRef: 40, sigPitch: 8, iters: 22 };
  function fromHeadTurnFlame(frames, skin, model, opt) {
    const O = Object.assign({}, FL_OPT, opt || {}), K = Math.min(O.K, model.K), N = K + 6, iT = K, iH = K + 3, iH2 = K + 4, iP = K + 5;   // hair: at the sides (iH) and on top (iH2); iP: pitch step
    const pfs = frames.filter((f) => f.mask && f.mask.w).map(prepFrame).filter((pf) => pf.area > 20);
    if (pfs.length < 6) throw new Error('Not enough of the head turn was seen. Try again, turning slowly.');
    const views = pfs.map((pf) => { const f = pf.f; return { f, lim: Z_CUT * f.s * (f.up[0] ** 2 + f.up[1] ** 2), outline: outlineOf(pf), A: [f.side[0], f.fwd[0], f.up[0], f.side[1], f.fwd[1], f.up[1]] }; });
    const fh = (skin || []).filter((v) => v[2] > -20), face = faceArea(fh);
    const V = FL_MAIN, n3 = 3 * model.V, dirs = model.dirs, sc = model.scales;
    const tris = []; for (let f = 0; f < model.F; f++) { const a = model.tri[3 * f], b = model.tri[3 * f + 1], c = model.tri[3 * f + 2]; if (a < V && b < V && c < V) tris.push(a, b, c); }
    const base = flameShape(model, []);
    const side0 = [0, 1, 2].map((a) => (base[3 * FL_SIDE[0] + a] + base[3 * FL_SIDE[1] + a]) / 2);
    const T0 = [-side0[0], -side0[1] + 28, -side0[2] - 22];   // the page's head-frame origin sits 28 mm behind and 22 mm above the face sides
    function run(pitch, x, iters) {
      let cp, sp;
      const rot = (v) => [v[0], v[1] * cp - v[2] * sp, v[1] * sp + v[2] * cp];
      const S0 = new Float64Array(3 * V);   // the unrotated shape, for the pitch derivative
      const P = new Float64Array(3 * V), Nv = new Float64Array(3 * V), Wh = new Float64Array(V), Up = new Float64Array(V), D = new Float64Array(3 * V);
      let obj = Infinity;
      for (let it = 0; it < iters; it++) {
        cp = Math.cos((pitch * Math.PI) / 180); sp = Math.sin((pitch * Math.PI) / 180); x[iP] = 0;
        const shp = flameShape(model, x.slice(0, K));
        for (let i = 0; i < V; i++) { S0[3 * i] = shp[3 * i]; S0[3 * i + 1] = shp[3 * i + 1]; S0[3 * i + 2] = shp[3 * i + 2]; const r = rot([shp[3 * i], shp[3 * i + 1], shp[3 * i + 2]]); for (let a = 0; a < 3; a++) P[3 * i + a] = r[a] + x[iT + a]; }
        Nv.fill(0);
        for (let k = 0; k < tris.length; k += 3) {
          const a = 3 * tris[k], b = 3 * tris[k + 1], c = 3 * tris[k + 2];
          const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], w = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
          const nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
          for (const q of [a, b, c]) for (let e = 0; e < 3; e++) Nv[q + e] += nn[e];
        }
        const t = face ? Math.max(0, x[iH]) : 0, tt = face ? Math.max(0, x[iH2]) : 0;
        for (let i = 0; i < V; i++) {
          const l = Math.hypot(Nv[3 * i], Nv[3 * i + 1], Nv[3 * i + 2]) || 1;
          for (let e = 0; e < 3; e++) Nv[3 * i + e] /= l;
          Wh[i] = face ? hairCover(face, [P[3 * i], P[3 * i + 1], P[3 * i + 2]]) : 1;
          Up[i] = Math.max(0, P[3 * i + 2] / (Math.hypot(P[3 * i], P[3 * i + 1], P[3 * i + 2]) || 1));   // 0 at the sides, 1 at the top
          const h = Wh[i] * (t * (1 - Up[i]) + tt * Up[i]);
          for (let e = 0; e < 3; e++) D[3 * i + e] = P[3 * i + e] + h * Nv[3 * i + e];
        }
        const JtJ = new Float64Array(N * N), Jtr = new Float64Array(N);
        let E = 0;
        const row = (terms, g, c0, wgt, robust) => {   // residual g·(Σ c_i D_i) + c0, as a linear function of x
          const J = new Float64Array(N);
          const gr = [g[0], g[1] * cp + g[2] * sp, -g[1] * sp + g[2] * cp];   // Rᵀg, for the rotated shape components
          let val = c0;
          for (const [i, ci] of terms) {
            for (let k = 0; k < K; k++) { const o = k * n3 + 3 * i; J[k] += ci * sc[k] * (gr[0] * dirs[o] + gr[1] * dirs[o + 1] + gr[2] * dirs[o + 2]); }
            for (let e = 0; e < 3; e++) J[iT + e] += ci * g[e];
            const y0 = S0[3 * i + 1], z0 = S0[3 * i + 2];   // d(rotated shape)/d(pitch), per radian
            J[iP] += ci * (g[1] * (-y0 * sp - z0 * cp) + g[2] * (y0 * cp - z0 * sp));
            if (face) { const gn = ci * Wh[i] * (g[0] * Nv[3 * i] + g[1] * Nv[3 * i + 1] + g[2] * Nv[3 * i + 2]); J[iH] += gn * (1 - Up[i]); J[iH2] += gn * Up[i]; }
            val += ci * (g[0] * D[3 * i] + g[1] * D[3 * i + 1] + g[2] * D[3 * i + 2]);
          }
          if (robust) {   // outline pairs: Huber beyond 2σ; pairs over 30 mm apart are a ragged mask or background
            const a = Math.abs(val);
            if (a > 30) return;
            if (a > 2 * O.sigSil) wgt *= (2 * O.sigSil) / a;
          }
          // constant part so that J·x + c = current residual
          let jx = 0; for (let k = 0; k < N; k++) jx += J[k] * x[k];
          const c = val - jx;
          E += wgt * val * val;
          for (let a = 0; a < N; a++) { if (!J[a]) continue; Jtr[a] += wgt * J[a] * c; for (let b = 0; b < N; b++) JtJ[a * N + b] += wgt * J[a] * J[b]; }
        };
        for (const vw of views) {
          const f = vw.f, A = vw.A, U0 = f.up[0], U1 = f.up[1];
          const idx = [], X = new Float64Array(V), Y = new Float64Array(V);
          for (let i = 0; i < V; i++) {
            if (D[3 * i + 2] < Z_CUT - 40) continue;
            X[i] = f.o[0] + f.s * (A[0] * D[3 * i] + A[1] * D[3 * i + 1] + A[2] * D[3 * i + 2]);
            Y[i] = f.o[1] + f.s * (A[3] * D[3 * i] + A[4] * D[3 * i + 1] + A[5] * D[3 * i + 2]);
            idx.push(i);
          }
          const hull = hullIdx(X, Y, idx), above = (x0, y0) => (x0 - f.o[0]) * U0 + (y0 - f.o[1]) * U1 > vw.lim + f.mask.k;
          const out = vw.outline, pairs = [];
          for (const i of hull) {   // model outline → nearest observed outline point
            if (!above(X[i], Y[i])) continue;
            let bd = Infinity, bq = null; for (const q of out) { const d = (q.x - X[i]) ** 2 + (q.y - Y[i]) ** 2; if (d < bd) { bd = d; bq = q; } }
            if (bq) pairs.push([[[i, 1]], bq]);
          }
          for (const q of out) {   // observed outline → nearest point on the model's outline
            let bd = Infinity, bt = null;
            for (let e = 0; e < hull.length; e++) {
              const i = hull[e], j = hull[(e + 1) % hull.length], ex = X[j] - X[i], ey = Y[j] - Y[i], L = ex * ex + ey * ey || 1e-9;
              const a = Math.max(0, Math.min(1, ((q.x - X[i]) * ex + (q.y - Y[i]) * ey) / L)), d = (X[i] + a * ex - q.x) ** 2 + (Y[i] + a * ey - q.y) ** 2;
              if (d < bd) { bd = d; bt = [[i, 1 - a], [j, a]]; }
            }
            if (bt) pairs.push([bt, q]);
          }
          const wgt = Math.min(1, O.nRef / Math.max(1, pairs.length)) / (O.sigSil * O.sigSil);
          for (const [terms, q] of pairs) {   // along the observed normal, in mm
            const g = [q.nx * A[0] + q.ny * A[3], q.nx * A[1] + q.ny * A[4], q.nx * A[2] + q.ny * A[5]];
            row(terms, g, (q.nx * (f.o[0] - q.x) + q.ny * (f.o[1] - q.y)) / f.s, wgt, true);
          }
        }
        for (const s of fh) {   // skin lies on the surface: nearest face vertex, along its normal (robust)
          let bd = Infinity, bi = -1;
          for (let i = 0; i < V; i++) { if (Wh[i] > 0.5) continue; const d = (P[3 * i] - s[0]) ** 2 + (P[3 * i + 1] - s[1]) ** 2 + (P[3 * i + 2] - s[2]) ** 2; if (d < bd) { bd = d; bi = i; } }
          if (bi < 0) continue;
          const n = [Nv[3 * bi], Nv[3 * bi + 1], Nv[3 * bi + 2]], e0 = n[0] * (P[3 * bi] - s[0]) + n[1] * (P[3 * bi + 1] - s[1]) + n[2] * (P[3 * bi + 2] - s[2]);
          const hub = Math.abs(e0) > 3 ? 3 / Math.abs(e0) : 1;   // Huber beyond 3 mm
          const save = Wh[bi]; Wh[bi] = 0;   // skin has no hair
          const d0 = [D[3 * bi], D[3 * bi + 1], D[3 * bi + 2]]; for (let e = 0; e < 3; e++) D[3 * bi + e] = P[3 * bi + e];
          row([[bi, 1]], n, -(n[0] * s[0] + n[1] * s[1] + n[2] * s[2]), hub / (O.sigSkin * O.sigSkin));
          Wh[bi] = save; for (let e = 0; e < 3; e++) D[3 * bi + e] = d0[e];
        }
        for (let k = 0; k < K; k++) { JtJ[k * N + k] += 1; Jtr[k] += 0; }   // FLAME's prior: beta ~ N(0, 1)
        const pw = 1 / ((O.sigPitch * Math.PI) / 180) ** 2, pr0 = (pitch * Math.PI) / 180;   // a gentle pull toward level
        JtJ[iP * N + iP] += pw; Jtr[iP] += pw * pr0;
        let pr = pw * pr0 * pr0; for (let k = 0; k < K; k++) pr += x[k] * x[k];
        obj = E + pr;
        for (let a = K; a < N; a++) JtJ[a * N + a] += 1e-6;
        for (const h of face ? [] : [iH, iH2]) { for (let a = 0; a < N; a++) { JtJ[h * N + a] = JtJ[a * N + h] = 0; } JtJ[h * N + h] = 1; Jtr[h] = 0; }
        const nx = solveSym(JtJ, Array.from(Jtr, (v) => -v), N);   // minimise |J x + c|² + |beta|²
        for (let a = 0; a < N; a++) x[a] = nx[a];
        for (const h of [iH, iH2]) x[h] = face ? Math.max(0, Math.min(60, x[h])) : 0;
        pitch += Math.max(-4, Math.min(4, (x[iP] * 180) / Math.PI)); x[iP] = 0;   // pitch moves in steps of at most 4°
      }
      return { x, obj, pitch };
    }
    const x0 = () => { const x = new Array(N).fill(0); x[iT] = T0[0]; x[iT + 1] = T0[1]; x[iT + 2] = T0[2]; x[iH] = x[iH2] = face ? 6 : 0; return x; };
    const best = run(0, x0(), O.iters);
    best.pitch = Math.round(best.pitch * 10) / 10;
    // the fitted head, without hair, as a mesh measured like any scan
    const shp = flameShape(model, best.x.slice(0, K)), cp = Math.cos((best.pitch * Math.PI) / 180), sp = Math.sin((best.pitch * Math.PI) / 180);
    const pos = new Float32Array(3 * V);
    for (let i = 0; i < V; i++) {
      const y = shp[3 * i + 1], z = shp[3 * i + 2];
      pos[3 * i] = shp[3 * i] + best.x[iT]; pos[3 * i + 1] = y * cp - z * sp + best.x[iT + 1]; pos[3 * i + 2] = y * sp + z * cp + best.x[iT + 2];
    }
    const mesh = { pos, tri: Uint32Array.from(tris) }, scan = build(mesh, { scale: 1, base: 'z-up', yaw: 0, pitch: 0, roll: 0, flip: false });
    Object.defineProperty(scan, 'mesh', { value: mesh });   // the fitted surface, for tests (not stored)
    const r1 = (v) => Math.round(v * 10) / 10;
    return Object.assign(scan, {
      source: 'head-turn', model: 'flame', frames: pfs.length, hair: r1(best.x[iH]), hairTop: r1(best.x[iH2]),
      flame: { beta: best.x.slice(0, K).map((v) => Math.round(v * 1000) / 1000), pitch: best.pitch, T: best.x.slice(iT, iT + 3).map(r1) },   // to rebuild the head
    });
  }

  // The camera scan: FLAME when its model file is at hand (it tests clearly better on realistic heads),
  // otherwise the smooth-head fit.
  // Adult heads: ANSUR II circumferences run 500–635 mm, so anything well outside is a failed fit.
  const plausible = (s) => s.circ > 480 && s.circ < 680 && s.dome > 55 && s.dome < 150 && Math.max(s.hair || 0, s.hairTop || 0) < 50;
  function headTurnScan(frames, skin, flameBuf) {
    const tried = [];
    if (flameBuf) {
      try { const s = fromHeadTurnFlame(frames, skin, flameModel(flameBuf)); if (plausible(s)) return s; tried.push(s); } catch (e) { if (/Not enough/.test(e.message)) throw e; }
    }
    const s = fromHeadTurn(frames, skin);
    if (plausible(s)) return s;
    tried.push(s);
    const c = tried.map((t) => (t.circ / 25.4).toFixed(1) + ' in').join(', then ');
    throw new Error(`The scan didn’t give a believable head size (${c} round). Try again in good light, with your forehead and temples clear.`);
  }

  return { parse, guessOrientation, transform, build, pack, unpack, measure, fromHeadTurn, fromHeadTurnFlame, headTurnScan, plausible, flameModel, flameShape, NT, NP };
});
