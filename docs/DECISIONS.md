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
  full ring shows for a moment before fitting. Afterwards the page stays in Try on with the fitted crown
  on (owner's request), rather than switching to the On head view. The ±60° ticks are optional and drawn dimmer
  (tracking often drops there). Coverage ring and soft tones. Each new
  angle stores the tracker's pose and scale plus a MediaPipe Selfie Segmentation outline (bundled
  in `vendor/`). A smooth head (superellipsoid, separate front/back lengths) is fitted to every
  outline above ear level in a worker, then kept exactly like an imported scan. The back of the
  head is inferred (tracking fails past ~60° of turn).
- **The camera scan measures the head under the hair** (owner, 2026-09-27: it had sized the crown
  round the hair). The outline is modelled as skull + one hair thickness everywhere except the
  face; the face tracker's forehead and temple skin points lie on the skull and set the size, with
  a robust (Huber) weight. The crown then fits the skull plus the Comfort allowance (Crown fit),
  and the scan line says how much hair the camera saw. Separate top/side thickness was tried and
  dropped: it invented hair on bald heads and hardly helped. Known limit: hair much thicker on top
  than at the sides reads a few % small.
- **Camera scans without a FLAME fit show on the faun** in the On head view (shaped to the scan's ellipsoid, like tape
  heads): the fitted skull alone has no face, and the crown's brow point read as a nose on it.
  Imported scans still show as a clay bust.
- **No props for scanning.** A swim/wig cap would make the outline the skull, but the owner ruled it
  out: not common enough. The scan must work with just the camera.
