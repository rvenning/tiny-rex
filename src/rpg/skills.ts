/** Class skills (active, unlocked by level, two equipped) and the restrained passive tree (3 branches x 5 nodes per class). */
import type { Dino } from "../adventure/data";
import { skillPointsAtLevel } from "./progression";
import { zeroStats, type Effects, type StatBlock, type StatKey } from "./types";

export interface ActiveSkill {
  id: string;
  species: Dino;
  name: string;
  unlock: number;
  cd: number;
  blurb: string;
  /** a shout-type skill benefits from Shout Shockwave effects */
  shout?: boolean;
  /** HUD icon key (see ui/hud.ts ICONS) */
  icon: string;
}
export const ACTIVES: ActiveSkill[] = [
  { id: "rex.roar", species: "rex", name: "Roar", unlock: 1, cd: 8, blurb: "Interrupts wind-ups, scares small prey and rattles nearby hunters.", shout: true, icon: "roar" },
  { id: "rex.tail", species: "rex", name: "Tail Whip", unlock: 3, cd: 5, blurb: "A full-circle sweep that hurls attackers back.", icon: "sweep" },
  { id: "rex.stomp", species: "rex", name: "Quake Stomp", unlock: 7, cd: 10, blurb: "Slam the ground: heavy damage and a short stun around you.", icon: "stomp" },
  { id: "rex.frenzy", species: "rex", name: "Feeding Frenzy", unlock: 12, cd: 24, blurb: "8 s of faster bites and life-steal.", icon: "frenzy" },
  { id: "raptor.pounce", species: "raptor", name: "Pounce", unlock: 1, cd: 4, blurb: "A long leap that bites at the end and leaves a bleed.", icon: "pounce" },
  { id: "raptor.flurry", species: "raptor", name: "Razor Flurry", unlock: 3, cd: 7, blurb: "Dash through enemies in a blur of slashes.", icon: "flurry" },
  { id: "raptor.screech", species: "raptor", name: "Piercing Screech", unlock: 7, cd: 12, blurb: "Marks nearby enemies to take more damage and slows them.", shout: true, icon: "screech" },
  { id: "raptor.shadow", species: "raptor", name: "Shadowstep", unlock: 12, cd: 9, blurb: "Vanish and reappear behind the nearest enemy; your next hit is critical.", icon: "shadow" },
  { id: "trike.charge", species: "trike", name: "Charge", unlock: 1, cd: 6, blurb: "A committed charge that hurls enemies aside and smashes rubble.", icon: "charge" },
  { id: "trike.brace", species: "trike", name: "Frill Brace", unlock: 3, cd: 9, blurb: "Plant your feet: block most damage and reflect part of it.", icon: "brace" },
  { id: "trike.toss", species: "trike", name: "Horn Toss", unlock: 7, cd: 8, blurb: "Hurl everything in front of you into the air.", icon: "toss" },
  { id: "trike.bellow", species: "trike", name: "Rallying Bellow", unlock: 12, cd: 18, blurb: "Taunts enemies, hardens your hide and heals you.", shout: true, icon: "bellow" },
];
export const activesFor = (dino: Dino) => ACTIVES.filter((a) => a.species === dino);
export const activeById = (id: string) => ACTIVES.find((a) => a.id === id);
export const unlockedActives = (dino: Dino, level: number) => activesFor(dino).filter((a) => a.unlock <= level);
/** default loadout: the starting skill in slot A, the next unlock in slot B once it opens */
export function defaultLoadout(dino: Dino, level: number): [string, string | null] {
  const u = unlockedActives(dino, level);
  return [u[0]?.id ?? activesFor(dino)[0].id, level >= 5 ? (u[1]?.id ?? null) : null];
}

