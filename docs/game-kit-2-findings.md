# What rebuilding Tiny Rex taught us

## Connected adventure follow-up, 9 October 2026

An additive adventure scene can reuse the profile, audio, accessible modal and
PWA boundary while keeping rules independent of Phaser. Its permanent growth,
unlocks and last-session position need a different save contract from best-score
records: monotonic fields merge with max/union, while the complete session
snapshot follows its timestamp. Deletion tombstones must protect both contracts.
This remains application code; it does not justify extracting a universal quest
or world system into Game Kit. Browser emulation checks layout/input, while
physical-device performance and human playtesting remain separate release gates.

## Recommendation

**Conditional yes: use Phaser 4 for future 2D games.** This rebuild demonstrates
that scenes, sprites, texture-backed illustration, input, animation, tweens,
camera feedback and pooled particles can be delegated cleanly. The application
is complete without the existing Game Kit. Adopt it for the next game, but make
physical iPad frame time, memory, Safari audio and standalone installation a
release gate before calling it the standard foundation for every game.

This recommendation is based on a playable implementation, not a renderer
proof. Phaser 4.2.1 is pinned. There is a real TypeScript/Vite build, Endless
Feast, profiles, saves, book, audio, touch controls and PWA. The game rules are
explicit, independently testable and seeded. User priority shifted to making
the best game; migration fidelity is a safety baseline rather than a goal that
prevents better presentation.

## Phaser Should Own

- **Rendering and the scene graph.** The arena is Images/Sprites/Graphics/Text,
  not a live CanvasTexture receiving a full-screen upload every frame. The
  painted WebP sprite sheets are loaded at boot and rebaked to aligned atlases;
  scenery is baked once per selected valley. The small remaining insect painters
  are presentation assets, not a custom runtime renderer.
  Scene shutdown destroys display objects; texture keys are reused across hunts.
- **Scene lifetime and frame delivery.** Boot, Menu and Play express the actual
  game lifecycle. The previous custom RAF loop, renderer activation flag and
  presentation clock are gone. Pause/resume and shutdown cleanup are explicit.
- **Coordinate transforms and input.** FIT scaling, cameras and input replace
  manual CSS/backing-store/pointer scaling. High-resolution rendering uses a
  declared camera scale and inverse camera input transform. Single-pointer
  ownership remains a small application policy on top of Phaser input.
- **Sprite animation.** Six-frame painted atlases plus jaw-open chewing frames animate the new art. Phaser animation definitions and Sprite playback own frame changes.
- **Tweens, particles and camera effects.** Native tweens own hero breathing,
  growth emphasis, pop-up text and ribbons. A reserved 64-particle emitter owns
  burst pooling, with a separate bounded ambient emitter. Camera shake is brief
  and disappears under reduced motion.

Phaser’s loader now loads three compressed painted WebP sheets with alpha
transparency. All are precached for offline play. This verifies a small real
asset pipeline, not streaming large worlds or an arbitrary future art library.

## Game Kit 2 Should Own

**A thin project/platform layer, not another game engine.** We still had to
build the following because Phaser has no application-specific opinion on them:

1. A generated TypeScript/Vite project with recognizable scene/module names,
   explicit service injection and a concise agent guide.
2. A scale/layout convention: logical arena, chrome budget, safe areas, viewport
   fitting, high-resolution render policy and accessible touch targets.
3. Save/settings/profile services with typed game-owned progress merge rules,
   local-first storage, deletion tombstones and optional cloud adapters. These
   policies are substantial, reusable and independent of the renderer.
4. PWA build/deployment conventions: base URL, scope, generated precache, install
   help, deferred updates and coexistence with other family games' caches.
5. Accessibility policies: motion preference, keyboard forms, focus management,
   live announcements, visibility pause and clear status for local/cloud saves.
6. A small collection of screen/control patterns and design tokens. Native HTML
   name/PIN forms and long scrollable collections are better than reinventing
   text input in canvas. Phaser owns the in-game HUD.
