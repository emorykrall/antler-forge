# Decisions and backlog

Settled product decisions, with the reason for each, so they don't get reopened by accident.
Newest first within each section. Change one only when the owner asks.

## Try-on sizing

- **Size comes from a one-tap eye calibration.** Tap Calibrate, take glasses off, look at the
  camera from about 12 in for a few seconds. Only close, face-on, eyes-open, steady frames count;
  the median face width (landmarks 234 ↔ 454) is saved in `antler-forge-scale`. Before
  calibrating, the live iris estimate (11.7 mm irises) is used, then an average 145 mm face.
- **A gentle nudge, once per visit:** "For true size, take off your glasses and tap Calibrate
  below." Glasses visibly throw the iris reading off, so the instruction is explicit.
- **No Fine-tune size slider.** Size comes from calibration only. The Height slider stays (hair).
- **No ruler calibration.** It was built and removed: dragging markers onto a photo was too clunky.
  Calibration must stay one step with no manual marking.
- **No ID or bank cards for scale.** Asking people to hold one up feels like an identity-theft
  attempt, even for gift cards of the same size.
- **No other bundled scale source exists.** MediaPipe's face-geometry module assumes an average
  head; the iris is the only thing in the bundle that measures the person. Phone depth sensors
  aren't available to web pages.

## Try-on camera

- **Camera only; photo mode was removed.** In the claude.ai viewer the camera is blocked, so
  try-on isn't available there; the page says to open it in a browser tab.
- **Mirror image** is an on/off toggle (on by default); Save picture saves what's shown.
- **No front/back camera switch** at the moment. The old "Flip" did that and confused people.
  It can come back as a separate "Switch camera" button if wanted.

## Units

- **The page shows inches everywhere** (sliders, readouts, library cards, try-on, hints).
- **Params, engine, CLI and STLs stay in millimetres.** Slicers read STLs as mm.
- **Print notes from the page:** sizes in inches with mm alongside; Bambu Studio settings in mm,
  because that's what the slicer's fields use. The CLI's notes are unchanged (mm).
- Mesh-resolution choices and the status pill show no numbers (voxel sizes mean nothing in inches).

## Designs and the library

- **Save to library stores designs in the browser** (localStorage `antler-forge-library-v1`),
  with a snapshot, size and every setting. Nothing downloads.
- **No export/import or backup file, and no Load design file button.** The owner declined both
  for now. The only design file is the `*-design.json` inside each STL zip (used by the CLI).
- **No accounts or cross-device sync yet.** GitHub Pages is static. If wanted later: sign-in with a
  hosted database (e.g. Supabase), layered on top of the local library. A password-less "username"
  was rejected: anyone could read or overwrite designs.

## Interface

- **Hierarchy:** header = title, Save to library + Library, view switch (Print bed / On headband /
  Try on). Panel = Species + Surprise me + Filament → Essentials (open) → Shape details →
  Advanced (collapsed). Footer = one status line + one primary button (Build final mesh, then
  Download STLs).
- **One place per action.** The owner found the interface crowded when actions were duplicated.
- **The viewport always says whether it shows the coarse preview or the final mesh.**
- **Surprise me** gives a new variation of the current species (keeps Size, headband, printer).

## Crown style

- **A crown is one printed piece**: a band sized to the head plus two mirrored antlers rising at the
  temples (Antler position, default 50° from the front). Bases: closed, open at the back, open at
  the front (Opening sets the gap). The band never scales; only the antlers shrink to fit the P2S.