export interface TreeNode {
  id: string;
  species: Dino;
  branch: string;
  tier: 1 | 2 | 3;
  name: string;
  text: string;
  max: number;
  /** granted per rank (negative values are the node's trade-off) */
  stats?: Partial<Record<StatKey, number>>;
  effects?: Record<string, number>;
}
export const BRANCHES: Record<Dino, { id: string; name: string; blurb: string }[]> = {
  rex: [
    { id: "predator", name: "Apex Predator", blurb: "Bigger bites, cleaner finishes." },
    { id: "roarlord", name: "Roarlord", blurb: "Skills, stuns and a hungry heart." },
    { id: "hide", name: "Thick Hide", blurb: "Outlast everything." },
  ],
  raptor: [
    { id: "rend", name: "Rend", blurb: "Bleed, crit and ambush." },
    { id: "skirmisher", name: "Skirmisher", blurb: "Speed, dodges, never being there." },
    { id: "pack", name: "Pack Hunter", blurb: "Poison, marks and the alpha's luck." },
  ],
  trike: [
    { id: "horn", name: "Horn Master", blurb: "Charges, goring, long reach." },
    { id: "bulwark", name: "Bulwark", blurb: "Frill, armour and stubbornness." },
    { id: "herd", name: "Herd Leader", blurb: "Graze, heal, lead." },
  ],
};
const N = (n: TreeNode): TreeNode => n;
export const TREE: TreeNode[] = [
  // ---------------- Rex
  N({ id: "rex.p.heavy", species: "rex", branch: "predator", tier: 1, name: "Heavy Jaws", text: "+8% damage, 3% slower bites", max: 3, stats: { damage: 0.08, attackSpeed: -0.03 } }),
  N({ id: "rex.p.crit", species: "rex", branch: "predator", tier: 1, name: "Killer Instinct", text: "+3% critical chance", max: 3, stats: { crit: 0.03 } }),
  N({ id: "rex.p.finisher", species: "rex", branch: "predator", tier: 2, name: "Ruinous Finisher", text: "Combo finishers deal +15% damage", max: 3, effects: { finisher: 0.15 } }),
  N({ id: "rex.p.blood", species: "rex", branch: "predator", tier: 2, name: "Scent of Blood", text: "+20% damage to wounded enemies", max: 2, effects: { execute: 0.2 } }),
  N({ id: "rex.p.apex", species: "rex", branch: "predator", tier: 3, name: "Apex Bite", text: "+20% critical damage, +10% damage, −10% damage reduction", max: 1, stats: { critDamage: 0.2, damage: 0.1, armour: -0.1 } }),
  N({ id: "rex.r.lungs", species: "rex", branch: "roarlord", tier: 1, name: "Deep Lungs", text: "−6% skill cooldown", max: 3, stats: { skillCd: 0.06 } }),
  N({ id: "rex.r.dread", species: "rex", branch: "roarlord", tier: 1, name: "Dreadful Roar", text: "Roar stuns for +0.6 s", max: 2, effects: { roarStun: 0.6 } }),
  N({ id: "rex.r.echo", species: "rex", branch: "roarlord", tier: 2, name: "Reverberation", text: "Roar sends a shockwave for 25% of your attack", max: 2, effects: { roarShock: 0.25 } }),
  N({ id: "rex.r.hunger", species: "rex", branch: "roarlord", tier: 2, name: "Ravenous", text: "+1.5% life on hit, +15% Feast duration", max: 2, stats: { lifesteal: 0.015, feast: 0.15 } }),
  N({ id: "rex.r.king", species: "rex", branch: "roarlord", tier: 3, name: "King of the Valley", text: "−10% skill cooldown, +8% damage", max: 1, stats: { skillCd: 0.1, damage: 0.08 } }),
  N({ id: "rex.h.thick", species: "rex", branch: "hide", tier: 1, name: "Thick Hide", text: "+3% damage reduction", max: 3, stats: { armour: 0.03 } }),
  N({ id: "rex.h.vital", species: "rex", branch: "hide", tier: 1, name: "Vitality", text: "+6% health", max: 3, stats: { maxHp: 0.06 } }),
  N({ id: "rex.h.wind", species: "rex", branch: "hide", tier: 2, name: "Second Wind", text: "+0.3%/s health regeneration", max: 2, stats: { regen: 0.003 } }),
  N({ id: "rex.h.spines", species: "rex", branch: "hide", tier: 2, name: "Spiny Scutes", text: "+8% thorns", max: 2, stats: { thorns: 0.08 } }),
  N({ id: "rex.h.unbowed", species: "rex", branch: "hide", tier: 3, name: "Unbowed", text: "Survive a lethal hit on 1 health once a minute; −5% speed", max: 1, effects: { immortal: 1 }, stats: { speed: -0.05 } }),
  // ---------------- Raptor
  N({ id: "rap.r.bleed", species: "raptor", branch: "rend", tier: 1, name: "Bleeding Edge", text: "+10% chance to bleed", max: 3, effects: { bleed: 0.1 } }),
  N({ id: "rap.r.hook", species: "raptor", branch: "rend", tier: 1, name: "Hooked Claw", text: "+4% critical chance", max: 3, stats: { crit: 0.04 } }),
  N({ id: "rap.r.cuts", species: "raptor", branch: "rend", tier: 2, name: "Deep Cuts", text: "Bleeds deal 25% more", max: 2, effects: { bleedTick: 0.25 } }),
  N({ id: "rap.r.ambush", species: "raptor", branch: "rend", tier: 2, name: "Ambush Instinct", text: "+30% damage to unaware creatures", max: 2, effects: { openingPounce: 0.3 } }),
  N({ id: "rap.r.frenzy", species: "raptor", branch: "rend", tier: 3, name: "Blood Frenzy", text: "+15% attack speed, momentum, −8% health", max: 1, stats: { attackSpeed: 0.15, maxHp: -0.08 }, effects: { momentum: 0.02 } }),
  N({ id: "rap.s.fleet", species: "raptor", branch: "skirmisher", tier: 1, name: "Fleet-footed", text: "+4% movement speed", max: 3, stats: { speed: 0.04 } }),
  N({ id: "rap.s.slip", species: "raptor", branch: "skirmisher", tier: 1, name: "Slippery", text: "−6% dodge cooldown", max: 3, stats: { dodgeCd: 0.06 } }),
  N({ id: "rap.s.quick", species: "raptor", branch: "skirmisher", tier: 2, name: "Quick Recovery", text: "+4% attack speed, −2% damage", max: 2, stats: { attackSpeed: 0.04, damage: -0.02 } }),
  N({ id: "rap.s.counter", species: "raptor", branch: "skirmisher", tier: 2, name: "Counter-Strike", text: "Perfect dodges stagger nearby enemies", max: 1, effects: { perfectCrit: 1 } }),
  N({ id: "rap.s.wraith", species: "raptor", branch: "skirmisher", tier: 3, name: "Wraith", text: "−15% dodge cooldown, +6% speed, −8% damage reduction", max: 1, stats: { dodgeCd: 0.15, speed: 0.06, armour: -0.08 } }),
  N({ id: "rap.p.toxin", species: "raptor", branch: "pack", tier: 1, name: "Toxin Glands", text: "+10% chance to poison", max: 3, effects: { poison: 0.1 } }),
  N({ id: "rap.p.build", species: "raptor", branch: "pack", tier: 1, name: "Toxic Build-up", text: "Poison stacks 1 higher", max: 2, effects: { poisonMax: 1 } }),
  N({ id: "rap.p.guard", species: "raptor", branch: "pack", tier: 2, name: "Opened Guard", text: "Marked enemies take +10% damage", max: 2, effects: { markBoost: 0.1 } }),
  N({ id: "rap.p.cry", species: "raptor", branch: "pack", tier: 2, name: "Piercing Cry", text: "−6% skill cooldown", max: 2, stats: { skillCd: 0.06 } }),
  N({ id: "rap.p.alpha", species: "raptor", branch: "pack", tier: 3, name: "Alpha", text: "+10% damage, +25% Feast, +10% luck", max: 1, stats: { damage: 0.1, feast: 0.25, luck: 0.1 } }),
  // ---------------- Triceratops
  N({ id: "tri.h.charge", species: "trike", branch: "horn", tier: 1, name: "Heavy Charge", text: "Charge deals 15% more", max: 3, effects: { chargeDamage: 0.15 } }),
  N({ id: "tri.h.point", species: "trike", branch: "horn", tier: 1, name: "Needle Points", text: "+3% critical chance", max: 3, stats: { crit: 0.03 } }),
  N({ id: "tri.h.shove", species: "trike", branch: "horn", tier: 2, name: "Shoving Horns", text: "Attacks shove enemies 0.4 paces", max: 2, effects: { knockback: 0.4 } }),
  N({ id: "tri.h.reach", species: "trike", branch: "horn", tier: 2, name: "Long Horns", text: "+5% reach", max: 2, stats: { reach: 0.05 } }),
  N({ id: "tri.h.gore", species: "trike", branch: "horn", tier: 3, name: "Goring Wrath", text: "+14% damage, −5% movement speed", max: 1, stats: { damage: 0.14, speed: -0.05 } }),
  N({ id: "tri.b.plate", species: "trike", branch: "bulwark", tier: 1, name: "Plated Frill", text: "+3% damage reduction", max: 3, stats: { armour: 0.03 } }),
  N({ id: "tri.b.vital", species: "trike", branch: "bulwark", tier: 1, name: "Vitality", text: "+6% health", max: 3, stats: { maxHp: 0.06 } }),
  N({ id: "tri.b.spike", species: "trike", branch: "bulwark", tier: 2, name: "Spiked Frill", text: "Brace reflects 20% more", max: 2, effects: { braceReflect: 0.2 } }),
  N({ id: "tri.b.stand", species: "trike", branch: "bulwark", tier: 2, name: "Stand Firm", text: "Below 30% health take 25% less damage for 5 s", max: 1, effects: { lastStand: 0.25 } }),
  N({ id: "tri.b.unbroken", species: "trike", branch: "bulwark", tier: 3, name: "Unbroken", text: "Survive a lethal hit on 1 health once a minute; +4% damage reduction, −5% speed", max: 1, effects: { immortal: 1 }, stats: { armour: 0.04, speed: -0.05 } }),
  N({ id: "tri.d.graze", species: "trike", branch: "herd", tier: 1, name: "Rich Grazing", text: "+20% Feast duration", max: 3, stats: { feast: 0.2 } }),
  N({ id: "tri.d.heart", species: "trike", branch: "herd", tier: 1, name: "Herd Heart", text: "Bellow heals 10% more", max: 2, effects: { healPulse: 0.1 } }),
  N({ id: "tri.d.recover", species: "trike", branch: "herd", tier: 2, name: "Steady Breath", text: "+0.3%/s health regeneration", max: 2, stats: { regen: 0.003 } }),
  N({ id: "tri.d.call", species: "trike", branch: "herd", tier: 2, name: "Louder Bellow", text: "−6% skill cooldown", max: 2, stats: { skillCd: 0.06 } }),
  N({ id: "tri.d.leader", species: "trike", branch: "herd", tier: 3, name: "Herd Leader", text: "+8% experience, +10% Amber, +6% damage", max: 1, stats: { xp: 0.08, amber: 0.1, damage: 0.06 } }),
];
export const nodesFor = (dino: Dino) => TREE.filter((n) => n.species === dino);
export const nodeById = (id: string) => TREE.find((n) => n.id === id);
/** points needed in a branch before its tier opens */
export const TIER_GATE = { 1: 0, 2: 3, 3: 7 } as const;

