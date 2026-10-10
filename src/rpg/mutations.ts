/** Mutation equipment: bases, affix pool, legendary identities, deterministic rolling, comparison, salvage. */
import type { Dino } from "../adventure/data";
import { Random } from "../game/random";
import { EFFECTS, fmtEffect } from "./effects";
import type { EffectRoll, Mutation, Rarity, Roll, Slot, StatKey } from "./types";

export const SLOT_NAMES: Record<Slot, string> = {
  jaws: "Jaws",
  claws: "Claws",
  horns: "Horns",
  hide: "Hide",
  legs: "Legs",
  tail: "Tail",
  instinct: "Instinct",
};
export const SLOT_ORDER: Slot[] = ["jaws", "claws", "horns", "hide", "legs", "tail", "instinct"];
export const SLOTS_FOR: Record<Dino, Slot[]> = {
  rex: ["jaws", "hide", "legs", "tail", "instinct"],
  raptor: ["jaws", "claws", "hide", "legs", "tail", "instinct"],
  trike: ["horns", "hide", "legs", "tail", "instinct"],
};
export const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];
export const RARITY_NAMES: Record<Rarity, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };
export const RARITY_COLOR: Record<Rarity, string> = { common: "#cfd6c6", rare: "#6cc4ff", epic: "#c58bff", legendary: "#ffb347" };
export const BAG_LIMIT = 24;

export interface StatSpec {
  stat: StatKey;
  label: string;
  /** roll range at item level 1 */
  min: number;
  max: number;
  fmt: "pct" | "num" | "pctps";
}
export const STAT_SPECS: Record<StatKey, StatSpec> = {
  damage: { stat: "damage", label: "Damage", min: 0.05, max: 0.1, fmt: "pct" },
  attackSpeed: { stat: "attackSpeed", label: "Attack speed", min: 0.05, max: 0.09, fmt: "pct" },
  crit: { stat: "crit", label: "Critical chance", min: 0.03, max: 0.07, fmt: "pct" },
  critDamage: { stat: "critDamage", label: "Critical damage", min: 0.1, max: 0.25, fmt: "pct" },
  maxHp: { stat: "maxHp", label: "Health", min: 0.05, max: 0.1, fmt: "pct" },
  armour: { stat: "armour", label: "Damage reduction", min: 0.025, max: 0.06, fmt: "pct" },
  speed: { stat: "speed", label: "Movement speed", min: 0.04, max: 0.08, fmt: "pct" },
  dodgeCd: { stat: "dodgeCd", label: "Dodge cooldown", min: 0.05, max: 0.1, fmt: "pct" },
  skillCd: { stat: "skillCd", label: "Skill cooldown", min: 0.05, max: 0.1, fmt: "pct" },
  regen: { stat: "regen", label: "Health regeneration", min: 0.002, max: 0.006, fmt: "pctps" },
  lifesteal: { stat: "lifesteal", label: "Life on hit", min: 0.01, max: 0.03, fmt: "pct" },
  thorns: { stat: "thorns", label: "Thorns", min: 0.06, max: 0.14, fmt: "pct" },
  feast: { stat: "feast", label: "Feast duration", min: 0.1, max: 0.25, fmt: "pct" },
  xp: { stat: "xp", label: "Experience", min: 0.04, max: 0.09, fmt: "pct" },
  amber: { stat: "amber", label: "Amber found", min: 0.08, max: 0.2, fmt: "pct" },
  luck: { stat: "luck", label: "Mutation luck", min: 0.05, max: 0.12, fmt: "pct" },
  reach: { stat: "reach", label: "Reach", min: 0.04, max: 0.1, fmt: "pct" },
};
export function fmtStat(stat: StatKey, value: number) {
  const f = STAT_SPECS[stat].fmt;
  const sign = stat === "dodgeCd" || stat === "skillCd" ? "−" : "+";
  if (f === "pctps") return `${sign}${(value * 100).toFixed(1)}%/s`;
  return `${sign}${Math.round(value * 100)}%`;
}