- **Sized from tape measurements.** Circumference (round the forehead, default 22.5 in) alone gives
  typical proportions. Switching on "Use over-the-top measurements" adds front-to-back and ear-to-ear
  arcs over the top (between the tape line's two sides); the head ellipsoid's length, width and dome
  height are then solved from all three (exact round trip, tested), and the comfort allowance is
  added evenly. The page shows the solved head and flags unusual shapes. The faun and the try-on
  occluder take the measured shape. Next for fit: 3D head-scan import (photos alone were rejected:
  hair and the unseen back of the head make them unreliable).
- **Comfort first.** The head is modelled as an ellipsoid (the faun's skull shape, scaled from the
  circumference). A smooth liner rests on it all the way round, with no texture; beams, tines and
  antlers sit outside it; anything inside the head surface is cut away with a soft edge; open ends
  are rounded and flare outward. The crown tilts front-up (Tilt, default 10°).
- **3D head scans (built):** "Head size from: A 3D head scan" imports STL/OBJ/PLY from a phone
  scanning app. `src/head-scan.js` guesses units, which way is up, and turns the face to the front
  by finding the nose; an alignment view (front arrow, tape-line ring, units / up / flip / turn /
  tip / lean) confirms it. The scan is kept as its radius in every 1.5° direction (~150 KB, in the
  browser, never uploaded), travels to the mesh worker, and goes in the STL zip for the CLI
  (`--scan`). The crown's liner and head cut use the scanned surface; the On head view shows the
  scan as a clay bust. A web page can't reach Face ID / LiDAR depth.
- **Built-in head scan ("Scan my head", 2026-09-27):** eye calibration first (skipped if saved),
  then a guided head turn: left, right, then chin down facing the camera, chin down turned left,
  chin down turned right, each asked for by name (an early version finished after any two chin-down
  views with a vague prompt, and it wasn't clear the scan had worked). All three are required; the
  full ring shows for a moment before fitting. The ±60° ticks are optional and drawn dimmer
  (tracking often drops there). Coverage ring and soft tones. Each new
  angle stores the tracker's pose and scale plus a MediaPipe Selfie Segmentation outline (bundled
  in `vendor/`). A smooth head (superellipsoid, separate front/back lengths) is fitted to every
  outline above ear level in a worker, then kept exactly like an imported scan. Forehead landmarks
  are only a weak tie-breaker: tracked points can sit several mm off the skin and a strong weight
  wrecked the fit. The back of the head is inferred (tracking fails past ~60° of turn). Hair
  counts as head, so the hint says to wear hair as it will be under the crown. On synthetic heads
  the circumference comes out within ~2% under mask noise, pose/scale jitter and missing views;
  the calibration's accuracy matters more than the fitting's.
- **Try-on places crowns on the head** (checked on a real head, 2026-09-27): the head that hides the
  back of the crown is scaled to the crown's head size.
- **It prints upright, as worn, on supports**, resting on a small flat foot at its lowest point.
  (An earlier flat-ring version was dropped: printing flat isn't required, comfort is.)
- **Dynamic, not a circle.** The band dips to a point on the forehead (Brow dip), rises over the
  temples and settles lower at the back. It's built from antler beams: the band, a sweep from the
  brow up past each antler ending as a swept-back tine, and a lower beam forming open loops
  (Beams 1–3, Loops). Tines follow the beams' flow and grow near the antlers.
- **Parametric variation (Crown shape group):** Brow dip, Temple rise, Back drop, Sweep lift and
  reach, Loop depth, Band taper, Tine lean, Organic variation, and Asymmetry (0 = the band and its
  tines mirror exactly; higher lets the sides differ; antlers stay mirrored). Species set the
  defaults; Surprise me varies them for crowns. The wear view is labelled "On head" for crowns.
- **Species shape the band**, not just the antlers: whitetail upswept spikes and a brow point;
  mule forked tines; elk tines swept back; stag clusters; reindeer a forward shovel; moose one heavy
  band with paddles; forest spirit curling tendrils; fawn a plain band with buttons.
- References the owner shared were for general direction only; don't reproduce any of them.

## Faun bust (wear view)

- Simple and cartoony so the antlers stay the focus, but refined: one smooth blended head, not
  shapes mashed together. Markings are painted per pixel, not vertex colours (those looked blocky).
- Muzzle: wide base plus rounded tip (a narrow muzzle looked pinched). Ear markings follow the
  leaf outline. The skull ellipsoid stays fixed because the headband is fitted to it.

## Backlog and open ideas

- Optional "Switch camera" (front/back) button for trying antlers on someone else.
- Cross-device library sync with sign-in (see above), only if the owner asks.
- Consider a coarser default resolution for crowns (at Fine, 0.5 mm, a crown STL is ~70 MB).
