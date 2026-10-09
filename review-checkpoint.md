# Review checkpoint — Fern Hollow opening is playable (2026-10-10)

Branch `rebuild/isometric-world` (local, not pushed). Live game and the draft PR are untouched.
Preview: `npx vite --host 127.0.0.1 --port 8125` then http://127.0.0.1:8125/tiny-rex/ (choose a profile, Continue).
Isolated screenshots (Firebase + websockets blocked, throwaway storage): `node tools/qa/shot.mjs out.png 1448 1086 [x,y]`.

Screenshots: `docs/review/01-opening-d.png` (start nest), `docs/review/02-perch-raptor.png` (raptor recovery window, "bite now" prompt).

## State
- Adopted Codex's repaired snapshot (compiling build, packed Rex x4 / raptor / trike / prey atlases, 117 Hollow ground tiles,
  save migration, 61 passing unit tests). The connected six-region world (`public/world-connected`) is NOT adopted; its two tests fail until then.
- This pass: closer camera (hatchling ~13% of width, stage zoom 1.35/1.2/1.05/0.92), warm light + forest vignette,
  a real start nest with eggs, ringed boulders, layered fern/broadleaf/flower fringe (`tools/world/dress_hollow.py`, art-only, no collision change).

## Gaps vs the approved mockups (next)
1. Ground bake: bare dirt expanse with evenly spaced identical grass tufts, straight grass/dirt seam, flat turquoise creek
   (no rocks/foam), no dapple from canopy. Needs a Hollow re-render with a smaller clearing, irregular edges, clustered clutter, shoreline rocks.
2. Rex art: apex still shows pale curved neck marks; materials are acceptable at game size but not yet the reference's integrated markings.
3. Audio mix, physical iPad performance, human playtests, other regions: unverified / not done.
