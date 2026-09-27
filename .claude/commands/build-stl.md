---
description: Build the right and mirrored left STL plus print notes for a preset
argument-hint: <preset> [--name value ...]
allowed-tools: Bash(node tools/build-antlers.js *)
---

Build a printable pair for the preset and overrides in: $ARGUMENTS

1. If no preset was given, or it isn't one of the names printed by
   `node tools/build-antlers.js --list-presets`, show that list and stop.
2. Run `node tools/build-antlers.js --preset <preset> --out dist/stl/<preset> <any other arguments>`.
   Pass extra `--name value` overrides through unchanged (for example `--mount clip --hbWidth 15 --res 0.35`).
   Keep the default 0.5 mm voxels unless a `--res` was given.
3. Report the design, size, printer and check lines, and the paths of the three files written
   (`*-right.stl`, `*-left.stl`, `*-print-notes.txt`).
4. Treat the build as good only if the exit code is 0 and it printed `watertight YES` with
   `shells 1`. Otherwise say it failed, show the check line, and don't suggest printing it.
   If it printed `DOES NOT FIT`, say so and suggest turning autoFit back on or lowering `--scale`.

Don't edit any source files for this command.
