# Antler Forge

Parametric 3D-printable cosplay antlers that mount on a headband. A browser designer page and a
Node CLI share one geometry engine and export watertight STLs sized for a Bambu P2S. Node 18+,
plain JavaScript, no framework and no runtime or dev dependencies.

## Commands

```bash
npm test                                   # run before every commit (~35 s)
npm run build                              # both editions: dist/{antler-forge,yellowjackets}{,-standalone}.html, dist/site/
npm run serve                              # build, then serve dist/site on http://localhost:8080
npm run build:stl -- --preset elk --scale 0.7 --mount clip   # right + left STL + print notes
npm run build:stl -- design.json --res 0.35                  # the design file from the page's STL zip
npm run samples                            # samples/*.stl, one per preset at 0.6 mm
```

`/build-stl <preset>` (in `.claude/commands/`) builds a pair into `dist/stl/<preset>/`.

## Layout

- `src/antler-core.js`: the geometry engine (UMD: `require()` in Node, `window.AntlerCore` in the page).
  `PARAM_SPEC` drives both the page controls and CLI flags; `DEFAULTS` and `PRESETS` sit next to it.
- `src/designer.src.html`: the page. `/*__CORE__*/` is replaced by the engine at build time, and the
  meshing Web Worker is built from that same inlined script. Sections are marked with `/* ------- name */` banner comments:
  controls, three.js scene, faun (wear-view bust), measuring tutorial, meshing worker, files, try-on (AR), library, lore,
  fireflies. Views: `print`, `wear`, `tune`, `ar`, `library` (switch with `setView`). `tune` is
  Fine-tune: one antler's skeleton with drag handles; adjustments go in `P.tweaks` (per branch id: a turn about the
  branch's base in the head frame, length, thickness, where it leaves its parent, and tangent arms `a0`/`a1` that bend
  it between its fixed ends like a Bézier curve's handles), applied in the engine's `buildAt`.
  A species can bend its own beam the same way (`beamArms`, hidden), under any Fine-tuning.
  `keepClear` then turns any branch that comes within `MID_GAP` of the middle of the head (where the mirrored antler is)
  outward about its base just far enough; the turns are in `fit.cleared` and the page's status line says so. The library is
  localStorage `antler-forge-library-v1` (params + JPEG snapshot + size per entry); the editor's
  autosave is `antler-forge-design-v3`. The viewport pill must say whether it shows the coarse
  preview or the final built mesh.
- **Editions.** The page is built twice from `src/designer.src.html`: the storybook page (`index.html`) and
  **Antler Forge: Yellowjackets** (`yellowjackets.html`, campfire-night theme, fan-made). `tools/build-page.js`
  swaps each marked block (`<!--@name-->…<!--@/name-->` or `/*@name*/…/*@/name*/`) for the same-named block in
  `src/editions/yellowjackets.html`: title, fonts, theme CSS, scenery, corner/sprig symbols, brand, about note,
  `EDITION`, and `buildShade` (its wear-view bust: a flat-black cut-paper silhouette instead of the faun). Page
  code branches on `YJ`. Each edition shows its own species (`PRESETS[*].set`: none = storybook, `'campfire'` =
  Yellowjackets) and keeps its own autosave and library (`antler-forge-yj-design-v1`, `antler-forge-yj-library-v1`).
  The Yellowjackets edition makes headband antlers only (no crown style) and offers the skull cap base.
