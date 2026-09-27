#!/usr/bin/env python3
"""Convert FLAME 2023 Open (CC BY 4.0) into the compact head model the head scan uses.

Usage: python3 tools/convert-flame.py path/to/flame2023_Open.pkl [components]

Download FLAME 2023 Open from https://flame.is.tue.mpg.de/download.php (free account; accept the
CC BY 4.0 licence). Standard library only: numpy isn't needed, because the pickle's arrays are raw
buffers that are read directly here.

Writes vendor/flame/flame_head.bin.wasm (the .wasm name makes every host serve it, as for the other
vendored binaries), little-endian:
  'FLM1', uint32 V, F, K
  float32[K]      per-component scale (int16 value * scale = mm per standard deviation)
  float32[V*3]    template vertices, mm
  uint16[F*3]     triangles (padded to 4 bytes)
  int16[K*V*3]    identity shape components, component-major
Changes from the original: only the first K identity components (no expressions, pose correctives
or joints), axes turned to x = side, y = forward (face), z = up, metres to millimetres, components
quantised to 16 bits.
"""
import array, os, pickle, struct, sys

class Buf:
    def __init__(self, buf, dtype, shape, order):
        self.buf, self.shape = buf, tuple(shape)
class DType:
    def __init__(self, *a): pass
    def __setstate__(self, st): pass
class Other:
    def __init__(self, *a, **k): pass
    def __setstate__(self, st): pass
class Loader(pickle.Unpickler):
    def find_class(self, module, name):
        return Buf if name == '_frombuffer' else DType if name == 'dtype' else Other

def main():
    src = sys.argv[1]
    K = int(sys.argv[2]) if len(sys.argv) > 2 else 50
    d = Loader(open(src, 'rb'), encoding='latin1').load()
    vt = array.array('d'); vt.frombytes(d['v_template'].buf)
    f = array.array('I'); f.frombytes(d['f'].buf)
    sd = array.array('d'); sd.frombytes(d['shapedirs'].buf)
    V, C, F = d['v_template'].shape[0], d['shapedirs'].shape[2], d['f'].shape[0]
    assert d['shapedirs'].shape == (V, 3, C) and K <= 300 and V < 65536
    # FLAME: x to the subject's left, y up, z out of the face; here: x side, y forward, z up.
    # (-x, z, y) is a proper rotation, so triangle winding is unchanged.
    def turn(x, y, z): return (-x * 1000, z * 1000, y * 1000)
    tpl = array.array('f')
    for i in range(V): tpl.extend(turn(vt[3 * i], vt[3 * i + 1], vt[3 * i + 2]))
    scales, comps = array.array('f'), []
    for c in range(K):
        v = []
        for i in range(V):
            b = (3 * i) * C + c
            v.extend(turn(sd[b], sd[b + C], sd[b + 2 * C]))
        s = max(abs(x) for x in v) / 32767 or 1.0
        scales.append(s)
        comps.append(array.array('h', (int(round(x / s)) for x in v)))
    tri = array.array('H', f)
    out = os.path.join(os.path.dirname(__file__), '..', 'vendor', 'flame', 'flame_head.bin.wasm')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'wb') as o:
        o.write(b'FLM1' + struct.pack('<3I', V, F, K))
        for a in [scales, tpl, tri]:
            if sys.byteorder != 'little': a.byteswap()
            o.write(a.tobytes())
        if (F * 3 * 2) % 4: o.write(b'\0\0')
        for a in comps:
            if sys.byteorder != 'little': a.byteswap()
            o.write(a.tobytes())
    print(f'wrote {os.path.relpath(out)}: {V} vertices, {F} triangles, {K} shape components, {os.path.getsize(out) / 1e6:.2f} MB')

if __name__ == '__main__':
    main()
