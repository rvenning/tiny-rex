# Stage 1 · Design decisions, data contracts and acceptance criteria

Everything here is implemented as typed, data-driven content under `src/rpg/` (pure rules, no Phaser/DOM) and consumed by
`src/adventure/sim.ts` and the scenes. Numbers are first-pass and are tuned by the balance tests in `tests/rpg-*.test.ts`.

## 1. Decisions on the brief's open questions

### 1.1 Growth versus level (the signature mechanic)

| System | What it is | Persistent? | Consequence | Cap |
| --- | --- | --- | --- | --- |
| **Character level** | XP from kills, quests, discoveries, bosses | Yes | +HP, +damage, skill points (1 per level from L2), skill unlocks | L30 |
| **Body stage** (Hatchling/Juvenile/Hunter/Apex) | Permanent size, derived from level: L1 / L5 / L10 / L18 | Yes | Body radius, reach, sprite, camera zoom, which gates you can break | 4 |
| **Boss gates on stage** | River Hunter must fall before L10, Marsh Pack before L18 | Yes | XP still banks; the level bar reads "Defeat the River Hunter to grow" | 2 |
| **Feast** (eating) | Prey kills and grazing add 18 s of Feast (max 90 s = 5 stacks) | **No** (decays, cleared on defeat) | Per stack: +3% damage, +2% speed, +2.5% body scale, +0.4%/s regen out of combat. Total capped at +15% damage | 5 stacks |

