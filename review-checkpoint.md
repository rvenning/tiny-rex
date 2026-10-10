# Review checkpoint: connected world is live-ready (2026-10-10, second pass)

Branch `polish/hollow-ground` (on top of merged PR #3). Run: `npm ci && npm run dev -- --port 8125`.
Isolated captures: `node tools/qa/shot.mjs out.png 1366 1024 [x,y]` (Firebase blocked, throwaway storage).

## Fixed from your reports
- **Stuck at "Cross the shallow ford into Reed Marsh":** the objective chain assumed six regions but the deployed world only contained Fern Hollow. The full connected world (Riverbend, Reed Marsh, Sunscar dunes, Ember Basin, Echo Caves; 322 ground tiles) is now the active world, and the Hollow creek ford route was re-opened in the connected layout (`tools/world/export.py` CARVES; a half-unit pinch had cut off the ford and fossil shelf).
- **No way to know where to go:** objectives now have a target. A pulsing arrow beside the player follows an A* route over the real collision grid (`src/adventure/guide.ts`), the minimap shows the route and a goal marker, and the objective chip shows the distance.
- **Triceratops did nothing:** the player sprite only swapped on growth stage, not species. Fixed.
- **Resizing lost the plot:** the canvas CSS box lagged one resize behind the window. Fixed (`src/main.ts`, `tools/qa/resize.mjs`).
- **Static environment / static waterfall:** plants sway in a travelling wind and bend away from anything walking through them; the waterfall has streaming water and mist; water glints, ripples when wading, drifting leaves and pollen, cloud shadows, light shafts and passing birds. Desktop sample: median 16.7 ms/frame (headless Chrome, not an iPad result).

## Art
- Fern Hollow ground re-baked: clustered clutter, ragged dirt/grass edges, dappled canopy shade on the dirt, deeper smoother water with a finer shoreline.
- Ember Basin: glowing lava fissures through basalt. Marsh/Riverbend: reed lanes, cattails, lily pads, ferns (`tools/world/dress_regions.py`, art-only).
- All tiles re-published with seam gutters (322 WebP, 6.9 MiB).

| Screenshot | |
| --- | --- |
| `docs/review/01-opening-d.jpg` | Fern Hollow opening |
| `docs/review/06-waterfall-pool.jpg` | waterfall pool (animated at runtime) |
| `docs/review/08-reed-marsh.jpg`, `09-ember-basin.jpg`, `10-dunes.jpg` | new regions |
| `docs/review/11-objective-arrow.jpg` | objective arrow and distance |

## Honest gaps
- Sunscar dunes and Echo Caves are bare: sand/rock with few props and no biome-specific plants or rock kit; Riverbend still has a large dirt expanse; the non-Hollow ground tiles are half resolution.
- Creek bank foam, Rex stages 0-2 markings, physical iPad performance, audio mix and human playtests are unverified. Tests do not prove fun.