export const spentPoints = (skills: Record<string, number>) => Object.values(skills).reduce((n, r) => n + r, 0);
export const branchPoints = (skills: Record<string, number>, dino: Dino, branch: string) =>
  nodesFor(dino)
    .filter((n) => n.branch === branch)
    .reduce((n, node) => n + (skills[node.id] ?? 0), 0);
export const availablePoints = (level: number, skills: Record<string, number>) => Math.max(0, skillPointsAtLevel(level) - spentPoints(skills));

export interface RankCheck {
  ok: boolean;
  reason?: string;
}
export function canRank(dino: Dino, level: number, skills: Record<string, number>, id: string): RankCheck {
  const n = nodeById(id);
  if (!n || n.species !== dino) return { ok: false, reason: "Not part of this dinosaur’s tree" };
  if ((skills[id] ?? 0) >= n.max) return { ok: false, reason: "Already at full rank" };
  if (availablePoints(level, skills) < 1) return { ok: false, reason: "No skill points left" };
  const need = TIER_GATE[n.tier];
  if (branchPoints(skills, dino, n.branch) < need) return { ok: false, reason: `Spend ${need} points in this branch first` };
  return { ok: true };
}
export function rankUp(dino: Dino, level: number, skills: Record<string, number>, id: string): Record<string, number> | null {
  if (!canRank(dino, level, skills, id).ok) return null;
  return { ...skills, [id]: (skills[id] ?? 0) + 1 };
}
export const respecCost = (level: number) => (level <= 5 ? 0 : 20 + 8 * level);

