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
        // no surface that way (an open neck, a hole): the matching ellipsoid stands in
        r[j * NT + i] = far > 0 ? far : 1 / Math.hypot(u[0] / fit[0], u[1] / fit[1], u[2] / fit[2]);
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
    return { v: 1, nt: NT, np: NP, r, fit: m.fit, seat: m.seat, dome: m.dome, circ: m.circ, orient: o };
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

  return { parse, guessOrientation, transform, build, pack, unpack, measure, NT, NP };
});
