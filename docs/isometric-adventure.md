# Isometric adventure — development build

Robert approved the design and concept mockups on 9 October 2026. This branch
implements the connected adventure alongside Endless Feast. The concept images
are an art target, not screenshots of this build. Merge remains Robert's decision.

## Play locally

```sh
npm ci
npm run build
npm run preview -- --port 4173
```

Open `http://127.0.0.1:4173/tiny-rex/`, choose a profile, then Begin the adventure.
WASD/arrows move, J bites, Space/K dodges, E/L uses the species skill,
Enter interacts and Escape pauses. Touch: drag on the world to steer; separate
action buttons accept another finger. Map & book pauses. Nests heal, save and
allow switching between discovered species.

## Implemented

- Six adjacent regions with growth-gated physical crossings and a cave loop.
- Four permanent growth stages. Hunting and discoveries grant growth; rivals
  gate Hunter/Apex milestones. Defeat returns to a discovered nest.
- Intentional bites, dodges, windups/recovery and three rivals. Roar interrupts;
  Raptor pounces; Triceratops charges and forages.
- Eighteen fossils, tracks, species eggs, creature study, clean-hunt records,
  map/journal and three species with independent growth.
- Separate versioned adventure records, validated reads, backup recovery,
  monotonic collection/growth merges and deletion tombstones. Existing
  `trex_progress_*` records and Endless Feast remain available.
- Blender-authored sprites and props with a common camera/lighting setup.

## Asset production

Editable models live in `src/art/sources/*.blend`. The procedural script can
regenerate them; document hand edits or make changes in the script. Blender is
a build-time tool, not a browser dependency. No Blender binary is committed.

```sh
blender --background --python tools/render_adventure.py -- /absolute/scratch/art
blender --background --python tools/render_adventure.py -- /absolute/scratch/art --props
blender --background --python tools/render_adventure.py -- src/art/sources --source-only
python tools/pack_adventure.py /absolute/scratch/art src/art/assets/adventure
```

Exports use eight directions/eight poses, transparent 192-pixel frames, packed
to 144-pixel WebP cells. Props use transparent 256-pixel renders. Foot origin,
camera and lighting are shared. The manifest records encoded size and decoded
atlas estimates. Ground textures are cached; feedback and actors are bounded.

## Required before release

This is an integrated development build. Procedural dinosaurs and geometric
region composition remain simpler than the approved art. Some creature types
share a model/tint and need distinct silhouettes. Paths, water, landmarks,
animations and environmental storytelling need further art direction.

Growth thresholds are initial balance values. A multi-hour journey, satisfying
combat difficulty and adult/child enjoyment have not been demonstrated. Optional
species shortcuts, cosmetic rewards and richer side objectives remain planned.
Physical iPad Safari, audio, installation and sustained performance need device
testing. WebKit viewport checks do not establish those results.

Tests exercise rules, concurrent saves, responsive layouts, keyboard actions,
journal, reload and classic coexistence. Human playtesting should first assess
the first hunt/rival, then growth pacing and revisit rewards. Tests do not prove fun.
