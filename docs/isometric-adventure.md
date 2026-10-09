# Tiny Rex — isometric adventure (rebuild branch)

The adventure replaces the old Endless Feast: there is no classic mode. Family profiles, PINs and the old
`trex_progress_*` records are untouched (the adventure keeps its own versioned record, `trex_adventure_v1_<profile>`,
`world: 2`). Robert approved the design and mockups on 9 October 2026; merge is his decision.

## Play locally

```sh
npm ci
npm run dev -- --port 8125        # http://127.0.0.1:8125/tiny-rex/
# or: npm run build && npm run preview -- --port 4173
```

WASD/arrows move (hold Shift to creep and stalk), J bites, Space/K dodges, E/L uses the species skill, Enter rests at a
nest, Escape pauses. Touch: drag on the left half to steer (a gentle push creeps), action buttons on the right accept
other fingers. The journal button opens the map, creature book and discoveries.

## Pipeline (all scripted, nothing hand-placed in the engine)

| Step | Tool |
| --- | --- |
| World fields, collision, authored composition | `tools/world/worldgen.py`, `hollow.py`, `regions.py` (deterministic, seeded) |
| Collision/height/props export | `tools/world/export.py` → `public/world/world.json`, `world.bin.gz` |
| Art-only dressing (start nest, fringe) | `tools/world/dress_hollow.py` |
| Ground bake (terrain, water, clutter, prop shadows) | `tools/art/render_world.py` (Blender 4.5, Cycles) → `tools/art/publish_tiles.py` |
| Props and creatures | `tools/art/kit/*`, `tools/art/creatures/*`, `render_props.py`, `pack.py` → `public/art/**` |
| Preview without 3D re-render | `tools/world/compose_preview.py` |
| Isolated gameplay screenshots | `tools/qa/shot.mjs`, `tools/qa/splash.mjs` (Firebase and websockets blocked) |

One projection (`tools/art/common.py` ↔ `src/world/projection.ts`) is shared by the renderer, the game and the
collision grid, so heights, sprite feet and walkable ground cannot drift apart. Camera: orthographic true-isometric
(35.264°), 80 px/unit rendered, shown at ~1.35× for the hatchling.

## Gaps

See `review-checkpoint.md`. Physical iPad performance, audio mix, human playtests and the unadopted connected world
(`public/world-connected`, in Codex's copy) remain open. Tests do not prove fun.