- **Population priors were tried and left out** (2026-09-27). ANSUR II (US Army 2012 anthropometric
  survey, public domain, 6,068 adults): head length ≈ 1.29 × breadth (±6%), top-above-ear ≈ 0.85 ×
  breadth (±5%); face width predicts head length only weakly (r 0.43). As a prior on the fit it
  didn't improve synthetic tests: it helped hair-thicker-on-top slightly but pulled unusually long
  or short heads toward average by 3–4%. The outlines plus skin points already set the shape.
  (A test guards unusual proportions.) Next attempt at the unseen back: FLAME 2023 Open, a
  statistical head model under CC BY 4.0 (the other FLAME releases and the Liverpool-York model
  forbid redistribution, so they can't ship in a public site even non-commercially).
- **Camera scans fit FLAME 2023 Open** (2026-09-27; CC BY 4.0, credited in NOTICE; the owner
  downloaded it). Trimmed to the template + 50 identity components (97% of shape variance, 1.6 MB,
  `vendor/flame/`, made by `tools/convert-flame.py`). The fit (`fromHeadTurnFlame`) pairs model and
  observed outlines in every view plus skin points to the face, and solves shape (30 components,
  FLAME's own prior), position, pitch and hair (sides and top separately) by least squares; ~1 s.
  On synthetic FLAME heads it beat the smooth-head fit clearly: crown-band surface error ~1.8 mm vs
  ~3.5 mm, and it no longer invents hair on bald heads (the smooth fit did, because real skulls
  aren't eggs). Separate side/top hair works here (it didn't for the smooth fit) because FLAME's
  statistics constrain the skull. Pitch is solved smoothly, not from a grid: in the browser test one
  stray skin landmark flipped a grid pick and made the head 4% big. The smooth-head fit remains as
  the fallback if the model file can't load. The fitted FLAME parameters are stored with the scan
  (`flame: { beta, pitch, T }`), and the scan keeps `c` (where the fitted mesh was centred).
- **FLAME-fitted camera scans show as a clay bust of the fitted head** in the On head view (owner's
  request): the head with its face, without hair, placed exactly as the crown was fitted. Older camera
  scans (no FLAME fit or no `c`) keep the faun. The model loads in the background; the faun shows
  until it arrives.
- **Scan safety net** (after the owner's first real FLAME scan came out 16.5 in round with maximum hair,
  and a crumpled crown wrapped round the face): results must be a believable adult head (480–680 mm
  round, dome 55–150 mm, hair under 50 mm) or the smooth-head fit is tried, and if neither is
  believable the scan asks to be redone rather than fitting a crown to it. Outline pairs are robust
  (Huber, pairs over 30 mm apart ignored). The last raw capture (outlines and landmark positions, no
  picture) stays on the device as `antler-forge-last-capture` for diagnosis.
- **No "Shrunk from … to fit the printer" note** (owner): every view already shows the printed size.
- **FLAME scans: tape line above the brows, head upright, realistic shape** (owner, 2026-09-27: the
  crown ran across the eyes and was shaped round the nose). The tape line was the widest slice 40–105
  mm below the top; a FLAME head has a face and no hair, so that window reached the brow ridge, eyes
  and nose. Now the tape line may go no lower than 28 mm above the eyes' centres (FLAME has eyeballs),
  like a tape measure just above the eyebrows. Scans are stood upright in FLAME's natural head posture
  (the tracker's forehead-to-chin "up" tilted the head ~9° back, flattening the crown's tilt). FLAME's
  prior weight is 4, not 1: on a real capture weight 1 drove shape components to 5–7 SD (a lumpy
  caricature); 4 keeps them within ~±3 SD and is as accurate on synthetic heads. (Synthetic truth heads
  are measured with the same brow rule; earlier circumference comparisons were eye-level on both sides.)
- **Open: calibration perspective bias.** Calibration measures face width (landmarks 234/454) against
  the irises, which are ~45 mm nearer the camera; at ~12 in that makes the face width read ~12–16% small,
  and every scan and try-on size with it (owner's Mac scan: face 130 mm, head 18.8 in above the brows).
  Waiting for a tape measurement to confirm before changing calibration. On synthetic heads
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
- **Sculpted crowns** (owner, 2026-09-27): keep the continuous, grown-bone look but make the crown read
  as elegantly sculpted, elven work; the antlers themselves are unchanged. A **Sculpted** slider (0 =
  wild grown bone, 1 = elven) smooths the crown pieces (no antler gutters or pearling), calms the
  wander, gives crisper joins, slims secondary strands, and makes tines steadier, flame-like and swept
  with the flow; the brow point becomes a leaf-shaped drop with a flame crest. **Pattern** (species
  decide, owner's choice): stag and elk an *almond lattice* (fuller leaf-shaped openings), whitetail and
  mule *calligraphic loops* (open loops above the band behind the antlers, sweeps ending in a curl),
  forest spirit *woven filigree* (strands braid over and under the band), moose, reindeer and fawn the
  plain *band*. Designs saved earlier default to Sculpted 0 / Band, so they keep their look.
- **Sculpted crowns, second pass** (owner: "messy"; the lattice "looks like piping on a cake"). Cause:
  several round tubes of near-equal thickness running side by side, small shallow openings, clustered
  spikes, and leftover antler texture. The sculpted patterns now use few, bold, well-separated strands
  with a hierarchy (a bold band; an arch from the brow point that rejoins the band at the antler base;
  a flourish past the antler; almonds behind), openings of about 2:1 instead of 4:1, thick-to-thin
  modulation along each strand, a carved ribbon section (flat against the head, a ridge along the outer
  face), single flame tines instead of clusters, no wander at Sculpted 1, and no antler texture from
  Sculpted 0.7. The weave is two strands crossing in a slow wave (a chain of almonds), no centre line.
- **Sculpted crowns, third pass: grown from the antlers** (owner: still reads as cake icing; elements
  disjointed, unlike the references' fluid continuation and gesture). Cause: every strand was laid along
  the head at a fixed offset, like piping on a cake, and the ridged ribbon section was literally a
  piping-bag profile. Now the crown grows out of each antler's base: a beam runs forward to the brow
  (meeting the other in a V) and one runs back, both thickest at the antler and tapering away; an upper
  beam leaves the base too (lattice: arches over the temple and flows back into the brow; loops: lifts
  off over the forehead as a flame; weave: crosses the forward beam once, then lifts off); tines fork
  off the beams and sweep back and up, off the head. Round antler section with a faint bone grain
  (plain smooth white read as icing), normal fillets (crisp joins looked assembled). Rejected: ribbon
  and keel sections, strands that only follow the head surface, reduced fillets.
- **Character replaces Sculpted** (owner, 2026-09-27: "I don't really understand the sculpted slider";
  it should run from H.R. Giger-like naturalistic horror to highly refined elvish fantasy). `ringCharacter`
  0–1: 0 biomechanical horror (vertebra-like ribs along the beams, rib-cage struts between the upper beam
  and the band, stubby hooked spines, claw-hooked tines, deeper gnarled grain, restless lines); 0.5
  natural antler; 1 refined elven (smooth, calm, flame tines, faint grain). The UI doesn't name the
  artist. Patterns apply at every Character. Species: whitetail and stag 0.9, mule and elk 0.85, fawn 0.7,
  reindeer 0.65, moose 0.55, forest spirit 0.3 (eerie). Designs saved before crowns had these keep
  0.5 / Band (their old look); designs saved with Sculpted s load as Character 0.5 + s/2.
- **Crowns are bold, not wispy** (owner): the crown's beams start at 75% of the antler's own base
  radius, so they visibly grow out of it, and taper less; sturdiness minimums raised to 6 mm strands
  and 6 mm tine bases, tines at most 12× their base radius.
- **Crowns must survive printing and handling** (owner): crown strands are at least 6 mm thick
  (radius 3) except where a free end fines to its tip; band tines and brow pieces at least 6 mm at
  the base and no longer than 12× their base radius. Tested for every pattern, grown and sculpted.

## Faun bust (wear view)

- Simple and cartoony so the antlers stay the focus, but refined: one smooth blended head, not
  shapes mashed together. Markings are painted per pixel, not vertex colours (those looked blocky).
- Muzzle: wide base plus rounded tip (a narrow muzzle looked pinched). Ear markings follow the
  leaf outline. The skull ellipsoid stays fixed because the headband is fitted to it.

## Backlog and open ideas

- Optional "Switch camera" (front/back) button for trying antlers on someone else.
- Cross-device library sync with sign-in (see above), only if the owner asks.
- Consider a coarser default resolution for crowns (at Fine, 0.5 mm, a crown STL is ~70 MB).
