# Crown design brief (a prompt for designing Antler Forge crowns)

You are designing the crown part of an antler crown: a single 3D-printed piece that sits on the head, carries two
antlers at the temples, and must read as an object **someone purposefully made**: an elvish or fantasy jeweller's
piece, not a pile of organic parts. The antlers are done and stay as they are. Your job is the crown: its
composition first, then the execution of every line, join and ending. Composition without execution still looks
amateur; that is where previous attempts fell short.

## What "good" means here

Hold every design to the references the owner accepted: Weta Workshop's Thranduil crowns (Daniel Falconer),
the Renly Baratheon antler crown (Game of Thrones), Lalique's horn tiara combs (1903–04), kokoshnik tiaras, and
the owner's reference 4 (a V at the brow with heart-lobed arches rising into the antlers). What they share:

1. **One primary line** that everything else hangs from, calm and continuous.
2. **A dominant focal point on the centre line at the brow**, with subdominant elements flanking it and
   subordinate detail graduated toward the ends: three tiers, never a crowd of equals.
3. **An eye path**: the viewer's eye enters at the focal point, travels along lines that hand off tangentially
   (never at arbitrary angles), up into the antlers, and is returned to the centre.
4. **Proportion**: the crown is roughly 1/1.6 to 1/2 of the antlers' height, not a thin strap under them.
   Size every element as a fraction of the antler height so this holds for every species and fit scale.
5. **Designed negative space**: openings are shapes in their own right (almonds, lancets, hearts), in a
   graduated sequence, not leftovers.
6. **A quiet back**: the back arc is thinner, lower and plainer, so it never competes with the front.
7. **Contrast**: made against grown, calm against active, thick against thin, straight-ish against curved.

## Execution: where the craft is (don't skip these)

- **Line quality.** Curves must be fair: curvature changes smoothly (G2, no kinks or wobbles), with a clear
  character: the S-curve (Hogarth's line of beauty) for movement, the arc for rest, the whiplash (Art Nouveau)
  for energy. Build them from few, well-placed controls, and check curvature, not only position.
- **Stroke modulation.** A jeweller's line swells and thins like a pen stroke: thicker on the outside of a
  bend and where it carries load, fining toward its end. No constant-radius tubes: that is what reads as
  piping on a cake.
- **Sections.** A round section reads as hose. Use lenticular or leaf sections (wide across the face, thin
  front to back), a soft ridge or spine along a blade, and a flattened back where it meets the head. Blades
  catch light; tubes don't.
- **Junctions.** Where one element grows from another it leaves tangentially, like an antler tine or a plant
  stem, with a fillet proportional to the smaller member. Where lines cross, one passes over the other
  (layering with a little relief), or they merge on purpose into a node. Never a blob where things happen
  to meet.
- **Terminals.** Every free end is designed: a point that fines on a curve, a scroll that tightens
  (logarithmic spiral), a bud, a drop, a leaf tip. Stubby, blunt or accidental ends are the surest sign of
  an unmade object.
- **Relief and depth.** A crown is not a drawing wrapped on a skull. Upper elements stand off the head (a
  tiara's centre stands up); layers overlap front to back; that depth throws shadows and reads from ¾.
- **Rhythm.** Repeated elements follow a progression (sizes and spacings in a steady ratio, for example
  each 0.8 of the last), in odd counts, graduated away from the focal point.
- **Restraint.** Fewer, better elements. If a part doesn't serve the hierarchy or the eye path, remove it.

## Form & finish (the `character` slider)

One composition, several shape languages, not just surface finish (it applies to the antlers too):
- **Gnarled, biomechanical (0):** H.R. Giger: vertebral, ribbed and hooked, deep grain and knobs along every
  piece, claw terminals, taut sinewy curves.
- **Natural antler (0.3):** the refined crown forms with the species' antler grain. Every species starts here.
- **Polished (½):** long fair curves, lenticular blades, fine tapering points, smooth skin, no grain.
- **Faceted (1):** the same smooth curves, swept with a diamond section instead of a circle: two facets meeting
  in a ridge on the outer face, a round back against the head, polished edges.
The silhouette itself should change across the range, not just the texture.

## Hard constraints

Everything in CLAUDE.md's invariants: one watertight solid; fits the P2S (the crown's decoration may shorten
when it must, never the band); nothing inside the head; crown strands at least 6 mm thick and tines at least
6 mm at the base (`STRAND_MIN`, `TINE_BASE_MIN`); printable upright on supports. Design within these from the
start: sturdiness is part of the design, not a clamp applied after.

## Process

1. **Study before drawing.** Look at the references and at related fine jewellery (Lalique, Mucha for
   Fouquet, Georg Jensen, Cartier tiaras) as images, not descriptions. For each, write down its primary line,
   focal point, tiers, eye path, proportions and terminals.
2. **Design the front elevation in 2D first**, as a jeweller's flat template (`flatStroke` in
   `src/antler-core.js`: strokes in s mm along the band and h mm up from it). Sketch at least three distinct
   concepts, each a clear idea stated in one sentence, and render them flat.
3. **Critique in silhouette** with `tools/silhouettes.js` (worn: the head hides what's behind it): front,
   ¾, side, back, top. Score each concept against the list above, with numbers where they exist: crown to
   antler height ratio, focal size relative to flanks, tier count, symmetry, and whether any element fails
   to serve the eye path. Keep a short written critique for every iteration.
4. **Choose one and execute it**: modulation, sections, junctions, terminals, relief. Build it in the engine,
   render it shaded at final quality in the page (front, ¾, side, close-ups of junctions and terminals), and
   compare side by side with the references at the same angle.
5. **Iterate on the weakest point**, one at a time, re-rendering silhouettes and shaded views each time.
   Stop when every item in the "execution" list holds up in a close-up.
6. **Only then** extend it to the Character range and to other species, and check every combination
   stays one watertight solid that fits.
7. **Show the owner** the silhouette sheet, the shaded views and the critique, and say plainly what is
   still weak.

## Face readings (from the sketchbook)

A crown sits above a face, so symmetric shapes get read as features: a centre dip with rising sides is a
moustache, slanted lines are eyebrows, feathered edges are eyelashes, loops are a bow tie, a row of ovals is
teeth, a deep horns-up curve is a smile, points hanging at the temples are fangs. Prefer forms with their own
body, accents that rise, and elements behind the head. Sketch over the head (`tools/sketchbook.js`) before
building anything.

## Avoid (seen in earlier attempts)

Constant-radius round tubes; strands running parallel; strands laid along the head at a fixed offset (piping);
many small equal bumps (a jumble) or evenly spaced verticals (a picket fence); a flat horizontal band across the
forehead; an empty centre; blobs at junctions and stubby ends; clusters used as filler; thin needles as a focal
point; decoration that is too small to register next to the antlers.
