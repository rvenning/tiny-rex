# Tiny Rex · Endless Feast

Start tiny, eat anything smaller, dodge anything bigger and grow into a Mighty Rex.
Endless Feast is the whole game: no campaign, unlock gates or finish line.
Choose Fern Hollow, Bone Gulch, Spike Ridge or Thunder Basin before your run.

The Phaser 4.2.1 + TypeScript/Vite app lives at repository root and replaces
the former game at **https://rvenning.github.io/tiny-rex/** when this PR is accepted.
The former app is recoverable from Git history at `29cdefb`.

## Run locally

```sh
npm ci
npm run dev
```

Open the printed `/tiny-rex/` URL. Tap or drag to move; arrows/WASD also work.
Escape/Space pauses. Profiles and menus support native keyboard controls.

```sh
npm test
npm run build
npx playwright install chromium webkit
npm run smoke
npm run preview
```

Production files are in `dist/`. Serve them at `/tiny-rex/`, not from a file URL.
GitHub Actions verifies PRs and deploys `dist/` only after a merge into main.
Before accepting the PR, select **GitHub Actions** in Settings → Pages →
Build and deployment. This PR does not change the current live Pages configuration.

## What’s included

- Six-frame painted dinosaur locomotion, idle breathing, visible jaw-open
  chomping/chewing, growth feedback and reduced-motion controls.
- Painted berry bushes, curled ferns, rocks, foliage and four distinct valleys.
- Seven growth sizes, hunger/shrinking, escalating waves and bounded populations.
- Family profiles/PINs, local saves, optional cloud sync, personal/family bests
  and the Dino Book. Existing `trex_*` saves and campaign records are preserved.
- Installable offline PWA; updates wait for player approval outside a feast.

Phaser owns rendering, scenes, input, animation, HUD, tweens, camera effects
and particles. Accessible HTML owns forms and scrollable menus. Game rules,
storage/cloud adapters and synthesized audio are explicit independent modules.
There is no Game Kit runtime dependency.

Tests use isolated profiles and block Firebase endpoints; live cloud writes are
not part of automated verification. Original campaign fixtures remain solely
as migration regression tests and are never reachable from the game UI.

Playwright’s WebKit offline navigation has an upstream defect
([#42775](https://github.com/microsoft/playwright/issues/42775)). WebKit tests
registration, caching, input and layouts; Chromium additionally tests offline
reload/play. Physical iPad Safari/PWA installation and sustained device FPS
remain on-device review tasks.

See [the agent guide](AGENTS.md), [migration notes](docs/phaser-migration.md),
[architecture findings](docs/game-kit-2-findings.md) and [art notes](docs/art-direction.md).