/** drop invalid/over-budget ranks (corrupt or hand-edited saves) while keeping as much of the build as is legal */
export function sanitiseSkills(dino: Dino, level: number, skills: unknown): Record<string, number> {
  const raw = skills && typeof skills === "object" ? (skills as Record<string, unknown>) : {};
  let out: Record<string, number> = {};
  const ordered = nodesFor(dino).sort((a, b) => a.tier - b.tier);
  for (const n of ordered) {
    const want = typeof raw[n.id] === "number" ? Math.max(0, Math.min(n.max, Math.floor(raw[n.id] as number))) : 0;
    for (let i = 0; i < want; i++) {
      const next = rankUp(dino, level, out, n.id);
      if (!next) break;
      out = next;
    }
  }
  return out;
}

export interface Modifiers {
  stats: StatBlock;
  effects: Effects;
}
export function treeModifiers(dino: Dino, skills: Record<string, number>): Modifiers {
  const stats = zeroStats(),
    effects: Effects = {};
  for (const n of nodesFor(dino)) {
    const r = skills[n.id] ?? 0;
    if (!r) continue;
    for (const [k, v] of Object.entries(n.stats ?? {})) stats[k as StatKey] += v * r;
    for (const [k, v] of Object.entries(n.effects ?? {})) effects[k] = (effects[k] ?? 0) + v * r;
  }
  return { stats, effects };
}
