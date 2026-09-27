# Antler Forge

Parametric 3D-printable cosplay antlers that mount on a headband. A browser designer page and a
Node CLI share one geometry engine and export watertight STLs sized for a Bambu P2S. Node 18+,
plain JavaScript, no framework and no runtime or dev dependencies.

## Commands

```bash
npm test                                   # run before every commit (~11 s)
npm run build                              # dist/antler-forge.html, dist/antler-forge-standalone.html, dist/site/
npm run serve                              # build, then serve dist/site on http://localhost:8080
npm run build:stl -- --preset elk --scale 0.7 --mount clip   # right + left STL + print notes
npm run build:stl -- design.json --res 0.35                  # a design saved from the page
npm run samples                            # samples/*.stl, one per preset at 0.6 mm
```

`/build-stl <preset>` (in `.claude/commands/`) builds a pair into `dist/stl/<preset>/`.

## Layout

- `src/antler-core.js`: the geometry engine (UMD: `require()` in Node, `window.AntlerCore` in the page).
  `PARAM_SPEC` drives both the page controls and CLI flags; `DEFAULTS` and `PRESETS` sit next to it.
- `src/designer.src.html`: the page. `/*__CORE__*/` is replaced by the engine at build time, and the
  meshing Web Worker is built from that same inlined script. Sections are marked with `/* ------- name */` banner comments:
  controls, three.js scene, faun (wear-view bust), meshing worker, files, try-on (AR), lore, fireflies.
- `tools/build-page.js [outDir]`: inlines the engine and writes the three outputs, copies
  `vendor/face_mesh` and `serve.js` into `site/`, and generates the `*.wasm.b64.js` copies.
- `tools/build-antlers.js`: CLI builder. Exits with code 1 unless the mesh is one watertight solid.
- `tools/build-samples.js`, `tools/serve.js`, `vendor/face_mesh/` (MediaPipe, Apache-2.0, see NOTICE).
- `test/*.test.js`: `node:test` suites. `dist/` and `samples/` are generated and gitignored. Never edit
  `dist/`; edit `src/` and rebuild.

## Architecture (engine pipeline)

1. **Skeleton** (`buildAt`, `buildSkeleton`): params → a beam plus tines, brow, crown, forks and palm as
   centre-line samples with radii, built in the head frame, then scaled and rotated into the print
   frame. The fit loop shrinks the antler until it fits the bed and picks the plate rotation.
2. **Signed distance field** (`meshAntler` → `fillLayer`): round-cone segments with oval sections,
   gutters and pearling, smooth-unioned (`smin`) with the flared pedicle, burr and palm. The headband
   channel is subtracted and the field is clipped at Z = 0, one Z layer at a time.
3. **Marching tetrahedra**: 6 tets per cube, with no ambiguous cases, so the surface is always closed.
   `dropSpecks` then removes tiny stray shells whole.
4. **Taubin smoothing** (`taubin`): λ/μ passes that move vertices only; bed vertices are locked.
5. **Validate** (`validateMesh`): open edges, non-manifold edges, shells, genus, signed volume.
6. **Export**: `toSTL` (binary; `mirror` flips X and the winding for the left antler, and `rotZ` turns
   the part on the plate), `makeZip` (store-only), `printNotes`.

## Invariants: MUST NOT BREAK

- Every export is **one watertight, consistently wound solid, flat at Z = 0**: 0 open edges,
  0 non-manifold edges, 1 shell, positive volume, for every preset × every base style
  (`tunnel`, `clip`, `flat`, `none`). The mirrored left STL must have positive volume too.
- **Antler angles are in the head frame** (0° spread = straight up from the crown), so moving the
  base along the band (`bandAngle`) doesn't change how the antlers stand.
- **Headband dimensions never scale.** `mountSpec` uses `hbWidth`, `hbThick`, `clearance`, `wall` and
  `hbRadius` unscaled; only the antler (and the pedicle radius that follows the beam) scales.
- **Printed tip radius is at least 1.5 mm** (`MIN_R`).
- **Each antler fits the Bambu P2S (256 × 256 × 256 mm) as one part**, with a 6 mm brim margin
  (`BED_MARGIN`), when autoFit is on. It is never split into pieces.
- **Preview colours come from the Bambu hex codes** in `FILAMENTS`: PLA Matte Bone White 11103
  `#CBC6B8`, PLA Wood White Oak 13106 `#D6CCA3`.
- **Antlers use the physically lit filament material** (`mats.antler`, `MeshStandardMaterial` with
  vertex colours). Only the faun bust, its headband prop and the scenery are toon-shaded.

The tests in `test/` cover the first five. If a change needs one of them to move, stop and ask.

## Constraints

- **Published claude.ai artifact pages** block the camera and all non-script network fetches, so
  try-on there is photo only. `dist/antler-forge.html` is the body-only page for the Artifact publisher.
  Downloads there go through `window.claude.use('downloads')`.
- **`dist/site` must work both from a double-clicked `file://` page and over https.** Browsers block
  `file://` pages from fetching the tracker's binaries, so each `.wasm` also ships as a `.b64.js` script,
  and `installFileShim()` answers the tracker's fetch/XHR calls from those. Keep the `.data.wasm`
  and `.binarypb.wasm` names: the page's `locateFile` asks for them by those names so every host
  serves them. Camera try-on needs https or localhost.
- **three.js r128** (and r128 OrbitControls) loads from cdnjs/jsdelivr; fonts come from Google Fonts.
  Nothing else is fetched from the network. Stay on r128's API (e.g. `outputEncoding`, `sRGBEncoding`).
- No build step beyond `tools/build-page.js`, no npm dependencies, and CommonJS in Node.

## Working here

- **Run `npm test` before every commit.** Add or extend a test when you touch the engine.
- A new parameter goes in `PARAM_SPEC` (UI and CLI pick it up) and `DEFAULTS`. If it should
  survive a species change, add it to the keep-list in `presetParams`.
- Keep page, CLI and engine behaviour identical: the page and the CLI must build the same mesh from
  the same `design.json`.
- Repo: https://github.com/emorykrall/antler-forge (`main` blocks force pushes and deletion). Live site:
  https://emorykrall.github.io/antler-forge/ (`dist/site`, deployed by `.github/workflows/pages.yml` on
  every push to `main`). CI (`.github/workflows/ci.yml`) runs `npm test` on Node 20.
