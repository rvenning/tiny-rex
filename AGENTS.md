# Tiny Rex agent guide

## Where to work

The original, still-playable version is at repository root. The Phaser 4
rebuild is in `phaser/`; it deliberately imports **no Game Kit modules**.
Do not remove the original until Robert reviews and approves the migration.
Use a branch and PR. Robert will perform the final review; do not merge.

## Commands

```sh
cd phaser
npm ci
npm run dev
npm test
npm run build
npx playwright install chromium webkit
npm run smoke
```

The Vite URL includes `/tiny-rex/phaser/`. `npm run preview` serves the actual
production build; PWA smoke tests use this, not the dev server. At repository
root, `node --test` runs the preserved original's 32 tests.

## Code map

- `src/main.ts`: Phaser bootstrap, scale policy, service-worker registration.
- `src/scenes/BootScene.ts`: bake procedural artwork to textures once.
- `src/scenes/MenuScene.ts`: illustrated hero scene behind accessible menus.
- `src/scenes/PlayScene.ts`: runtime sprites, input, HUD and event feedback.
- `src/game/config.ts`: typed dimensions, rules and presentation limits.
- `src/game/content.ts`: authored species, worlds, hunts and growth tables.
- `src/game/simulation.ts`: independent seeded game rules, no DOM or Phaser.
- `src/game/types.ts`: explicit entities, player, events and results.
- `src/art/painters.js`: original illustration assets adapted to ES modules;
  keep their presentation-only contract. This JS asset is intentionally reused.
- `src/art/textures.ts`: animation and texture generation; no per-frame uploads.
- `src/platform/`: local saves, optional Firebase sync, synthesized audio.
- `src/ui/`: accessible scrollable menus and native name/PIN forms.
- `tests/`: pure rules tests and real browser smoke tests.

## Changing the game

New behavior starts in typed content/config or pure rules. Emit a typed event
for feedback; let PlayScene consume it. Add meaningful rules tests for changed
invariants. Keep all creatures on the fixed logical arena so size remains
legible. Touch targets >=48px, single-pointer movement ownership, pause on
visibility loss, safe-area layout and reduced-motion support are required.

Save keys `trex_*` and cloud collection `tinyrex` are compatible with the
original. Never reset or rename existing saves. Merge best fields with maximum
and discoveries with union. Never point automated browser tests at real family
data: smoke tests block Firebase endpoints and use an isolated browser context.

Before a PR, run rules tests, build and Chromium/WebKit smoke tests, inspect
responsive screenshots, and update `docs/phaser-migration.md` plus
`docs/game-kit-2-findings.md`. Physical iPad testing must be reported separately
from WebKit emulation. Do not claim a 60 FPS device result from a headless run.

## Deployment

GitHub Actions builds the original plus `phaser/dist` at `phaser/` in a Pages
artifact, preserving both routes. PRs run verification; Pages publication
occurs only after merge into main. Do not send a newsletter for this experiment.
