# FLAME 2023 Open (trimmed)

`flame_head.bin.wasm` is derived from **FLAME 2023 Open** by the Max Planck Institute for Intelligent
Systems (https://flame.is.tue.mpg.de), under the Creative Commons Attribution 4.0 International
licence. Cite: T. Li, T. Bolkart, M. J. Black, H. Li and J. Romero, *Learning a model of facial shape
and expression from 4D scans*, ACM Transactions on Graphics (Proc. SIGGRAPH Asia), 2017.

Changes: the template, triangles and first 50 identity shape components only; axes turned to
x = side, y = forward, z = up; millimetres; components quantised to 16 bits. The file format is
documented in `tools/convert-flame.py`, which regenerates it from `flame2023_Open.pkl`
(download it yourself from the FLAME site; the original isn't kept in this repository).
The `.wasm` suffix only makes every static host serve it; it isn't WebAssembly.

Only FLAME 2023 **Open** may be used here: the other FLAME releases are licensed for
non-commercial research and may not be redistributed, so they can't ship in a public site.