export interface BaseDef {
  id: string;
  name: string;
  slot: Slot;
  species: Dino[];
  primary: StatKey;
  /** extra weight for these secondary stats so a base has a feel */
  lean: StatKey[];
  blurb: string;
}
export const BASES: BaseDef[] = [
  { id: "jaw.serrated", name: "Serrated Jaws", slot: "jaws", species: ["rex", "raptor"], primary: "damage", lean: ["crit", "lifesteal"], blurb: "Rows of hooked teeth." },
  { id: "jaw.crusher", name: "Crushing Jaws", slot: "jaws", species: ["rex"], primary: "damage", lean: ["critDamage", "reach"], blurb: "Built to break bone." },
  { id: "jaw.snap", name: "Snapping Jaws", slot: "jaws", species: ["raptor", "rex"], primary: "attackSpeed", lean: ["crit", "speed"], blurb: "Quick and shallow." },
  { id: "claw.sickle", name: "Sickle Claws", slot: "claws", species: ["raptor"], primary: "attackSpeed", lean: ["crit", "critDamage"], blurb: "A curved killing hook." },
  { id: "claw.rake", name: "Raking Claws", slot: "claws", species: ["raptor"], primary: "damage", lean: ["reach", "lifesteal"], blurb: "Long slashing blades." },
  { id: "claw.talon", name: "Talon Spurs", slot: "claws", species: ["raptor"], primary: "crit", lean: ["critDamage", "damage"], blurb: "Needle-sharp spurs." },
  { id: "horn.brow", name: "Brow Horns", slot: "horns", species: ["trike"], primary: "damage", lean: ["reach", "armour"], blurb: "Long, forward-sweeping spears." },
  { id: "horn.nasal", name: "Nasal Horn", slot: "horns", species: ["trike"], primary: "damage", lean: ["critDamage", "crit"], blurb: "One heavy point for goring." },
  { id: "horn.crest", name: "Bone Crest", slot: "horns", species: ["trike"], primary: "armour", lean: ["thorns", "maxHp"], blurb: "Frilled bone that turns a blow." },
  { id: "hide.scale", name: "Armoured Scales", slot: "hide", species: ["rex", "raptor", "trike"], primary: "armour", lean: ["maxHp", "thorns"], blurb: "Overlapping plates." },
  { id: "hide.plume", name: "Dense Plumage", slot: "hide", species: ["raptor", "rex"], primary: "maxHp", lean: ["speed", "dodgeCd"], blurb: "Thick, layered feathers." },
  { id: "hide.frill", name: "Heavy Frill", slot: "hide", species: ["trike"], primary: "armour", lean: ["maxHp", "regen"], blurb: "A shield of living bone." },
  { id: "leg.raptor", name: "Raptor Legs", slot: "legs", species: ["rex", "raptor", "trike"], primary: "speed", lean: ["dodgeCd", "attackSpeed"], blurb: "Springy tendons." },
  { id: "leg.pillar", name: "Pillar Legs", slot: "legs", species: ["rex", "trike"], primary: "maxHp", lean: ["armour", "regen"], blurb: "Thick, planted, unmoved." },
  { id: "leg.sprinter", name: "Long Striders", slot: "legs", species: ["raptor", "rex"], primary: "speed", lean: ["feast", "dodgeCd"], blurb: "Made for the chase." },
  { id: "tail.whip", name: "Whipping Tail", slot: "tail", species: ["rex", "raptor", "trike"], primary: "dodgeCd", lean: ["speed", "crit"], blurb: "Balance and a lashing end." },
  { id: "tail.club", name: "Clubbed Tail", slot: "tail", species: ["rex", "trike"], primary: "damage", lean: ["thorns", "armour"], blurb: "A bony mace." },
  { id: "tail.fan", name: "Plumed Tail", slot: "tail", species: ["raptor", "rex"], primary: "dodgeCd", lean: ["luck", "xp"], blurb: "A showy counterweight." },
  { id: "inst.hunt", name: "Hunter's Instinct", slot: "instinct", species: ["rex", "raptor", "trike"], primary: "skillCd", lean: ["crit", "damage"], blurb: "You know where they will be." },
  { id: "inst.nest", name: "Nest Instinct", slot: "instinct", species: ["rex", "raptor", "trike"], primary: "xp", lean: ["amber", "luck"], blurb: "You remember every fern and footprint." },
  { id: "inst.glow", name: "Glow-gland", slot: "instinct", species: ["rex", "raptor", "trike"], primary: "regen", lean: ["feast", "maxHp"], blurb: "A warm amber light under the skin." },
];
export const baseById = (id: string) => BASES.find((b) => b.id === id);

