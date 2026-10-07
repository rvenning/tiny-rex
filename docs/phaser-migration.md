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
