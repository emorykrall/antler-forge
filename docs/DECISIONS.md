# Decisions and backlog

Settled product decisions, with the reason for each, so they don't get reopened by accident.
Newest first within each section. Change one only when the owner asks.

## Antler Forge: Yellowjackets (second edition, 2026-10-03)

- **A second page, same source.** `yellowjackets.html` beside the storybook page, built from the same
  `designer.src.html` with its own blocks (`src/editions/yellowjackets.html`), so fixes reach both. Named
  "Antler Forge: Yellowjackets" by the owner; a fan-made edition, with a not-affiliated note under About the files.
- **Mood: campfire night.** Black spruce, firelight from below, sparks instead of fireflies, typewriter display
  type, handwritten lore and names. Always dark. Antler lighting stays neutral (true filament colour).
- **Species, loosely after the show's found-bone headpieces:** Trial crown (short, rough, gnarled), Queen's lyre
  (tall, slender, tips curving in), Spikes (curved spikes with one small point), Non-typical (gnarled, points every
  way). Small and irregular rather than trophy racks. Same controls as the storybook page.
- **More species from the owner's reference photos** (whitetail and mule deer bucks): Typical buck (10 points,
  tines straight up off a forward-sweeping beam), Velvet buck (thick, smooth, blunt), Forkhorn (a young buck's fork)
  and Mule buck (forked points).
- **The skull cap is configurable** (a Skull cap group, shown only when it's the base style): shape (Shield,
  Rounded, Long nasal point), front reach, back reach, width beyond the antlers, antler spacing, pedicle height,
  and the strap slots.
- **Long nasal point, after the trial crown** (owner's photo) **and a real deer skull's dorsal view**: the skull
  face comes down the front of the head so it's seen face-on (about 1.5 in further than Front reach), with volume
  (a ridge of nasal bone, thick rims round the eye sockets). Its outline is the skull's: widest at the orbital rims
  just in front of the antlers, narrowing smoothly (no sharp inside corners) to nasal bones that end in two short
  points, with the preorbital vacuities (openings beside the nasal bones). Every cap shape has the supraorbital
  foramina (small holes with grooves running forward) and a zigzag suture between the antlers. Trial crown was retuned to that crown's antlers (upright,
  close-set, a low point, a tine part-way up, a fork at the top), and the page opens on Trial crown with this cap.
- **Wear view: a silhouette, not a character.** The owner rejected a hooded figure and soft, featured busts:
  the figure is flat black, hard-edged, like a cut-paper locket silhouette (profile, hair up, a long neck). It is
  built from drawn side and front outlines.
- **Headband antlers only**: no crown style (so no head measuring tutorial or head scans on this page).
- **Skull cap: minimal, three parts, glued.** A deer's skull cap (frontal plate) over the band, about
  4.6 × 3.5 in, pedicles at a deer's spacing (about 3 in apart). Antlers glue onto D-shaped pegs (pegs on the cap,
  sockets in the antlers, so each antler keeps a wide flat base to print on). The headband glues into a groove
  under the cap. Owner chose glue over snap clips and a press fit. It prints rim-down with tree supports inside only.
