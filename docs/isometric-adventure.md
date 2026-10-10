# Tiny Rex — isometric action RPG

The adventure replaces the old Endless Feast: there is no classic mode. Family profiles, PINs and the old `trex_progress_*`
records are untouched. Each profile owns several **characters** (`trex_chars_v2_<profile>`); the single-record adventure
(`trex_adventure_v1_<profile>`) is read once to create characters and is never rewritten. See `docs/arpg/` for the audit,
design contracts, story bible and progress/honesty log.

## Play locally

```sh
npm ci
npm run dev -- --port 8125        # http://127.0.0.1:8125/tiny-rex/
# or: npm run build && npm run preview -- --port 4173
```

WASD/arrows move (Shift creeps to stalk), J attacks (hold for the combo), Space or K dodges (dodge *into* a strike for a Perfect
Dodge), E and Q use the two equipped skills, Enter talks or rests at a refuge, I opens Mutations, O Skills, M or Tab the Journal,
Escape pauses. Touch: drag on the left half to steer (a gentle push creeps); action buttons sit under the right thumb.

## Code map

| Area | Where |
| --- | --- |
| Pure rules (no Phaser/DOM) | `src/rpg/` (progression, stats, mutations, effects, skills, loot, character saves, store) |
| Simulation | `src/adventure/sim.ts` (+ `ai.ts` creature behaviour, `skill-impl.ts`, `sim-types.ts`, `bestiary.ts`, `quests.ts`, `guide.ts`) |
| Authored content | `src/adventure/content/` (`hollow.ts`, `river-marsh.ts`, `dunes-ember-caves.ts`, `decor.ts`) |
| Scene and rendering | `src/scenes/AdventureScene.ts`, `src/scenes/adventure/` |
| HUD and menus | `src/ui/hud.ts`, `src/ui/app.ts`, `src/ui/rpg.css`, `src/ui/icons.ts` |
| Tests | `tests/rpg-*.test.ts`, `tests/arpg-*.test.ts`, `tests/helpers/` (sim + combat bot), `tests/browser/` (CI smoke) |

## Pipeline (all scripted, nothing hand-placed in the engine)

| Step | Tool |
| --- | --- |
| World fields, collision, authored composition | `tools/world/worldgen.py`, `hollow.py`, `regions.py` (deterministic, seeded) |
| Collision/height/props export | `tools/world/export.py` → `public/world/world.json`, `world.bin.gz` |
| Art-only dressing | `tools/world/dress_hollow.py`, `dress_regions.py` and, at runtime, `content/decor.ts` |
| Authoring map | `tools/world/map_preview.py` (top-down PNG with labelled positions, used to place quests/encounters on walkable trails) |
| Ground bake | `tools/art/render_world.py` (Blender 4.5, Cycles) → `tools/art/publish_tiles.py` |
| Props and creatures | `tools/art/kit/*`, `tools/art/creatures/*`, `render_props.py`, `pack.py` → `public/art/**` |
| Isolated gameplay screenshots | `tools/qa/*.mjs` (`lib.mjs` seeds a throwaway profile and character; Firebase and websockets blocked) |

One projection (`tools/art/common.py` ↔ `src/world/projection.ts`) is shared by the renderer, the game and the collision grid.

## Gaps

See `docs/arpg/progress.md`. Physical iPad performance, audio mix and human playtests remain open. Tests do not prove fun.