Eating therefore stays physical and visible, rewards hunting small prey between fights, and can never replace levelling
(Feast grants no XP beyond the kill's normal XP, and its bonus is capped), so the two systems cannot conflict.

### 1.2 Species are permanent per character
Species is chosen at character creation, stored on the character and never changes. All three launch classes are available
at creation (the old egg/fossil unlock chain becomes quest content, not a gate). No fourth class.

### 1.3 Mutation slots (anatomy-aware)
| Slot | Rex | Raptor | Triceratops |
| --- | --- | --- | --- |
| Jaws | yes | yes | – (beak is part of Horns) |
| Claws | – (tiny arms) | yes | – |
| Horns | – | – | yes |
| Hide (scales / plumage / frill) | yes | yes | yes |
| Legs | yes | yes | yes |
| Tail | yes | yes | yes |
| Instincts | yes | yes | yes |

Rex has 5 slots, Triceratops 5, Raptor 6 (glassier class gets more levers). A mutation lists the species it can roll for;
Instincts and Legs/Tail/Hide bases are shared, weapon slots are species-specific.

### 1.4 Economy
Amber (single currency): dropped by enemies, found in discoveries, quest rewards, **salvaging** mutations
(common 6 / rare 18 / epic 50 / legendary 150, scaled by item level). Amber pays for respec (`20 + 8 × level`, free through
L5) and for rerolling one secondary affix (`35 + 12 × item level`, once per item). Inventory holds 24 mutations (+ 6 equipped).
Duplicate legendaries salvage for a large Amber payout. No real-money anything.

### 1.5 Death
Respawn at the last refuge. Keep level, skills, mutations, quests. Penalty: lose Feast stacks and drop 10% of carried Amber
at the place of defeat as a glowing pickup that stays 3 minutes (recoverable). Bosses reset and heal.

### 1.6 Difficulty
Per character, changeable at any refuge: **Gentle** (tells ×1.3 longer, damage taken ×0.6, wider aim — the old "assist"),
**Standard**, **Fierce** (enemy HP/damage ×1.25, XP and drop quality ×1.2).

## 2. Data contracts (all in `src/rpg/` unless noted)

```ts
type Dino = 'rex' | 'raptor' | 'trike';                       // adventure/data.ts
type Slot = 'jaws' | 'claws' | 'horns' | 'hide' | 'legs' | 'tail' | 'instinct';
type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
interface Mutation { id; base; name; slot; rarity; ilvl; species: Dino[]; primary: Roll; affixes: Roll[]; effect?: string; seed; rerolled?; at }
interface Roll { stat: StatKey; value: number; min: number; max: number }
type StatKey = 'damage'|'attackSpeed'|'crit'|'critDamage'|'maxHp'|'armour'|'speed'|'dodgeCd'|'skillCd'|'regen'|'lifesteal'|'thorns'|'feast'|'xp'|'amber'|'luck'|'reach'|'poison'|'bleed';
interface Character {                                         // one independent save
  version: 2; id; name; species: Dino; created; updated; rev; playtime;
  level; xp; skillPoints; skills: Record<string, number>; equippedSkills: [string, string|null];
  mutations: { bag: Mutation[]; worn: Partial<Record<Slot, Mutation>> }; amber; pity;
  quests: Record<string, QuestState>; flags: string[];
  world: { discoveries; regions; nests; rivals; studied; gates; challenges; mastery; forage; snapshot; drops };
  difficulty: 'gentle'|'standard'|'fierce'; stats: { kills; deaths; bossKills; … }; migrated?: { from: 'adventure_v1'; at }
}
interface QuestDef { id; title; kind: 'main'|'side'; region; level; giver?; summary; steps: StepDef[]; reward: Reward; requires?: Req }
type StepDef = Talk | Goto | Kill | Track | Find | Escort | Protect | Choice | Plates | Boss | Collect
```

Storage keys (new, additive): `trex_chars_v2_<profileId>` = `{ version: 2, active: id|null, characters: Record<id, Character>, trash: Character[] }`
with `…_backup` (previous write) and `…_good` (last copy that validated and had >= the same total progress); Firestore doc
`chars_v2_<profileId>` merged **per character** by `rev`, with tombstones in `trash`.

## 3. Migration plan (no loss, ever)
1. `trex_adventure_v1_<profile>` is never modified or deleted by the new code.
2. First load of a profile with no `trex_chars_v2_` record creates characters from the legacy record: one per species with
   XP > 0 or the saved active species (named “<Profile>’s Rex”, etc.), each copying the shared world state (discoveries,
   regions, nests, rivals, gates, mastery) and converting XP to level with the new curve **never lower than the old stage**.
3. A profile with no legacy adventure sees an empty character list and the create flow.
4. The legacy record stays as a read-only archive; if conversion ever fails the character list is empty and nothing is lost.
5. Corruption: unreadable primary → `_backup` → `_good` → legacy re-migration, with a visible “recovered” notice.

## 4. Combat grammar
Basic attack = 3-hit combo (species tempo); finisher heavier/wider. Dodge = i-frames; dodging **into** a lethal strike's
last 0.15 s is a *Perfect Dodge* (cooldown refunded, next hit crit). Enemy attacks keep the existing read: ground fan, inner
fan = when, “Exposed” window after a strike (×1.6 damage). Colour is never the only signal: shapes, icons, text callouts and
audio accompany each telegraph.
Archetypes: **rusher** (lunge), **swarm** (many small rushers), **ranged** (spit, kites), **tank** (frontal armour, tail
retaliation), **ambusher** (hidden until close), **support** (heals/rallies, priority target), **boss** (phases).

## 5. Acceptance criteria (measurable)
- A1 Three classes create three independent characters under one profile; level/xp/quests/mutations never leak (test).
- A2 Species cannot change after creation (no API; test).
- A3 Legacy saves migrate without loss; corrupt primary recovers from backup (tests).
- A4 Mutation rolls are deterministic per seed, respect slot/species eligibility and rarity affix counts; compare/sort work (tests).
- A5 Every class has a distinct ≥ 3-skill kit, a 15-node tree with trade-offs, and a working respec (tests).
- A6 Level-appropriate common enemy dies in 4–9 s of ordinary play; boss in 60–150 s; time-to-die of a level-matched player
  against a lone rusher ≥ 12 s without dodging (balance tests).
- A7 Every quest completes via scripted events and has a reachable target for every step in the connected world (A* test); no step can be failed permanently.
- A8 Death keeps level/skills/mutations/quests; only Feast + 10% Amber (recoverable) are affected (test).
- A9 Desktop headless frame time with 12 enemies + loot + VFX median ≤ 20 ms; **device numbers are reported only if measured**.
- A10 Touch: every action reachable by thumbs at 48 px+, portrait and landscape; keyboard parity; reduced-motion respected.