/** rolled gameplay effects (rare and epic): id, ranges at item level 1, slots where it may appear, species restriction */
interface EffectPool {
  id: string;
  min: number;
  max: number;
  slots: Slot[];
  species?: Dino[];
  weight: number;
  suffix: string;
}
export const EFFECT_POOL: EffectPool[] = [
  { id: "bleed", min: 0.14, max: 0.28, slots: ["claws", "jaws", "horns", "tail"], weight: 3, suffix: "of Rending" },
  { id: "poison", min: 0.14, max: 0.28, slots: ["jaws", "claws", "tail"], weight: 3, suffix: "of Venom" },
  { id: "shock", min: 0.3, max: 0.5, slots: ["claws", "jaws", "horns", "instinct"], weight: 2, suffix: "of Thunder" },
  { id: "execute", min: 0.25, max: 0.5, slots: ["jaws", "horns", "claws", "instinct"], weight: 2, suffix: "of the Finisher" },
  { id: "momentum", min: 0.02, max: 0.04, slots: ["claws", "legs", "instinct"], weight: 2, suffix: "of Momentum" },
  { id: "echo", min: 0.08, max: 0.16, slots: ["jaws", "claws", "horns"], weight: 2, suffix: "of Echoes" },
  { id: "knockback", min: 0.6, max: 1.4, slots: ["horns", "tail", "jaws"], weight: 2, suffix: "of Impact" },
  { id: "roarShock", min: 0.5, max: 0.9, slots: ["instinct", "jaws"], weight: 2, suffix: "of the Roar" },
  { id: "lastStand", min: 0.2, max: 0.35, slots: ["hide", "instinct"], weight: 2, suffix: "of Defiance" },
  { id: "bloodMend", min: 0.02, max: 0.05, slots: ["hide", "jaws", "instinct"], weight: 3, suffix: "of Mending" },
  { id: "dust", min: 0.25, max: 0.4, slots: ["legs", "tail"], weight: 2, suffix: "of Dust" },
];

