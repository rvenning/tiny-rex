# Tiny Rex: Phaser discovery and migration

## Isometric adventure branch, 9 October 2026

After Robert approved the visual/gameplay proposal, `feature/isometric-adventure`
adds a separate pure simulation and Phaser scene for a six-region connected world.
The original Endless Feast remains playable. Adventure saves use an additive
versioned record and preserve legacy progress. Rules tests cover growth, combat,
gates, species and deterministic actors; adapter tests cover concurrent merges,
tombstones and corrupt-save recovery. See [development notes](isometric-adventure.md)
for controls, asset production and the remaining release work.

Blender source models and render/pack scripts are committed with WebP exports.
Concept mockups were approved and saved in Notion; production art is still less
detailed. Current combined texture-pixel estimate is about 91.6 MiB, including
retained classic/menu art. This is not total GPU/process memory. Headless browser
FPS under concurrent tests does not establish desktop or physical iPad performance.
Live cloud writes and physical iPad testing remain unverified.

Validation for this iteration: 48 rules/save tests pass; production build passes;
full browser suite reports 44 passed and two existing WebKit offline skips.
Windows WebKit composited screenshots omit the resized WebGL canvas, matching
[Playwright issue 42885](https://github.com/microsoft/playwright/issues/42885).
A test-only preserved-buffer diagnostic produces the actual rendered world and
checks pixel diversity; it does not replace physical Safari visual review.
The two additional rendered-pixel checks pass in Chromium and WebKit.
An isolated 12-second idle sample in headless Chromium forced to the desktop
GTX 1070 / ANGLE D3D11 reports about 59 FPS at 1024×768. Default headless
SwiftShader is much slower. This short idle sample does not establish sustained
combat performance or any iPad result.

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
or side-by-side game is deployed. Pages is now set to GitHub Actions (verified through the GitHub API on 7 October).

The new service worker cleans only `tiny-rex-v<number>` legacy caches, leaving
other family games’ caches and all local storage intact. Motion, focus,
multi-touch ownership, visibility pause and independent cloud/save boundaries
were checked. Browser tests block remote cloud endpoints and do not create
fake family profiles on the live site.

## Verification of the final replacement

- Production TypeScript check and Vite/PWA build pass; 22 shell/art entries are
  precached, approximately 4.2 MiB before transport compression.
- 29 rules/save/sync tests pass, including all original campaign fixtures through an
  independent legacy player oracle, growth capped at Prowler with larger predators retained and bounded late populations.
- 30 Chromium/WebKit browser checks pass; two explicitly skipped WebKit offline
  navigation checks documents Playwright issue #42775. Both engines validate
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

## PR review follow-up, 7 October 2026

All twelve review findings are addressed. Leaderboard output escapes avatars; local and remote profile/progress reads validate rendered fields. Profile edits queue only the changed record. Reconnect compares semantic data and only queues missing tombstones or changed progress. Firestore transactions preserve a newer remote profile, merge the latest best scores, and prevent a concurrent tombstone from resurrecting a player. Anonymous sign-in failure leaves the rules to decide Firestore access. Mocked SDK tests cover these races without accessing live family data.

Restart records the current run before starting afresh. Keyboard release stops its own target; pointer steering retains ownership independently. Moving Rex resets idle breathing scale. The legacy parent PIN 7777 is restored and explained in Help; plaintext family PINs remain convenience locks. Root-scoped offline navigation and cache cleanup are corrected, and version.json is restored at the original route.

Feast caps growth at tier 5 (Prowler), preserving Rex/Giganotosaurus danger. Population remains bounded for predictable device work. Hunger continues increasing each wave; predator pursuit increases 2.5 percentage points per wave after wave 8, capped at 35% extra speed. The independent legacy Isabelle bot is tested from waves 10 and 20 across three seeds, with at least half the runs caught within three minutes. This is an automated balance guardrail, not a claim about a child’s skill.

Deployment now downloads the exact successful verification build rather than rebuilding. It declares contents-read permission and only main pushes deploy. The replacement remains unmerged for Robert’s final review.
