# Antler Forge

Parametric 3D-printable cosplay antlers that mount on a headband.

| Path | What it is |
|---|---|
| `src/antler-core.js` | Geometry engine shared by the page and the CLI: skeleton → signed distance field → marching tetrahedra → validated mesh → STL/zip. |
| `src/designer.src.html` | Page source. `npm run build` inlines the engine into it. |
| `tools/build-page.js` | Builds `dist/antler-forge.html` (body-only page for the Artifact publisher), `dist/antler-forge-standalone.html` (single file, everything except try-on works when opened directly) and `dist/site/` (the page, the local face tracker for try-on, and `serve.js`). |
| `tools/build-antlers.js` | Command-line STL builder (Node 18+, no dependencies). |
| `tools/serve.js` | Tiny static server, copied into `dist/site/`. |
| `tools/build-samples.js` | Regenerates `samples/`: one right-hand STL per preset. |
| `vendor/face_mesh/` | MediaPipe Face Mesh (Apache-2.0), used by try-on. |

`dist/` and `samples/` are generated and not committed.

```bash
npm run build        # dist/antler-forge.html, dist/antler-forge-standalone.html, dist/site/
npm run serve        # build, then serve dist/site on http://localhost:8080
npm run samples      # samples/*.stl
npm test             # every preset × base style meshes as one watertight solid
```

## Command line

```bash
node tools/build-antlers.js design.json                 # right + mirrored left STL, 0.5 mm voxels
node tools/build-antlers.js design.json --res 0.35      # finer surface (slower, bigger files)
node tools/build-antlers.js --preset elk --scale 0.7 --mount clip --hbWidth 15
node tools/build-antlers.js --list-presets
```

`design.json` is the file from **Save design** in the page (or inside the downloaded zip).
Any parameter can be overridden with `--name value`. The exit code is 1 if the mesh fails its check.

## Try on (camera or photo)

The **Try on** view places the pair on your head, at the size it will print. MediaPipe Face Mesh, bundled in `vendor/face_mesh`, finds your face, and a head frame is fitted from the forehead, chin and both sides of the face. Everything runs on your device, and no image leaves it. Use the Size and Height sliders to fine-tune the fit (for example, for thick hair). "Save picture" exports a PNG.

- **Inside the Claude viewer:** the camera is blocked there, so use **Use a photo** with a front-facing selfie.
- **Live camera on this computer:** run `npm run build`, then double-click `dist/site/index.html`, or run `npm run serve` and open http://localhost:8080. Keep the `vendor` folder next to `index.html`. When the page is opened from disk, it reads the tracker from the `.b64.js` copies, because browsers block `file://` pages from loading the binary files directly.
- **Live camera on your phone:** host the `dist/site` folder over https. Dragging it onto Netlify Drop (app.netlify.com/drop) or pushing it to GitHub Pages both work. Then open the link on your phone and tap **Use camera**, then **Flip** to use the back camera on someone else.

The two binary tracker files carry a `.wasm` suffix only so that every host serves them; the page asks for them by those names.

## Materials and printer

The preview is shaded in the filament's real color. The two options are Bambu PLA Matte Bone White (11103, #CBC6B8) and Bambu PLA Wood White Oak (13106, #D6CCA3). The print notes give Bambu Studio settings for each: layer height, walls, organic tree supports and brim, plus a hardened steel nozzle and drying for the wood filament.

Each antler is always exported as one complete part for the Bambu P2S (256 × 256 × 256 mm). With **Shrink to fit the printer** on (the default), the antler is scaled down until it fits with a 6 mm margin for a brim. Headband dimensions never scale. The part is turned on the plate only when that's needed to fit. The printed tip radius never drops below 1.5 mm.

## Design defaults

The defaults aim for a balanced, sculptural silhouette rather than a naturalistic one:

- Tine tips follow a smooth arch that peaks at "Longest tine at".
- Spacing tightens toward the tip, and the tines fan and lean slightly inward.
- Beams sweep out and back in, so the pair reads as a lyre from the front.
- Variation and wander are low, gutters and pearling are quiet, and the burr is a regular beaded ring.
- A Taubin smoothing pass removes voxel ripple without shrinking the form. It only moves vertices, so the mesh stays watertight.

Raise "Kinks & wander" and "Natural variation" for a wilder, more naturalistic look.

## Anatomy the generator models

- **Pedicle base:** a flared, skin-textured stump with a short vertical rim. It is stretched along the headband, and the channel is hidden inside it.
- **Burr (coronet):** a knobbly ring of lobes and nodules where the antler meets the pedicle. It is flatter underneath so it prints with less support.
- **Beam:** stays thick, swells just below each tine, narrows after it, and kinks slightly away from each branch. The oval cross-section is flattened across the plane of the rack.
- **Tines:** thick at the root, then a pointed ogive tip. They bend upward toward head-up.
- **Surface:** irregular gutters that fade out toward smooth, polished tips, plus pearling near the base.
- **Palms (moose, reindeer):** one flat plate wrapping the fan of crown points, thinning toward the rim.

All angles are in the head frame (0° spread = straight up from the crown of the head), so moving the base along the band doesn't change how the antlers stand.

## Why the STLs are watertight

The antler is a single signed distance field. Every part is smooth-unioned, the headband channel is subtracted, and the field is clipped at Z = 0. It is then polygonised with marching tetrahedra, which has no ambiguous cases, so the surface is always closed, 2-manifold and consistently wound. Speck-sized stray shells are removed whole. Every build is checked for open edges, non-manifold edges, shell count and volume sign, and `tools/build-antlers.js` exits with code 1 unless the result is one watertight solid. All 8 species × 4 base styles pass an independent `trimesh` check.

## Base styles

- **Flared · slide-on.** A closed channel sized to headband width + clearance, and thickness + clearance + the sag of a curved band across the footprint.
- **Flared · snap-on.** Same channel with a narrower slot underneath. Print it in PETG so it flexes.
- **Flared · glue-on.** A solid flared base.
- **Burr only, flat cut.** No flare, just the burr on a short flat-bottomed stub.

## License

MIT for Antler Forge's own code (see `LICENSE`). `vendor/face_mesh` is MediaPipe Face Mesh under Apache-2.0 (see `NOTICE`).
