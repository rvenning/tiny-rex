# Tiny Rex agent guide

## Where to work

Tiny Rex is a Phaser 4 + TypeScript/Vite app at repository root. The public
route stays `/tiny-rex/`. It deliberately imports **no Game Kit modules**.
Robert requested Endless Feast only: no campaign screens or unlock gate.
The former game is recoverable from Git history (`29cdefb`).
Use a branch and PR. Robert will perform the final review; do not merge.

## Commands

```sh
npm ci
npm run dev
npm test
npm run build
npx playwright install chromium webkit
npm run smoke
```

The Vite URL includes `/tiny-rex/`. `npm run preview` serves the actual
production build; PWA smoke tests use this, not the dev server. `npm test` runs rules, save-merge and migration regression tests.

## Code map

- `src/main.ts`: Phaser bootstrap, scale policy, service-worker registration.
- `src/scenes/BootScene.ts`: load painted art and bake textures once.
- `src/scenes/MenuScene.ts`: illustrated hero scene behind accessible menus.
- `src/scenes/PlayScene.ts`: runtime sprites, input, HUD and event feedback.
- `src/game/config.ts`: typed dimensions, rules and presentation limits.
- `src/game/content.ts`: species, worlds, legacy regression fixtures and growth tables.
- `src/game/simulation.ts`: independent seeded game rules, no DOM or Phaser.
- `src/game/types.ts`: explicit entities, player, events and results.
- `src/art/painters.js`: original illustration assets adapted to ES modules;
  keep their presentation-only contract. The remaining insects use these painters.
- `src/art/storybook.ts`, `landscape.ts`, `assets/`: painted dinosaur/prop atlases,
  calibrated sprite cuts and cached valley scenery.
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

GitHub Actions publishes `dist/` at the existing `/tiny-rex/` route. PRs run verification; Pages publication
occurs only after merge into main. The repository currently uses branch-based
Pages; selecting **GitHub Actions** as the Pages source is a review/deployment
step before accepting the PR. Do not send a newsletter for this experiment.