- **Skull cap** (base style `skull`, Yellowjackets edition): three parts, glued. `buildSkullCap` builds a thin plate
  of bone (`PLATE`: about 3 mm, a hair's gap off the head) shaped to the head everywhere (`capHead`: the head
  circumference's typical head, its top under the band's inner surface; plate coordinates x across, s along the head, h
  off it, carried into the band frame by `fromSkull`; band frame: origin at the band arc's centre). `plateForm` gives
  its outline seen from above (wide at the antlers, rounded at the back, narrowing to a nose point), broken along its
  edge like real bone (`capJag`, varied by `seed`, so Surprise me gives a new edge), as a 2D distance grid. On top: a flattened
  ridge down the middle, meandering sutures, grain and pores; thicker over the band. Each antler stands on a collar that
  flares unevenly into the plate, with a D-shaped peg. Underneath: a channel the headband glues into (`hbWidth` across the top,
  where the cap sits); ribbon slots each side, behind the band (`capTie`) and in front (`capTieFront`), along the
  plate's edge, clear of the antler's collar (`slotsMissing` names any that don't fit, for the page);
  four bobby-pin grooves in the top at the edge. Not mirror-symmetric (each side its own teeth and width, the point a
  little off the middle); plate coordinates are mapped onto a torus round the ear-to-ear axis (`fromSkull`/`toSkull`),
  so it follows the head's own curve front to back. The edge curls just off the head. Its size and shape come from the `cap*` settings (the 'Skull cap'
  group, `only: 'skull'`: shown only when the cap is the base style). It prints rim-down, lowered onto its lowest point.
  The antlers get a round flared base with a D-shaped socket (`mountSpec`). `skullSpec` gives the pedicle frames
  the page uses to place the antlers. Pegs and sockets never scale (`PEG`). It is meshed as a `fields` group. Under the
  cap the wear view's bust takes that head (`bustFit`), as it takes a crown's.
- `src/head-scan.js`: head-scan import (STL/OBJ/PLY → orientation → tape line → radius map), and
  `fromHeadTurn` (the built-in camera scan: a smooth head fitted to segmentation outlines from many
  head angles, meshed and measured like an import). Inlined after the engine in the same script
  tag, so the meshing worker and the head-turn worker have both. Frame format is documented above
  `fromHeadTurn`; image axes are x right, y up, z toward the camera; masks are y up. Camera scans use
  `fromHeadTurnFlame` (via `headTurnScan`) with the bundled FLAME 2023 Open model
  (`vendor/flame/flame_head.bin.wasm`, CC BY 4.0, regenerate with `tools/convert-flame.py`); the
  smooth-head `fromHeadTurn` is the fallback. Only FLAME 2023 **Open** may be bundled.
  Test fixtures: `make-turn.js` (renders head turns, optional hair) and `make-flame.js` (random
  realistic FLAME heads in the page's head frame).
- Head-turn capture (page, "built-in head scan" section): eye calibration first if none is saved,
  then angle bins (level yaw −60…60 by 10°, ±60 optional; chin-down at 0 and ±20°, all required); each new bin runs Selfie Segmentation
  on the same still frame the face tracker saw. Tested end to end in the browser pane with a fake
  camera/tracker/segmenter driven by `test/fixtures/make-head.js` (the pane blocks real cameras).
- `tools/build-page.js [outDir]`: inlines the engine and writes the three outputs, copies
  every `vendor/<lib>/` and `serve.js` into `site/`, and generates the `*.wasm.b64.js` copies
  (keyed `lib/file`; the page's file:// shim answers fetch/XHR for them).
- `tools/build-antlers.js`: CLI builder. Exits with code 1 unless the mesh is one watertight solid.
- `tools/silhouettes.js [--shaded] out.png preset:pattern:character[:crown][:object] ...`: worn-silhouette contact
  sheets (front, ¾, side, back, top; the head hides what's behind it) with area/height metrics, for judging a
  crown's composition; `--shaded` renders lit form instead, to check the form reads as well as the silhouette.
  Use it before and after any crown design change.
- `tools/sketchbook.js sheet.js out.html`: pencil-style 2D crown sketches over the real head and antlers, with an
  optional built crown overlaid in the same frame; the sheets and notes live in `docs/crown-sketchbook/`.
- `tools/build-samples.js`, `tools/serve.js`, `vendor/face_mesh/` and `vendor/selfie_segmentation/`
  (MediaPipe, Apache-2.0, see NOTICE; binary model files renamed `*.wasm` so every host serves them),
  `vendor/flame/` (FLAME 2023 Open, CC BY 4.0, see NOTICE).
- `test/*.test.js`: `node:test` suites. `dist/` and `samples/` are generated and gitignored. Never edit
  `dist/`; edit `src/` and rebuild.

## Architecture (engine pipeline)

1. **Skeleton** (`buildAt`, `buildSkeleton`): params → a beam plus tines, brow, crown, forks and palm as
   centre-line samples with radii, built in the head frame. Headband style: scaled and rotated onto
   a pedicle. Crown style (`placeCrown`): the antler twice (mirrored) on a band of beams built round
   a head ellipsoid (`ringSpec`, `ringBand`, `ringTines`). The fit loop shrinks antlers until the
   part fits the bed (bisection if slow) and picks the plate rotation.
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
  (`tunnel`, `clip`, `flat`, `none`, `skull`), and the skull cap. The mirrored left STL must have positive volume too.
- **Antler angles are in the head frame** (0° spread = straight up from the crown), so moving the
  base along the band (`bandAngle`) doesn't change how the antlers stand.
- **Headband dimensions and the crown's band never scale.** `mountSpec` uses `hbWidth`, `hbThick`,
  `clearance`, `wall` and `hbRadius` unscaled; a crown's band comes from `ringSpec` (head size).
  Only antlers scale.
- **Crowns are comfortable:** nothing reaches inside the head ellipsoid (`skel.head`, cut away in
  `meshAntler`), the liner that touches the head is smooth, and decoration stays outside it.
- **Printed tip radius is at least 1.5 mm** (`MIN_R`); crown strands at least 3 mm radius and band
  tines at least 3 mm at the base (`STRAND_MIN`, `TINE_BASE_MIN`), so crowns don't snap.
- **Each antler, or each crown, fits the Bambu P2S (256 × 256 × 256 mm) as one part**, with a 6 mm brim margin
  (`BED_MARGIN`), when autoFit is on. It is never split into pieces.
- **Preview colours come from the Bambu hex codes** in `FILAMENTS`: PLA Matte Bone White 11103
  `#CBC6B8`, PLA Wood White Oak 13106 `#D6CCA3`.
- **Antlers use the physically lit filament material** (`mats.antler`, `MeshStandardMaterial` with
  vertex colours). Only the faun bust, its headband prop and the scenery are toon-shaded.

The tests in `test/` cover the first five. If a change needs one of them to move, stop and ask.

## Constraints

- **Published claude.ai artifact pages** block the camera and all non-script network fetches, so
  try-on (camera only; there is no photo mode) isn't available there. `dist/antler-forge.html` is
  the body-only page for the Artifact publisher. Downloads there go through `window.claude.use('downloads')`.
- **Units:** the page shows inches (`inch()` / `fmt`); params, the engine, the CLI and STLs stay in mm.
  Print notes from the page pass `{ units: 'in' }`; slicer settings in them stay in mm.
- **Try-on real size** comes from the face width (landmarks 234 ↔ 454) in mm: a saved one-tap eye
  calibration (`antler-forge-scale`, median of close, face-on frames), else the live iris estimate
  (`refineLandmarks: true`, 11.7 mm irises), else 145 mm. Keep calibration one step with no manual
  marking; don't ask people to hold up ID or bank cards.
- **`dist/site` must work both from a double-clicked `file://` page and over https.** Browsers block
  `file://` pages from fetching the tracker's binaries, so each `.wasm` also ships as a `.b64.js` script,
  and `installFileShim()` answers the tracker's fetch/XHR calls from those. Keep the `.data.wasm`
  and `.binarypb.wasm` names: the page's `locateFile` asks for them by those names so every host
  serves them. Camera try-on needs https or localhost.
- **three.js r128** (and r128 OrbitControls) loads from cdnjs/jsdelivr; fonts come from Google Fonts.
  Nothing else is fetched from the network. Stay on r128's API (e.g. `outputEncoding`, `sRGBEncoding`).
- No build step beyond `tools/build-page.js`, no npm dependencies, and CommonJS in Node.

## Working here

- **Read `docs/crown-design-brief.md` before designing or changing a crown pattern**: the owner's standard
  for crowns (composition, execution, process, what to avoid).
- **Read `docs/DECISIONS.md` before changing try-on, units, the library or the interface.** It records
  settled decisions and why; add to it when the owner settles a new one.

- **Run `npm test` before every commit.** Add or extend a test when you touch the engine.
- A new parameter goes in `PARAM_SPEC` (UI and CLI pick it up) and `DEFAULTS`. Put it in the group
  and tier where people will look for it: `essentials` (always shown, keep it to ~9 controls),
  `details` (collapsed sculpting groups), `advanced` (headband fit and printer) or `hidden` (set by
  the species and design files, a CLI flag, no page control). Prefer folding it into a combined control
  (Tine length, Thickness, Wildness, Texture, Ornament size: relative, ×1 = the species, in
  `applyMacros`) over adding a slider. If it should survive a species change, add it to the keep-list
  in `presetParams`.
- Page hierarchy: header = title, Save to library + Library, view switch; panel = Start (species,
  Surprise me, filament) → Essentials (open) → Shape details → Advanced (collapsed); footer = one
  status line + one primary button that reads Build final mesh, then Download STLs. Don't add a
  second place for an action that already exists.
- The faun (`buildFaun`) is one blended-SDF head shrink-wrapped from a sphere, leaf ears and a lathe
  body. Its markings are painted per pixel by `painter()` (toon material + `onBeforeCompile`), not
  vertex colours. Keep the skull ellipsoid (74 × 92 × 92 at (0,−6,0)): the headband is fitted to it.
- Keep page, CLI and engine behaviour identical: the page and the CLI must build the same mesh from
  the same `design.json`.
- Repo: https://github.com/emorykrall/antler-forge (`main` blocks force pushes and deletion). Live site:
  https://emorykrall.github.io/antler-forge/ (`dist/site`, deployed by `.github/workflows/pages.yml` on
  every push to `main`). CI (`.github/workflows/ci.yml`) runs `npm test` on Node 20.
