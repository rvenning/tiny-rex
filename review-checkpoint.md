# Review checkpoint: Fern Hollow is playable (2026-10-10)

Branch `rebuild/isometric-world` (draft PR against `main`; live game unchanged, merge is Robert's call).
Preview: `npm ci && npm run dev -- --port 8125`, then http://127.0.0.1:8125/tiny-rex/ (pick a profile, Continue).
Screenshots come from an isolated browser (Firebase and websockets blocked, throwaway storage): `node tools/qa/shot.mjs out.png 1448 1086 [x,y]`.

| Screenshot | Shows |
| --- | --- |
| `docs/review/01-opening-d.jpg` | start nest, clustered ground clutter, layered fringe (compare `art-reference/01-early-fern-hollow.png`) |
| `docs/review/02-perch-raptor.jpg` | raptor recovery window and "Vulnerable · bite now" prompt, mossy rocky bank |
| `docs/review/03-ipad-landscape.jpg`, `04-ipad-portrait.jpg` | responsive HUD at 1366x1024 and 820x1180 |
| `docs/review/05-title.jpg` | title over the live valley |
| `docs/review/06-waterfall-pool.jpg`, `07-log-arch.jpg` | waterfall pool with columnar cliff; fallen-log arch (props fade when they hide the hatchling) |

## What changed in this pass
- Adopted Codex's repaired snapshot (compiling, packed atlases, 117 ground tiles, save migration). Connected six-region world (`public/world-connected`) is NOT adopted; 2 tests that need it are skipped.
- Camera closer (hatchling ~13% of width), warm light + forest vignette, title scrim.
- Ground re-baked (35 tiles around the opening): clustered tufts/clover/pebble fields instead of an even grid, ragged dirt/grass edges, stones through the shallows. Start nest with eggs, ringed boulders, denser fern/broadleaf fringe (`tools/world/dress_hollow.py`).
- Apex Rex claw-scar markings softened and re-rendered; props that hide the player fade; open-book icon; ambient jungle bed (wind, water proximity, birds, insects) and impact sounds.
- Verification: `tsc` clean, 61 unit tests pass (2 skipped), production build passes (65 precache entries, ~9.7 MiB).

## Known gaps
1. Large flat dirt expanse east of the nest still reads bare next to the mockup; creek bank foam is saw-toothed; no canopy dapple on the dirt.
2. Rex stages 0-2 markings not revisited; portraits are crops of idle frames.
3. Other regions (River to Caves) exist only in Codex's copy; physical iPad performance, audio mix and human playtests are unverified. Tests do not prove fun.
