# Story bible and content contract

Audience: a family (children and adults). Tone: warm, funny, a little eerie, never gory. Dinosaurs have personalities, not
speeches. Dialogue pages are short (1–3 sentences). No violence beyond "driven off" and "defeated". Nobody dies on screen.

## The mystery
Amber has begun to seep up through Fern Hollow. Creatures that touch it grow bigger, hungrier and **glow-eyed**. It is also the
reason the valley's creatures can *wear mutations* at all (the player's loot). Young creatures follow its warm glow, so hatchlings
have been wandering off, and sick predators guard the trails to keep them there.

Truth: the amber is **mutagen** from the **Heartstone**, a fallen star-fragment deep in Echo Caves, woken by Ember Basin's volcano.
Its keeper is **The Glimmerjaw**, a once-ordinary giant that drank too deeply. The hatchlings are safe, warm and sleepy in
the caves' glow-nursery, and the Glimmerjaw thinks it is *protecting* them. The player can **seal** the Heartstone (valley restored,
quieter world, no more raw mutagen) or **bind** it (the glow stays: harder world, richer loot). Either ending is a legitimate,
named choice.

## Main arc (chapters; ids are fixed so tests, journal and save catch-up can refer to them)
| # | quest id | region | giver / start | beats | boss (rival id) | world flag on completion |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `quiet-nest` | hollow | auto | learn the hunt (done) | – | – |
| 2 | `missing-hatchlings` | hollow | Mossback | hatchlings gone, amber prints (done) | `old-scar` | `hollow-restored`, `amber-source-known` |
| 3 | `river-hunter` | river | auto after chapter 2 and the player reaches Riverbend | Old Nibble keeps the ford; the River Hunter ("Scarfang") is amber-sick; follow the stained trail; bring the ford keeper proof | `river-hunter` | `river-cleared`, `amber-shard-1` |
| 4 | `marsh-lanterns` | marsh | Reedwhistle (marsh warden) | glowing "lanterns" (mutagen plants) draw hatchlings in; escort a lost clutch home; the Reed Stalkers' hoard | `marsh-pack` | `marsh-cleared`, `amber-shard-2` |
| 5 | `sunscar-digs` | dunes | Thornwick (kentrosaurus hermit) | a fossil dig records the Old Ones' warning: *the star-stone sleeps below, wake it not*; collect four tablet pieces; the Sunscar Stalker guards the dig | `sunscar` | `dunes-dig-open`, `amber-shard-3` |
| 6 | `matriarch-vent` | ember | auto when the player reaches Ember Basin | the Basalt Matriarch sits on the vent that feeds the amber; read her sweep, strike in the recovery | `basalt-matriarch` | `lava-cooled`, `amber-shard-4` |
| 7 | `whispering-dark` | caves | auto after chapter 6 or via the cave tunnels | echo-plate puzzle opens the sealed way to the Heartstone chamber | – | `heartstone-path-open` |
| 8 | `glimmerjaw` | caves | auto | the keeper at the Heartstone: a multi-phase boss | `glimmerjaw` | `glimmerjaw-down` |
| 9 | `heartstone-choice` | caves | auto | **choice**: seal the Heartstone, or bind it. Epilogue lines from every NPC change | – | `heartstone-sealed` **or** `heartstone-bound` |

Shard flags are cosmetic bookkeeping (journal), chapter 7 requires all four. Chapters 3–6 may be done in the order the world lets the
player reach them (the stage gates already enforce: ford needs Juvenile, rotten log needs Hunter, basalt needs Apex); each
requires the previous chapter's *flag*, not quest order, where the geography allows.

