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

## Faun bust (wear view)

- Simple and cartoony so the antlers stay the focus, but refined: one smooth blended head, not
  shapes mashed together. Markings are painted per pixel, not vertex colours (those looked blocky).
- Muzzle: wide base plus rounded tip (a narrow muzzle looked pinched). Ear markings follow the
  leaf outline. The skull ellipsoid stays fixed because the headband is fitted to it.

## Backlog and open ideas

- Optional "Switch camera" (front/back) button for trying antlers on someone else.
- Cross-device library sync with sign-in (see above), only if the owner asks.