export interface UniqueDef {
  id: string;
  name: string;
  base: string;
  slot: Slot;
  species: Dino[];
  effect: string;
  /** deliberate stat trade-offs baked into the legendary (value is fixed, not rolled) */
  fixed: Partial<Record<StatKey, number>>;
  flavour: string;
}
export const UNIQUES: UniqueDef[] = [
  { id: "gorgemaw", name: "Gorge-Maw", base: "jaw.crusher", slot: "jaws", species: ["rex"], effect: "devour", fixed: { damage: 0.12, maxHp: 0.06 }, flavour: "It is never full. It is never sorry." },
  { id: "thunderlung", name: "Thunderlung", base: "inst.hunt", slot: "instinct", species: ["rex"], effect: "thunderlung", fixed: { damage: 0.08, skillCd: 0.1 }, flavour: "The whole valley feels the first breath." },
  { id: "stoneback", name: "Stoneback Plates", base: "hide.scale", slot: "hide", species: ["rex"], effect: "stoneback", fixed: { armour: 0.14, maxHp: 0.12 }, flavour: "Lichen grows on it. Nothing else does." },
  { id: "quaketail", name: "Quake Tail", base: "tail.club", slot: "tail", species: ["rex"], effect: "quakeTail", fixed: { damage: 0.1, dodgeCd: 0.12 }, flavour: "Land it and the ground remembers." },
  { id: "razortalons", name: "Razor Talons", base: "claw.sickle", slot: "claws", species: ["raptor"], effect: "razorTalons", fixed: { attackSpeed: 0.14, crit: 0.05 }, flavour: "Each cut finishes itself." },
  { id: "venomfang", name: "Venom Fang", base: "jaw.snap", slot: "jaws", species: ["raptor"], effect: "venomBurst", fixed: { attackSpeed: 0.1, crit: 0.04 }, flavour: "A bite that keeps biting." },
  { id: "windsplitter", name: "Windsplitters", base: "leg.sprinter", slot: "legs", species: ["raptor"], effect: "windSplit", fixed: { dodgeCd: 0.1, maxHp: -0.05 }, flavour: "You are already somewhere else." },
  { id: "mirage", name: "Mirage Plumes", base: "tail.fan", slot: "tail", species: ["raptor"], effect: "mirage", fixed: { dodgeCd: 0.1, luck: 0.1 }, flavour: "It was never quite where you looked." },
  { id: "crown", name: "Crown of the Herd", base: "horn.brow", slot: "horns", species: ["trike"], effect: "crownCharge", fixed: { damage: 0.1, reach: 0.1 }, flavour: "Every matriarch wore it once." },
  { id: "bastion", name: "Bastion Frill", base: "hide.frill", slot: "hide", species: ["trike"], effect: "bastion", fixed: { armour: 0.12, speed: -0.06 }, flavour: "Walls do not apologise." },
  { id: "earthsplit", name: "Earthsplitter", base: "horn.nasal", slot: "horns", species: ["trike"], effect: "earthsplit", fixed: { damage: 0.12, crit: 0.04 }, flavour: "A seam opens where you point." },
  { id: "stampede", name: "Stampede Heart", base: "leg.pillar", slot: "legs", species: ["trike"], effect: "stampede", fixed: { speed: 0.06, maxHp: 0.1 }, flavour: "Once you start, the herd does too." },
  { id: "glowheart", name: "Glowheart", base: "inst.glow", slot: "instinct", species: ["rex", "raptor", "trike"], effect: "glowheart", fixed: { feast: 0.3, regen: 0.004 }, flavour: "A warm, borrowed light." },
  { id: "amber-eye", name: "Amber Eye", base: "inst.nest", slot: "instinct", species: ["rex", "raptor", "trike"], effect: "amberEye", fixed: { amber: 0.25, luck: 0.15 }, flavour: "It saw the valley before it was a valley." },
];
export const uniqueById = (id: string) => UNIQUES.find((u) => u.id === id);

const AFFIX_SUFFIX: Partial<Record<StatKey, string>> = {
  damage: "of Fury",
  attackSpeed: "of Quickness",
  crit: "of Precision",
  critDamage: "of Ruin",
  maxHp: "of Vigour",
  armour: "of Warding",
  speed: "of the Chase",
  dodgeCd: "of Grace",
  skillCd: "of Focus",
  regen: "of Renewal",
  lifesteal: "of Hunger",
  thorns: "of Thorns",
  feast: "of Plenty",
  xp: "of Wisdom",
  amber: "of Fortune",
  luck: "of Luck",
  reach: "of Reach",
};
const RARITY_PREFIX: Record<Rarity, string[]> = {
  common: ["Worn", "Plain", "Rough", "Small"],
  rare: ["Keen", "Tough", "Fine", "Sturdy"],
  epic: ["Gleaming", "Mutant", "Stormed", "Ancient"],
  legendary: [""],
};