## Side quests (target: at least 8, each with a real situation and a payoff — not kill-ten)
Use exploration, tracking, protecting, an environmental puzzle, a morally interesting choice and humour. Suggested set (rename freely, keep ids stable once written):
- `ford-stones` (river, Old Nibble): the ford keeper's old stepping-stone riddle — **plates** puzzle ordered by footprint sizes. Reward epic legs.
- `egg-thief` (river): an Oviraptor is blamed for stealing eggs. **Track** the clues, discover the truth, **choice**: punish or forgive. Different rewards.
- `guard-clutch` (marsh): **protect** a clutch through waves, then choose which of two nests to defend first.
- `reed-cough` (marsh): a sick Triceratops needs four marsh herbs; some grow inside a toxic-gas hazard. **collect** + deliver.
- `old-ones-echo` (dunes): find four inscriptions/fossils, interpret them in order, open a hidden cache. **find**/**collect**.
- `thornwick-quiet` (dunes): Thornwick wants peace and quiet; a noisy compy swarm is the problem. Comedy, **kill** + **talk**.
- `steam-run` (ember): cross a geyser field by watching its rhythm to retrieve a stranded egg. **goto** through hazards.
- `pip-count` (hollow, optional, tiny): Pip asks you to confirm five landmarks. **goto/collect**.

World-state flags drive visible change (the scene reads them): `hollow-restored`, `river-cleared`, `marsh-cleared`, `dunes-dig-open`,
`lava-cooled`, `heartstone-sealed`, `heartstone-bound`. A region's creature population changes when its flag is set (the
content may add `spawns` that only the quests create; permanent spawn changes are an engine feature we add on request).

## Cast (reuse these; add more as needed, each is a creature sprite + a personality)
| id | name | creature sprite | personality |
| --- | --- | --- | --- |
| `mossback` | Mossback | elder-trike | Hollow nest-keeper, slow, proverbs (done) |
| `pip` | Pip | scout-compy | hyperactive scout, boasts, loyal (done) |
| `old-nibble` | Old Nibble | elder-hypsi | Riverbend ford-keeper, remembers every flood, rambling, kind |
| `reedwhistle` | Reedwhistle | elder-oviraptor | marsh warden, crisp, stern, secretly soft on hatchlings |
| `thornwick` | Thornwick | elder-kentro | dune hermit, grumpy, hates noise, knows the old stories |
| *(add)* | an echo-keeper for the caves | any | gentle, whispers, speaks in short lines |

## Creature roster (ids usable in `spawn`, `kill`, quest steps)
prey: `beetle`, `dragonfly`, `compy`, `hypsi` (L1–3) · rusher `raptor` (L3), `oviraptor` (L4) · swarm `compy-raider` (L2) · ranged `dilo` (L6) ·
support `caller` (L5) · ambusher `lurker` (L5, give `dormant: true`) · tank `kentro` (L6) · neutral `trike` ·
bosses (already wired as rivals): `old-scar` L4, `river-hunter` L8, `reed-stalker` L13 (pack), `sunscar` L17, `gigano` (Basalt Matriarch) L22, `glimmerjaw` L27.
Region level bands: hollow 1–5, river 5–10, marsh 9–14, dunes 13–19, ember 17–24, caves 20–28. Give quest spawns a `level` in the band.

## Rewards
`reward.loot` / step `onDone.loot` takes `{ rarity, slot?, unique? }`. Legendary uniques by id: `gorgemaw`, `thunderlung`, `stoneback`,
`quaketail` (Rex) · `razortalons`, `venomfang`, `windsplitter`, `mirage` (Raptor) · `crown`, `bastion`, `earthsplit`, `stampede` (Trike) ·
`glowheart`, `amber-eye` (any). A legendary reward must be species-eligible: for class-specific uniques, pick by *player species*
is not possible in static data, so only use the two universal legendaries (`glowheart` for the **sealed** ending, `amber-eye` for the **bound**
ending) or non-legendary rarities with a `slot`. XP scale: a side quest 60–160, a chapter 150–400 (the engine multiplies by difficulty).

## Engine capabilities (see `src/adventure/quests.ts`, the types are the contract)
Steps: `talk`, `goto`, `kill` (creature / archetype / region / tagged spawns), `boss` (rival id), `find` (discovery id), `track` (ordered clues),
`collect` (world items), `choice` (branches via flags; later steps use `onlyIf`), `plates` (ordered stepping puzzle), `protect` (waves at a place),
`escort` (hatchlings follow you), `flag` (wait for a world flag). Effects: spawn, flag, xp, amber, loot, toast, clear.
**No soft locks** (enforced by `tests/arpg-quests.test.ts` lint + A* reachability against the real world): every target must sit on
walkable ground the player can reach from the start nest; every `onlyIf` flag must be set by a `choice`; kill steps that spawn creatures are
re-spawned if they vanish; protect/escort cannot fail.

## Authoring workflow
1. `D:/dev/ComfyUI_windows_portable/python_embeded/python.exe -c "import sys,runpy; sys.argv=['map_preview.py','.scratch/map.png','x0','y0','x1','y1','--scale','12','--grid','5']; runpy.run_path('tools/world/map_preview.py', run_name='__main__')"` — view the PNG, pick points **on the tan/walkable trails**, never on the dark forest. The world is a network of trails (about 4 units wide), not an open field.
2. Write content in your region file (`src/adventure/content/<file>.ts`).
3. `npx tsc --noEmit` and `npx vitest run tests/arpg-quests.test.ts` must pass (the lint and the reachability test cover your content).
