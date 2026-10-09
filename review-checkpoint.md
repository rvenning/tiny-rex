# Review checkpoint (work in progress, NOT yet playable)

Branch: `rebuild/isometric-world` (local; not pushed; no PR yet). The draft `feature/isometric-adventure` is untouched.
Preview URL: none yet. There are no gameplay screenshots yet; the game does not build at this commit.

## Done
- Shared Blender recipe (`tools/art/common.py`): isometric camera, lighting, 80 px/unit, anchors verified.
- Prop harness + atlas packer + contact sheets (`render_props.py`, `pack.py`, `sheet.py`).
- World generator (`tools/world/`): composed Fern Hollow (creek + waterfall behind, raised rocky bank/perch right,
  log arch left, egg nest by trail, stepping-stone ford), shared terrain/collision/height export, reachability tests.
- Ground renderer (`tools/art/render_world.py`): terrain, water, waterfall shaders (first pass only, still flat).
- `tools/world/compose_preview.py`: cheap terrain + props composite for art review.
- New TS layer: projection, collision grid, world loader, simulation (stalking prey, telegraphed lunges, growth,
  dodge/bite/roar), HUD, scene, app shell. Written but NOT yet compiled or run.
- Five Blender art agents were launched (Rex line, raptor family, other creatures, vegetation, rocks/logs);
  partial outputs in `art-build/` (git-ignored). Early ferns, tree ferns and log arch look promising.

## Known gaps / next steps
1. Run `npx tsc --noEmit`; delete the classic Endless Feast code (PlayScene, game/simulation, legacy art, old tests,
   old `style.css` rules) and fix imports; rewrite `tests/adventure.test.ts`; write new `style.css`.
2. Pack art into `public/art/**` (props + creature atlases) and ground tiles into `public/world/ground/**`
   (slice 2048 renders into 512 tiles; write `tiles.json`); add `public/world/world.json` tile list.
3. Render ground with prop shadows, canopy shadows and baked clutter; shrink the oversized bare clearing.
4. Screenshot in-game vs the mockups, iterate, then expand to other regions.
5. Physical iPad, audio mix, performance and human playtesting are all unverified.