- **How the skull cap stays on** (owner, after a cloth tie to the nape didn't make sense): the piece is top-heavy,
  so the failure to stop is rocking forward and back about the ear-to-ear line, which a headband alone allows.
  Four bobby-pin grooves on the outside at the rim (two front, two back) are always built in: a pin slides on from
  the edge, top prong in the groove, bottom prong in the hair. (Loops under the cap were tried and rejected: hard to
  reach while wearing it, and they pressed toward the scalp.) Strap slots (a switch, on by
  default) take one loop of ½ in elastic or a cloth strip that runs round the back of the head under the bump of
  the skull, where it can't ride up. The wear view draws the strap so how it holds is visible.
- **The skull cap follows the head.** Head circumference shows when the cap is selected and sets the cap's
  front-to-back curve; ear to ear it follows the headband's curve. The headband graphic follows the bust's head.

## Fine-tune (both pages, 2026-10-04)

- **A view in the view switch**: Print bed · On headband · Fine-tune · Try on. Headband antlers only (hidden for
  crowns, for now). It shows one antler's skeleton over a ghost of its mesh, on the bust; the other antler is
  always its mirror image.
- **Drag dots in the camera's plane**: a branch's tip dot swings it about its base and stretches it; its base dot
  slides it along the branch it grows from; dragging empty space turns the view; Front and Side change the plane.
  A card names the picked branch and its length, with Thickness, Reset branch and Reset all.
- **Saved as `tweaks`** in the design (library, autosave, design file), keyed by branch id and applied in the
  engine, so the CLI builds the same STL. Changing species or Surprise me clears them (the branches change).

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
- **Viewport chrome clearances** (owner, 2026-09-29: text got too close to the decorative frame in the corners).
  Two CSS variables on `.stage` place everything inside the viewport: `--frame` (the gilt line's inset, 8 px; 6 px
  on phones) and `--chrome` (where text and controls sit, 26 px; 20 px on phones), which clears the corner vines
  (`--vine`, 40 px; 30 px on phones) with room to spare. The HUD, library, tutorial card, try-on and head-scan
  panels, notes and error banner all use them; the progress bar runs along the frame's bottom line. On phones the
  status line drops "one piece on the P2S" so it stays one line (it still says when a piece is too big). New
  overlays use these variables, never fixed offsets.
  Also (same review): toasts sit in the viewport above the status line (they were centred on the window, across
  the panel's Build button); library cards fade out at the frame's top and bottom; the no-WebGL message is a
  centred card; the try-on camera picture sits on a plain dark mat instead of the forest scene; phones make the
  viewport taller while the measuring tutorial is open so the fawn stays visible; a phone on its side (landscape,
  up to 520 px tall) keeps the viewport and panel side by side, since stacking left no room for the controls.
- **Fewer, combined controls** (2026-09-28): see Crown style → Controls review. Before adding a control,
  check it makes a visible difference and isn't better as part of an existing combined control.

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
- **Crown iteration log (following docs/crown-design-brief.md, 2026-09-28).** Toolkit added for execution:
  fair curves (centripetal Catmull-Rom, arc-length resampled), per-stroke thickness profiles, blade/leaf
  sections with a midrib (`blade`, `keel`), relief (`liftF`, one line over another), log-spiral scroll
  terminals, vertebral ribs on template strokes toward horror, sturdiness floors on template strokes.
  Concepts scored in worn silhouette: *Fleur* strongest (one figure, dominant centre, lobes hand the eye to
  the antlers, quiet back); *Whiplash* elegant but weak focal and under-scale; *Kokoshnik* a picket fence.
  Fleur execution passes: (1) the brow junction was a blob of five strokes, so the lobes now leave the band
  beside the V; (2) line weights separated (band > lobes, blade the focal); (3) the blade widened from a
  1:4 lance to a ~1:3 leaf with a midrib; (4) sepals were hidden inside the blade, then read as drips, and
  now reach past it and curl up and in as spiral scrolls; (5) the antler burr at the crown joint smooths
  into a collar toward elven (crowns only; headbands unchanged); (6) Character now changes the silhouette:
  horror gets a serrated blade, hooked barbs on the lobes, clawed sepals and ribbed strokes. Next weakest
  points: the antlers' own brow tines crowd the lobe-antler junction from ¾; Whiplash could become good
  with a bigger knot; the older patterns should be retired once the owner has judged Fleur.
- **Formal composition review → Fleur** (owner, 2026-09-28: the crafted patterns weren't clearly better;
  evaluate formally, as abstracted silhouettes from several angles, for hierarchy and how the eye is led;
  compare with the references, jewellery and fine art). Tool: `tools/silhouettes.js` renders worn
  silhouettes (head occludes) front / ¾ / side / back / top with area and height metrics. Findings:
  (1) no single primary line: band plus parallel strands read as static (Hogarth); (2) empty centre: the
  antlers dominate the sides and nothing at the brow holds the composition, so the eye rises up the
  antlers and has nothing to return to; (3) the back competed with the front; (4) flat, ungraduated
  detail (the circlet's motifs a jumble, the spines a picket fence); (5) under-scale: antler : crown
  height was ~3.3:1, where the references are ~1.5–2:1 (near the golden ratio). Precedent: Lalique's horn
  tiara combs (one calm primary line, a dominant centre, flanking subdominants, graduated, radial, odd
  groupings), kokoshnik tiaras (graduated to the centre), reference 4 (a V at the brow with heart-lobed
  arches rising into the antlers, i.e. a fleur-de-lis). *Fleur* is built as a jeweller's flat template
  wrapped onto the head (`flatStroke`, strokes in s/h mm, standing off the head above a height): a V at the
  brow, a broad leaf-blade centre petal (≈0.55 of the antler height) standing up like a tiara's centre,
  heart-lobed side petals (≈0.3) sweeping down tangentially into the antler bases, a quiet back; every size
  a fraction of the antlers' height, so crown : antler is ≈1 : 2.1. Eye path: blade → lobes → antlers →
  their inward curve → blade. Fleur is now the default for stag, elk, whitetail and mule deer. (Lyre, a
  single gull-wing line with a small fleur, was a step on the way.)
- **Crafted crowns: Circlet and Crown of spines** (owner, 2026-09-28: the crowns still didn't read as
  purposefully made; look at LOTR and other respected fantasy prop design). Studied Weta Workshop's
  Thranduil crown (Daniel Falconer: a slim circlet with a ring of tall spines, berries gathered at the
  band) and Game of Thrones' Renly Baratheon antler crown (a clean strap band with matching antlers set
  round it). What makes them read as made: a clearly crafted base with finished edges, one motif
  repeated in rhythm, symmetry with a focal point at the brow, and contrast between the made band and the
  organic parts. *Circlet*: a strap band (12 mm plus a rim on each edge) with small copies of the
  species' own antler (0.28 of its size, graduated away from the temples) set along its top edge and a
  domed boss at the brow (no brow point or crest). *Crown of spines*: a slim twisted-twig circlet with a
  ring of tall forking spines (thick bases so they can stand ~60 mm), tallest flanking the antlers, and
  berry clusters at the band (gone toward the horror end). Both respond to Character. Species now wear
  Circlet (whitetail, mule, elk, stag, reindeer) or Crown of spines (forest spirit); the older organic
  patterns stay available until the owner decides which to retire.
- **More patterns** (owner asked for more): *Tiara* (tines along the forward beams grow taller toward the
  brow and lean in, with a tall centre spire), *Laurel* (flattened leaves in pairs lying along both beams,
  pointing away from the antlers, largest near them; barbs at the horror end), *Briar* (two vines twisting
  in a helix round each beam, with hooked thorns), *Sunburst* (alternately long and short rays all round,
  longest at the front, fanning back toward the sides, plus a centre ray). All grow from the same two
  beams and respond to Character. Fawn now uses Laurel. If even the smallest antlers can't make a crown
  fit the bed, the crown's own tines, thorns, leaves and rays shorten in steps until it does (they never
  scale with the antlers otherwise).
- **Crowns are bold, not wispy** (owner): the crown's beams start at 75% of the antler's own base
  radius, so they visibly grow out of it, and taper less; sturdiness minimums raised to 6 mm strands
  and 6 mm tine bases, tines at most 12× their base radius.
- **Crowns must survive printing and handling** (owner): crown strands are at least 6 mm thick
  (radius 3) except where a free end fines to its tip; band tines and brow pieces at least 6 mm at
  the base and no longer than 12× their base radius. Tested for every pattern, grown and sculpted.
- **Controls review (owner, 2026-09-28: "too many… some have very little effect… some could be combined").**
  The page has 63 settings instead of 95 (37 moved off the page, 5 combined ones added); crown mode shows
  12 essentials and headband mode 9, and Shape details went from 58 controls to 27. Essentials: Size, head
  size (crown), Crown design, Character, Antler length, Spread, Curl, Points, **Tine length**, Brow tine, base
  style and headband width (headband). Shape details: Antler form (Thickness, Taper, Lean, Tip curl, Wildness),
  Tines & points, Surface (Texture, Burr), Crown (base, opening, antler position, Ornament size, band thickness,
  dip, rise, drop, asymmetry). Five **combined controls** are relative (×1 = the species' design, so every
  saved design and every headband STL is unchanged): Tine length scales tineLength, browLength and
  crownLength; Thickness baseDia and tipDia; Wildness wobble, jitter and ringWander; Texture grooveDepth and
  pearling; Ornament size the crown's tines, sweep and loop lift, the Fleur composition and the circlet
  motifs (`applyMacros`, applied once in `buildSkeleton`). The 37 values they stand for, and the ones that
  made too little visible difference (tine arch, spacing rhythm, inward lean, tine thickness, brow angle and
  height, fork angle, ovality, gutter count, burr size, fillet, smoothing, seed, the band's strand, weave,
  tine style and brow piece settings), stay in PARAM_SPEC under tier `hidden`: set by each species, kept in
  design files, validated, and still CLI flags.
- **Six crown designs** (same review): Fleur, Almond lattice, Circlet, Crown of spines, Briar, Plain band.
  Retired: Tiara, Lyre, Whiplash and Kokoshnik (the Fleur does their job better), Laurel, Sunburst, Loops,
  Weave. Designs saved with a retired one open with the nearest remaining (`RETIRED` in `resolveParams`).
  Fawn wears the Plain band.
- **Nothing at the brow reads as a weapon** (owner: "smaller spiky central brow pieces seem dangerous,
  weapon like"): brow pieces are short and round-ended (a drop of at most 14 mm and a bud above it, or a
  round-ended paddle); the Fleur's centre is an openwork lancet framing a pendant drop, not a solid blade
  (owner found the old one "disturbing").
- **The elven end is smooth and sculpted** (owner: "still many blobby shapes and bumpy textures"): no gutters
  or pearling on the crown from Character ≈ 0.87 up; Crown of spines loses its twist strand, side twigs and
  berries (clean spires); Briar's twist lengthens and its thorns thin out; brow pieces are polished.
- **Character, taken further** (owner, 2026-09-28: "bumpy and gigeresque at the far left, smooth and
  sculpted at the middle, crisp and faceted at the far right"). Supersedes the horror / natural / elven
  scale above; the natural-antler middle is gone. `sculptOf` (the refined shape language: fair lines, blades,
  calm) is full from ½ up; `gigerOf` (ribs, hooks, grain) is gone by ½, and at 0 the crown's grain is deeper
  (×2.2) and its nodules run most of each piece's length instead of only near its root; `facetOf` (½ → 1)
  cuts the crown in the mesher: each piece's section becomes a regular pentagon of equal area (a crisp
  ridge facing out, a flat face toward the head), its curves become straight chords (Douglas–Peucker:
  at most 10 mm long, straying at most 2 mm, so scrolls turn into angular spirals and joins into mitres),
  joins get half the fillet, and Briar's vines straighten into parallel rods. Liner and antlers are never
  faceted; headband STLs are byte-identical. Species now sit at the smooth middle (0.5; elk 0.55, reindeer
  and moose 0.45) and the forest spirit at 0.2. Saved designs keep their number, so one saved near the old
  elven end (0.85–0.9) now opens mostly faceted: set Character to ½ for the smooth look.
- **Form & finish** (owner, 2026-09-28: the profile should go from round to geometric, "sweep a shape along a
  path… the sweep line should still be smooth and curved, just the swept shape should be faceted"; the side
  against the head has no sharp edges; the skin smoother; Texture folded in; it shapes antlers and crowns
  alike). Supersedes the Character entries above. One slider, `character`, both styles: 0 gnarled and
  biomechanical (deep grain, knobs along each piece; the crown's ribs and hooks), 0.3 natural antler (every
  species starts here, so antlers and headband STLs look as they always have; forest spirit 0.2), ½
  polished smooth, 1 faceted. Faceting sweeps a diamond of the circle's area along the unchanged curve: a
  crown piece keeps a round back toward the head and cuts its outer face into two facets meeting in a ridge;
  an antler becomes a full diamond; ridges and side edges get a 12% polish radius so they print and light
  cleanly. The earlier straight-chord cuts are gone. Texture is gone from the page (the species set grain;
  Form & finish scales it). Smoother skin: the section's flattening (oval, keel, facets) is now worked out per
  segment inside the distance loop, with frames interpolated per point, instead of only for the nearest
  segment: that removes the faint creases and ripples seen even with Texture at 0 (meshing is ~1.4× slower).
  Designs saved with the crown-only `ringCharacter` open with the same number.
- **Measuring tutorial** (owner, 2026-09-28: "add a tutorial for head measuring, use the fawn head"): a
  "How to measure" link under Head circumference opens three steps on the fawn in the wear view (around the
  head above the brows, front to back over the top, ear to ear over the top); a yellow tape with inch ticks runs
  out over its head for each step while the camera turns to it. It owns the view until closed (Done, ×, Esc,
  or switching view). For measuring, the fawn borrows human ears at human height (owner: the fawn ears on top of its
  head were confusing), so the tape runs just above them as it does on a person; a short gag swaps them (fawn ears
  twitch, pop off in a puff and spin away, slightly-too-big human ears boing in) and reverses on close (instant
  with reduced motion). The entry is a gold pill button with a tape icon ("How to measure your head"), not a
  text link (owner: "a little more noticeable"). The tutorial doesn't suggest the 3D head scan until the scan
  works better (owner).
- **Designed in a sketchbook first** (owner, 2026-09-29: "a fully new approach… start with loose 2D sketches…
  as frameworks for more detailed sketches… then build the 3D models… compare and refine"). Three new crown
  designs, **Moon**, **Lotus halo** and **Roots**, came out of ten rounds recorded in `docs/crown-sketchbook/`
  (gesture thumbnails, directions, development, refined front/side/detail drawings, models overlaid on the
  drawings, joins). `tools/sketchbook.js` draws pencil-style sketches over the real head and antlers and overlays
  a built crown in the same frame. The engine builds these designs from the sketches' own coordinates, anchored
  to the antler root and mapped onto the actual head (`sketchFrame`). Lessons that now guide every crown: over a
  face, a centre dip reads as a moustache, slanted lines as eyebrows, loops as a bow tie, rows of ovals as teeth,
  a deep horns-up curve as a smile, hanging points as fangs; forms with their own body, rising accents and
  things behind the head read as jewellery. Crown meshes drop stray slivers up to 0.8% of the volume (antler
  tines that dive into the forehead). Species keep their designs; the new ones are first in the Crown design list.

## Faun bust (wear view)

- Simple and cartoony so the antlers stay the focus, but refined: one smooth blended head, not
  shapes mashed together. Markings are painted per pixel, not vertex colours (those looked blocky).
- Muzzle: wide base plus rounded tip (a narrow muzzle looked pinched). Ear markings follow the
  leaf outline. The skull ellipsoid stays fixed because the headband is fitted to it.

## Backlog and open ideas

- Optional "Switch camera" (front/back) button for trying antlers on someone else.
- Cross-device library sync with sign-in (see above), only if the owner asks.
- Consider a coarser default resolution for crowns (at Fine, 0.5 mm, a crown STL is ~70 MB).
