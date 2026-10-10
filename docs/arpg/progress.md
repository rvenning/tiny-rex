# ARPG evolution: progress, decisions and open work

Branch `feature/arpg-evolution` (from `main` at `92d9930`). Brief: Notion "Tiny Rex — ARPG Evolution". Updated as work lands.

## Status by stage

| Stage | Gate | State |
| --- | --- | --- |
| 1 Audit and design | `00-audit.md`, `01-design.md` (data contracts, migration plan, acceptance criteria A1–A10), `02-story-bible.md` | **Done** |
| 2 Vertical slice | Hollow: 3 classes with separate saves, combat, 3+ enemy types, miniboss, skills, mutations, a multi-stage branching quest | **Built and verified by tests, bots and screenshots. Not human-playtested** |
| 3 Systems | levels/skills/respec, rolls and rarities, inventory UI, character management, death, journal, migrations | **Done** (see below) |
| 4 World and campaign | six regions: main arc (9 chapters), side quests, bosses, world-state changes, hazards, encounters | **Content complete; art-light** (no new baked terrain; see gaps) |
| 5 Polish and release | VFX, audio, onboarding, perf, device testing, regression tests, save safety, PWA | **Partly done**: no physical-device or human playtest results exist |

## What exists now (all verified in this repository)

- **Characters.** Three launch classes (Rex, Raptor, Triceratops). Species is fixed at creation and there is no API to change it. A family profile owns up to 12 characters, each with its own XP, quests, skills, mutations, flags and world progress. Character select shows species portrait, name, level and body stage, location, playtime and story progress; create (name, species, challenge), delete with confirmation and a 30-day *Recently deleted* with restore. Saves: `trex_chars_v2_<profile>` with backup and known-good copies and a corruption notice, per-character cloud documents merged by `rev`, tombstones for deletes. The legacy `trex_adventure_v1_*` record is never modified; first load converts it to characters (one per played species, never below the old stage). Tests: `rpg-characters`.
- **Progression.** Level cap 30 (`xpToNext = 24+16L+1.6L²`), body stages at levels 1/5/10/18, River Hunter and Marsh Pack hold the level cap at 9 and 17 (XP banks, the bar says "Defeat X to grow"). **Feast** is temporary, size-based growth (stacks to 5, +3% damage and +2% speed per stack, capped, never XP). Tests: `rpg-rules`.
- **Combat.** 3-hit combo (raptor 4) with a finisher, cleave, perfect dodge (cooldown refund, crit counter), hit-stop, damage numbers, crits, enemy bars, telegraph shapes for lunge/sweep/slam/charge/spit/volley/rally, exposed windows, projectiles with venom, statuses (bleed, poison, mark, slow, stun, shock arcs), 12 active skills (2 equipped), a 45-node tree with trade-offs and respec. Tests: `arpg-combat` (56), `arpg-balance`.
- **Enemies.** Rusher, swarm, ranged (venom spit, keeps distance), tank (frontal armour), ambusher (dormant, rustle warning), support (rally heals and hastes), neutral herd, miniboss and 5 bosses with 3–4 phases, adds and arena leashes.
- **Mutations.** 7 slots with species anatomy, 4 rarities, 21 bases, rolled stats with visible ranges, 11 rolled gameplay effects, 14 legendaries that change play style, deterministic loot (seeded, pity timer), pickup beams, a bag of 24, sorting and filtering, comparison tooltips, Amber economy (salvage, once-per-item affix reroll, respec). Visual evolution through an additive aura by rarity, attack colour by effect and Feast body scale. Tests: `rpg-rules`.
- **Quests.** Engine with 12 step types (talk, goto, kill, boss, find, track, collect, choice, plates, protect, escort, flag), branches, journal, tracker, map/arrow guidance, quest markers. 18 authored quests (9 story chapters and 9 side quests) across all six regions (two branch endings: seal or bind the Heartstone). Dialogue UI, NPC "!" and "?" markers. Tests: `arpg-quests` (lint of every reference, A* reachability of every target in the real world), `arpg-playthrough` (a bot completes every quest, both branch directions, through the real simulation).
- **World.** The six regions keep their baked art and pipeline. Added: 45 extra encounters designed by archetype, 10 hazards (toxic gas, geysers with warning rings, quicksand, mutagen), landmark dressing and flag-driven world change (amber seeps dry up, flowers return, glows at the Heartstone), an NPC cast of 16.
- **UI.** HUD with HP/XP/Feast/Amber, boss bar, four action buttons, quest tracker, banners; mutations, skills, journal (quests, map, creatures, people), pause (difficulty, sound, motion), dialogue. Touch-first layouts verified by screenshot at phone, iPad portrait and iPad landscape.
- **Audio.** Synthesised cues for crits, level-ups, quest steps, loot by rarity, slams, spits, perfect dodge, phase changes.

