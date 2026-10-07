# Tiny Rex: Phaser discovery and migration

## Source and strategy

Source: Robert's local `D:/OneDrive/Documents/Claude Code/tiny-rex`, commit
`29cdefb` (version 5). The working tree was clean. The complete original stays
at repository root; the experiment lives in `phaser/`. No Game Kit code is
loaded by the experiment. Publication will expose a separate `/phaser/` route,
so rollback is simply returning to the original URL.

## Discovery before implementation

The original is a no-build JavaScript application. `main.js` orchestrates DOM
screens; `game.js` is a seeded, DOM-free simulation; `render.js` owns a canvas,
its animation loop and pointer input. `creatures.js` and `levels.js` contain the
authored content. `art.js` is a substantial procedural illustration asset,
including individual species painters, four valley palettes, cached background
and foreground layers, and a distinctive jade Rex with cream belly.

There are no external sprite sheets or audio recordings. The three PNG icons
are the only raster assets. Audio is synthesized with Web Audio. CSS and the
Baloo font provide warm, rounded chrome. Game Kit supplies storage, anonymous
Firebase sign-in, field-wise maximum save merging, profiles/PINs, screens,
effects, audio primitives, PWA installation and debugging.

The root service worker uses a manually versioned network-first shell cache.
The manifest requests portrait standalone mode. The renderer fits a fixed
360 × 560 valley into the available space, caps DPR at 2, follows tap/drag
targets, pauses when hidden and responds to visual viewport changes.

All 32 original Node tests passed before new game rules were written, including
seeded campaign bots, content fairness and two-device storage merges.

## Behavior contract

The player repeatedly asks: **is that smaller than me?** Smaller is edible,
same size is harmless, bigger costs a heart, armour is never food. Plants are
always edible. Growth retains overflow, and getting caught retains size with
2.2 seconds of grace. Ordinary creatures cannot outrun Rex; named beasts sprint
and tire. Every stage has safe fallback food. Three hearts determine stars.

Twenty hunts span Fern Hollow, Bone Gulch, Spike Ridge and Thunder Basin, each
with a named finale. Hunts unlock in order. Endless Feast unlocks after five
wins, caps growth at tier 5 and ramps hunger and population over waves. Dino
Book records encounters; losing does not unlock hunts. Results bank maximum
stars/scores. `trex_profiles`, `trex_settings`, `trex_progress_<id>` and
`trex_deleted` remain compatible, using the existing `tinyrex` Firestore
collection. Profile PINs are family convenience controls, not authentication.

## Design budget

All gameplay remains visible simultaneously. Preserve size separation and the
110-pixel proximity cue; decoration must not cover a collision-sized creature.
Warm gold indicates food, coral indicates danger, jade locates Rex. Touch
targets must be at least 48 CSS pixels on menus; only one pointer owns movement.
Reduced motion suppresses decorative movement, camera shake and feedback
tweens without changing simulation speed.

## Implementation direction

Use Phaser scenes, generated texture atlases from the original illustration
painters, Images/Sprites, camera feedback, tweens and input. Do not refresh a
full-screen canvas texture each frame. Author a typed simulation independent of
Phaser, typed declarative content and independent platform services. Native
HTML forms are appropriate for names/PINs and accessible scrollable menus;
the arena and HUD belong to Phaser. User subsequently authorized substantial
art/gameplay improvement; retain the recognizable contract as the baseline.

## Verification log

Original browser play, new browser play, viewport matrix, offline installation,
rule comparisons, build and performance measurements are recorded below as
they are completed. Automated browser checks cannot establish physical iPad
latency, Safari audio behavior or install experience; those require real-device
verification.

## Final scope after Robert’s review

Robert asked to remove the campaign, improve dinosaur/scenery art, add visibly
opening jaws and replace the original at the existing URL. The final app is
Endless Feast only, immediately available in any of four selectable valleys.
Profiles, saves, book and family bests remain. Existing campaign records are
retained in saves but not shown or played. The 20-hunt fixtures and independent
legacy player model remain only as rules-migration regression coverage.

The TypeScript app is now at repository root. The old runtime, Game Kit copies,
manual service worker and old build scripts are removed; their original state
is recoverable from commit `29cdefb`. Vite produces `dist/`, and GitHub Actions
deploys that artifact at `/tiny-rex/` after review/merge. No second public route
or side-by-side game is deployed. Pages must be set to GitHub Actions before
accepting the PR; live hosting settings have not been changed here.

The new service worker cleans only `tiny-rex-v<number>` legacy caches, leaving
other family games’ caches and all local storage intact. Motion, focus,
multi-touch ownership, visibility pause and independent cloud/save boundaries
were checked. Browser tests block remote cloud endpoints and do not create
fake family profiles on the live site.

## Verification of the final replacement

- Production TypeScript check and Vite/PWA build pass; 20 shell/art entries are
  precached, approximately 3.6 MiB before transport compression.
- 15 rules/save tests pass, including all original campaign fixtures through an
  independent legacy player oracle, unlimited growth and bounded late populations.
- 25 Chromium/WebKit browser checks pass; one explicitly skipped WebKit offline
  navigation check documents Playwright issue #42775. Both engines validate
  cache registration and safe root-cache migration; Chromium reloads/plays offline.
- Phone portrait/landscape, iPad portrait/landscape and desktop layouts checked;
  real pointer feeding, pause/resume/restart/quit, settings/saves, book, family
  scores and multi-touch/cancellation work. Real catches show closed/open jaw
  frames through read-only animation diagnostics.
- Screenshots inspected for all four new painted valleys. Twelve repeated feast
  starts/quits leave pointers at 4, textures at 30, and Play display objects at 0.
  The diagnostic accessor also handles destroyed scene objects safely.
- Desktop GPU (GTX 1070, ANGLE D3D11): approximately 59 FPS, median frame interval
  16.7 ms, p95 17.9 ms. Estimated active texture pixels occupy 70.8 MiB in Hollow,
  around 80.3 MiB when another valley and the menu background are retained.
  These are texture pixel estimates, not measured total process/GPU memory.
- Production dependency audit reports zero known vulnerabilities.

Physical iPad Safari/audio/installation, sustained device frame budget and live
Firebase writes were not verified. These are final review items, not claimed
successes from browser emulation. The branch is published as an unmerged PR.