const scaleRange = (ilvl: number) => 1 + 0.035 * (Math.max(1, ilvl) - 1);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function pickWeighted<T>(items: T[], weight: (t: T) => number, rng: Random): T {
  const total = items.reduce((n, t) => n + weight(t), 0);
  let r = rng.next() * total;
  for (const it of items) {
    r -= weight(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}
function rollStat(stat: StatKey, ilvl: number, rng: Random, floor = 0): Roll {
  const spec = STAT_SPECS[stat];
  const k = scaleRange(ilvl);
  const min = round3(spec.min * k),
    max = round3(spec.max * k);
  const t = floor + (1 - floor) * rng.next();
  return { stat, value: round3(min + (max - min) * t), min, max };
}

export interface RollRequest {
  seed: number;
  ilvl: number;
  species: Dino;
  rarity: Rarity;
  slot?: Slot;
  unique?: string;
  at?: number;
}
/** Deterministic: the same request always yields the same mutation. */
export function rollMutation(req: RollRequest): Mutation {
  const rng = new Random(req.seed >>> 0);
  rng.next();
  rng.next();
  const slots = SLOTS_FOR[req.species];
  let rarity = req.rarity;
  const uniq = req.unique ? uniqueById(req.unique) : rarity === "legendary" ? pickWeighted(UNIQUES.filter((u) => u.species.includes(req.species)), () => 1, rng) : undefined;
  if (uniq) rarity = "legendary";
  const slot: Slot = uniq ? uniq.slot : req.slot && slots.includes(req.slot) ? req.slot : slots[Math.floor(rng.next() * slots.length)];
  const candidates = BASES.filter((b) => b.slot === slot && b.species.includes(req.species));
  const base = uniq ? baseById(uniq.base)! : candidates[Math.floor(rng.next() * candidates.length)];
  const floor = rarity === "common" ? 0 : rarity === "rare" ? 0.2 : rarity === "epic" ? 0.45 : 0.7;
  const primary = rollStat(base.primary, req.ilvl, rng, floor);
  const pool = (Object.keys(STAT_SPECS) as StatKey[]).filter((s) => s !== base.primary);
  const nAffix = rarity === "common" ? (rng.next() < 0.5 ? 1 : 0) : rarity === "rare" ? 2 : 3;
  const affixes: Roll[] = [];
  for (let i = 0; i < nAffix; i++) {
    const avail = pool.filter((s) => !affixes.some((a) => a.stat === s));
    const stat = pickWeighted(avail, (s) => (base.lean.includes(s) ? 3 : 1), rng);
    affixes.push(rollStat(stat, req.ilvl, rng, floor * 0.8));
  }
  const effects: EffectRoll[] = [];
  let suffix = "";
  if (uniq) {
    effects.push({ id: uniq.effect, value: 1, min: 1, max: 1 });
    for (const [stat, value] of Object.entries(uniq.fixed) as [StatKey, number][]) affixes.push({ stat, value, min: value, max: value });
  } else if (rarity === "epic" || (rarity === "rare" && rng.next() < 0.4)) {
    const options = EFFECT_POOL.filter((e) => e.slots.includes(slot) && (!e.species || e.species.includes(req.species)));
    const e = pickWeighted(options, (x) => x.weight, rng);
    const t = floor + (1 - floor) * rng.next();
    const k = e.id === "knockback" || e.id === "momentum" ? 1 : scaleRange(req.ilvl) ** 0.5;
    const min = round3(e.min * k),
      max = round3(e.max * k);
    effects.push({ id: e.id, value: round3(min + (max - min) * t), min, max });
    suffix = e.suffix;
  }
  if (!suffix && rarity !== "common") suffix = AFFIX_SUFFIX[affixes[0]?.stat ?? base.primary] ?? "";
  const prefix = uniq ? "" : RARITY_PREFIX[rarity][Math.floor(rng.next() * RARITY_PREFIX[rarity].length)];
  const name = uniq ? uniq.name : [prefix, base.name, suffix].filter(Boolean).join(" ");
  return {
    id: `m${(req.seed >>> 0).toString(36)}${req.ilvl}`,
    base: base.id,
    name,
    slot,
    rarity,
    ilvl: req.ilvl,
    species: uniq ? [...uniq.species] : [...base.species],
    primary,
    affixes,
    effects,
    unique: uniq?.id,
    seed: req.seed >>> 0,
    at: req.at ?? 0,
  };
}

export function canWear(m: Mutation, species: Dino) {
  return m.species.includes(species) && SLOTS_FOR[species].includes(m.slot);
}

/** a single comparable number used for sorting and the "better/worse" arrow; not shown as a stat */
export function mutationScore(m: Mutation) {
  const weight: Partial<Record<StatKey, number>> = { damage: 1.2, attackSpeed: 1, crit: 1.4, critDamage: 0.5, maxHp: 0.9, armour: 1.3, speed: 0.9, dodgeCd: 0.8, skillCd: 0.8, regen: 8, lifesteal: 1.4, thorns: 0.4, feast: 0.3, xp: 0.5, amber: 0.3, luck: 0.4, reach: 0.7 };
  let s = 0;
  for (const r of [m.primary, ...m.affixes]) s += Math.abs(r.value) * (weight[r.stat] ?? 1) * Math.sign(r.value || 1);
  s += m.effects.length * 0.12 * (m.rarity === "legendary" ? 3 : 1);
  return Math.round(s * 1000) / 1000;
}
const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
export type SortKey = "rarity" | "slot" | "level" | "recent" | "score";
export function sortMutations(list: Mutation[], by: SortKey): Mutation[] {
  const cmp: Record<SortKey, (a: Mutation, b: Mutation) => number> = {
    rarity: (a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || mutationScore(b) - mutationScore(a),
    slot: (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity],
    level: (a, b) => b.ilvl - a.ilvl || RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity],
    recent: (a, b) => b.at - a.at,
    score: (a, b) => mutationScore(b) - mutationScore(a),
  };
  return [...list].sort(cmp[by]);
}

export interface Delta {
  label: string;
  from: string;
  to: string;
  better: boolean | null;
}
/** transparent comparison for tooltips: what changes if `next` replaces `current` */
export function compareMutations(current: Mutation | undefined, next: Mutation): Delta[] {
  const totals = (m?: Mutation) => {
    const t: Partial<Record<StatKey, number>> = {};
    if (m) for (const r of [m.primary, ...m.affixes]) t[r.stat] = (t[r.stat] ?? 0) + r.value;
    return t;
  };
  const a = totals(current),
    b = totals(next);
  const out: Delta[] = [];
  for (const stat of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<StatKey>) {
    const x = a[stat] ?? 0,
      y = b[stat] ?? 0;
    if (Math.abs(x - y) < 1e-6) continue;
    const lowerIsBetter = false; // cooldown stats are stored as positive reductions, so higher is always better
    const better = lowerIsBetter ? y < x : y > x;
    out.push({ label: STAT_SPECS[stat].label, from: x ? fmtStat(stat, x) : "–", to: y ? fmtStat(stat, y) : "–", better });
  }
  const ea = new Map((current?.effects ?? []).map((e) => [e.id, e.value])),
    eb = new Map(next.effects.map((e) => [e.id, e.value]));
  for (const id of new Set([...ea.keys(), ...eb.keys()])) {
    const name = EFFECTS[id]?.name ?? id;
    if (!ea.has(id)) out.push({ label: name, from: "–", to: "gained", better: true });
    else if (!eb.has(id)) out.push({ label: name, from: "has", to: "lost", better: false });
  }
  return out;
}

export function describeMutation(m: Mutation): string[] {
  const lines = [`${fmtStat(m.primary.stat, m.primary.value)} ${STAT_SPECS[m.primary.stat].label}`];
  for (const a of m.affixes) lines.push(`${fmtStat(a.stat, a.value)} ${STAT_SPECS[a.stat].label}`);
  for (const e of m.effects) lines.push(fmtEffect(e.id, e.value));
  return lines;
}

export function salvageValue(m: Mutation, duplicate = false) {
  const base: Record<Rarity, number> = { common: 6, rare: 18, epic: 50, legendary: 150 };
  const v = Math.round(base[m.rarity] * (1 + 0.08 * (m.ilvl - 1)));
  return duplicate && m.rarity === "legendary" ? v * 2 : v;
}
export const rerollCost = (m: Mutation) => 35 + 12 * m.ilvl;

/** replace one secondary affix (not the primary stat); deterministic from the item's seed and a counter */
export function rerollAffix(m: Mutation, index: number, species: Dino): Mutation | null {
  if (m.rerolled || index < 0 || index >= m.affixes.length || m.unique) return null;
  const rng = new Random((m.seed ^ 0x9e3779b9) >>> 0);
  rng.next();
  const taken = new Set([m.primary.stat, ...m.affixes.map((a) => a.stat)]);
  const options = (Object.keys(STAT_SPECS) as StatKey[]).filter((s) => !taken.has(s));
  const base = baseById(m.base);
  const stat = pickWeighted(options, (s) => (base?.lean.includes(s) ? 3 : 1), rng);
  const floor = m.rarity === "common" ? 0 : m.rarity === "rare" ? 0.16 : 0.36;
  const next = { ...m, affixes: m.affixes.map((a, i) => (i === index ? rollStat(stat, m.ilvl, rng, floor) : a)), rerolled: true };
  void species;
  return next;
}
