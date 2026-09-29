# Crown sketchbook

How the Moon, Lotus halo and Roots crowns were designed (2026-09-29): loose gesture thumbnails, critique,
development, refined drawings, then 3D models built from the drawings and compared against them.

Each round is a sheet file here; render one with

```bash
node tools/sketchbook.js docs/crown-sketchbook/01-gestures.js out.html
```

Sketches are pencil-style SVG drawn over the real head and antlers of a standard crown (stag, 22.5 in head),
in front or side elevation, in millimetres, anchored to the antler root. The engine builds the chosen designs
from the same numbers (`MOON`, `LOTUS`, `ROOTS` and `sketchedCrown` in `src/antler-core.js`), mapping each
sketch point onto the actual head (`sketchFrame`), so they adapt to any head size and antler position.

## Rounds and what each taught

1. **Gesture thumbnails (20 ideas, lines only).** Strongest: Crescent, Lyre, Diadem/Ogee, Pendant, Swept,
   Crossing. The big lesson: over a face, a symmetric line that dips at the centre and rises at the sides reads
   as a **moustache** (Heart, Leaf pair, Tide). Picket fences, twig tangles and hairbands read weakly.
2. **Five directions × four.** Crescent works because the moon has its own body. Lines across the forehead read
   as **eyebrows** (Swept) or **eyelashes** (feathered sweep). The lyre and diadem are elegant but close to the
   existing Fleur, so parked. Knots read as a moustache again, or a bow.
3. **Crescent and Infinity developed.** The moon cradling a pearl is the most iconic idea so far. Streaming horns
   become a giant moustache from the front. Every infinity/knot reads as a **bow tie**: rejected.
4. **Going back for more families.** Petals fanning *behind* the head (a halo) is the find: it sits behind the
   face instead of on it. Swags and twin serpents fail (moustache, eyebrows); a gate reads as a house; rosettes
   at the temples read as eyes.
5. **Sun and a third family.** Pointed petals (a lotus) beat rounded ones (they float) and a disc (headband).
   Seeds read as **teeth**; pods as a moustache; a fringe is fussy at wearable size.
6. **Roots, revisited** (untested since round 1). Two roots per side meeting at the brow around a seed read as
   grown, not made, when they're long and few; a braid is a tangle.
7. **Refined sketches** (front, side, details). The moon at 16 mm deep reads as a **smile**; the lotus drawing
   cheated (the head hides the petals' lower halves); the temple roots hung like **fangs**.
8. **Corrected.** Moon 13 mm deep with steeper horns and a larger pearl; lotus drawn with the head occluding it
   (it reads as a crown's points rising behind the head, and from the side as a peineta comb); temple roots sweep
   back toward the ears.
9. **Models against the sketches.** The drawings' lines laid over the built crown in the same frame. Fixes it
   drove: the pearl floated 4 mm off the crescent (seated it); the horn tips were placed on the crown of the head
   (points above the head's outline: the solver now stays on the front); lotus petals leaning back 12° shrank
   the antlers to fit the bed (now near upright); the centre petal was skipped as if in an open back's gap;
   petals were built in a plane that swung forward into the head (now tangent to the back of the head); antler
   tines diving into the forehead left slivers (dropped on crowns).
10. **Joins at the antler roots.** The moon's horns run up the inside of the antler into its collar (good); the
    temple root dropped into a hook behind the antler (now dips and lifts back along the temple).

## The three designs

- **Moon:** a crescent with body (13 mm deep at the centre), its horns tucked into the antler roots, a pearl
  seated in its bowl. Section: a lens with a ridge on the face, round against the head.
- **Lotus halo:** a quiet band in front; five openwork petals (6 mm edges and a vein, graduated ×0.82) stand
  behind the head, so from the front their tips rise between the antlers like a halo.
- **Roots:** roots from each antler meet at the brow in a knot holding a seed; one root dips back over each
  temple; the back band continues from the antlers round the head.
