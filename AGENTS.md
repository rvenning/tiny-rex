# Tiny Rex agent guide

## Where to work

Tiny Rex is a Phaser 4 + TypeScript/Vite app at repository root. The public
route stays `/tiny-rex/`. It deliberately imports **no Game Kit modules**.
On 9 October 2026 Robert approved the isometric adventure rebuild: one connected world with permanent growth and
species unlocks that REPLACES Endless Feast (no classic mode). See `docs/isometric-adventure.md` and
`review-checkpoint.md`. The former game is recoverable from Git history (`29cdefb`).
Use a branch and PR. Robert performs the final review; do not merge.

The game is now an action RPG (permanent species per character, several characters per profile, mutation loot, skill tree,
quests, bosses). Rules live in `src/rpg/`, the simulation in `src/adventure/`, authored content in
`src/adventure/content/`; see `docs/arpg/` and `docs/isometric-adventure.md`. Save keys: `trex_chars_v2_<profile>` (new,
per-character, with backup/good copies) beside the untouched legacy `trex_adventure_v1_*`.

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
  keep their presentation-only contract. All creature sprites now use painted sheets; this module supplies shared shadows.
- `src/art/storybook.ts`, `landscape.ts`, `assets/`: painted dinosaur/prop atlases,
  calibrated sprite cuts and cached valley scenery.
- `src/art/textures.ts`: animation and texture generation; no per-frame uploads.
- `src/platform/`: local saves, optional Firebase sync, synthesized audio.
- `src/ui/`: accessible scrollable menus and native name/PIN forms.
- `tests/`: pure rules tests and real browser smoke tests.

## Changing the game

New behavior starts in typed content/config or pure rules. Emit a typed event
for feedback; let PlayScene consume it. Add meaningful rules tests for changed
invariants. Classic mode retains its fixed logical arena. Adventure rules live
in `src/adventure/` and rendering/input in `src/scenes/AdventureScene.ts`.
Keep growth and threat sizes legible. Touch targets >=48px, single-pointer movement ownership, pause on
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
occurs only after merge into main. The repository Pages source is GitHub Actions, verified on 7 October 2026. Do not send a newsletter for this experiment.