## Verification actually run

- `tsc --noEmit` clean; `vitest` 158 tests across 12 files pass; production build passes.
- Playwright smoke (Chromium through the installed Chrome, a one-off local run of the rewritten specs; CI runs the full set): 11 passed (HUD fit at 390x844, 844x390, 768x1024, 1024x768 and 1440x900; keyboard, touch, pause, PIN, new-character flow, legacy migration). The offline and WebKit projects were **not** run locally.
- Isolated Chrome (Firebase blocked) screenshots in `docs/review/`, tools in `tools/qa/` (`shot`, `menus`, `fight`, `screens`, `perf`, `lib`).
- Desktop headless Chrome frame time (not a device number): baseline 16.7 ms median; with ten simultaneous fighters, 112 actors and 375 live props, 17.7 ms median and 18.2 ms p95.
- Balance (bot in `tests/helpers/bot.ts`): ordinary enemies take 1–12 s of sustained damage; bosses 18–110 s; a standing player outlives a lone raptor by more than 10 s; a player who reads the tells beats every ordinary enemy at 35% health or better and every boss with base gear for all three species; a bot that never dodges takes many more hits.

## Design decisions (resolved open questions)

1. **Growth versus level.** Level and XP are permanent; body stage is derived from level and gated by two milestone bosses; Feast is temporary, capped and cannot grant XP.
2. **Mutation anatomy.** Rex: jaws, hide, legs, tail, instinct. Raptor adds claws. Triceratops swaps jaws for horns. Eligibility is enforced in rolling, validation and equip.
3. **Economy.** One currency (Amber). Respec `20+8×level` (free through level 5); affix reroll `35+12×ilvl` once; salvage 6/18/50/150 scaled.
4. **Quest consequences.** Boss and quest flags change decor, NPC lines, hazards and which NPCs appear; the ending choice sets `heartstone-sealed` or `heartstone-bound`.
5. **Campaign length.** Not set by hours. The XP curve reaches level 30 after the finale content; real length must come from playtesting.

## Known gaps and honest caveats

- **No human playtest and no physical iPad, Safari or PWA test.** Everything above is tests, bots, headless Chrome and screenshots. Fun, pacing and boss feel are unverified. Frame times are desktop headless only.
- **Terrain is unchanged.** The world is a network of trails about 4 units wide, baked as art. New side paths, caves and ruins were done with props, encounters, hazards and portals, not new baked ground. A bigger world needs a Blender re-bake of new tiles.
- **Creature art is reused.** New enemies and NPCs are existing sprites with scale, tint and aura; bosses are distinguished by size, tint, glow and behaviour. Dedicated boss and NPC art is the largest visual upgrade still available.
- Skill and mutation icons are simple vector glyphs; combat VFX are procedural.
- The Glimmerjaw lair sits on the cave trunk to the dunes tunnel; a running player entering early may pull it (its notice range is 10).
- Cloud sync for characters is written and unit-tested against the reconcile plan, but was **not** exercised against Firebase (automated runs must never touch the family database).
- Audio is synthesised; there has been no mix review on speakers or headphones.