7. Testing and release conventions: pure rules tests, an independent player bot,
   real pointer-driven browser completion, offline testing, screenshot matrix,
   repeated restart checks and a device review checklist.

Audio preference/unlock policy belongs here; soundtrack playback and voice
management can use Phaser when games have recorded assets. Tiny Rex instead
benefits from a tiny synthesized Web Audio adapter that disconnects nodes after
each voice. That is a game-specific implementation choice, not evidence that
every future game should bypass Phaser sound.

## Game-Specific

Relative size, edible/armoured classifications, the growth ladder, plant floor,
predator interest/rest cycles, growth,
Feast hunger/waves, scoring, species facts and valley artwork all belong
to Tiny Rex. The renderer consumes typed events; it does not decide which
collision counts as food. No physics engine was needed for this game's simple
circle comparisons. Adding Arcade/Matter merely because Phaser has it would
have complicated the rules without improving the game.

## Uncertain

- **Canvas UI versus HTML:** this implementation's boundary works well, but a
  shared universal screen DSL would make uncomplicated menus harder to modify.
  Keep small patterns first and revisit after another game.
- **Audio:** decide per asset type. Synthesis here is not a universal audio API.
- **Animation specification:** the generated atlas convention is clear, but a
  future game using authored sprites may need a different asset definition.
- **Cross-game cloud identity:** existing family-compatible documents were
  preserved. This is not a commercial account/security design. Profile PINs
  remain local family convenience, while anonymous Firebase auth gates writes.
- **Performance:** headless Windows/WebKit is useful for correctness and leak
  indicators, not a physical iPad 60 FPS claim. Measure device budgets before
  expanding the generated texture workload or authoring a universal renderer.

## What Game Kit 2 should NOT attempt to do

Do not maintain another scene manager, RAF loop, sprite renderer, tween engine,
particle pool, camera shake system, animation scheduler, pointer-coordinate
transformer or general physics engine. Those duplicate Phaser's demonstrated
responsibilities. Do not put Tiny Rex's progression in the shared kit. Do not
turn game specifications into an abstraction that hides Phaser from agents.
Agents should use Phaser directly for game presentation with a few explicit
platform services supplied alongside it.

## How AI should create a new game

Idea → typed game specification → small project generator → game-owned rules
and Phaser scenes → meaningful logic/bot/browser tests → production/PWA build
→ physical device review → PR → deployment after review.

The specification should declare the viewport policy, scene list, asset and
animation manifest, input vocabulary, progress schema, merge policy and release
checks. It should not attempt to describe every tween or creature through a
generic runtime interpreter. Generated projects should remain ordinary source
code with direct imports and obvious places to change a feature.

## What to build next

Build **one second game** on the same boundary before extracting Game Kit 2.
Then extract a v0 consisting of a generator, typed bootstrap/services, local
save/settings/profile adapters, PWA/deployment configuration, a small accessible
control set and the testing/agent-documentation template. Keep engines/scenes
as application code. Shared transitions and audio should be added only after
two actual games show the same need. Achievements, analytics and a generalized
leaderboard backend were not validated by this rebuild and should not be v0
requirements.

## Final product scope

Robert chose Endless Feast only and requested a replacement at the existing
root URL. Campaign fixtures remain only for migration regression; the public
game has no campaign or unlock gate. Source, build and deployment live at
repository root. Desktop GPU performance and restart resource counts were
measured; these do not substitute for a physical iPad review.

## Review lessons

Sync adapters need per-record dirty tracking, validation at trust boundaries, semantic change detection and transactional writes against the latest remote state. Tombstones must be immutable and checked in the same transaction as updates. Tests should model remote changes between fetch and send, auth failure, malicious fields and reconnect without redundant writes. Publishing should use the artifact actually verified. Renderer population limits require explicit continuing game pressure; they should not silently remove the late-game design.
