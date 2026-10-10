/** Shared RPG vocabulary. Pure types: no Phaser, DOM or storage. See docs/arpg/01-design.md. */
import type { Dino, Point, RegionId } from "../adventure/data";

export type Slot = "jaws" | "claws" | "horns" | "hide" | "legs" | "tail" | "instinct";
export type Rarity = "common" | "rare" | "epic" | "legendary";
export type Difficulty = "gentle" | "standard" | "fierce";

/** Percent-style stats are fractions (0.12 = +12%). Cooldown stats are fractional reductions. */
export type StatKey =
  | "damage"
  | "attackSpeed"
  | "crit"
  | "critDamage"
  | "maxHp"
  | "armour"
  | "speed"
  | "dodgeCd"
  | "skillCd"
  | "regen"
  | "lifesteal"
  | "thorns"
  | "feast"
  | "xp"
  | "amber"
  | "luck"
  | "reach";
export type StatBlock = Record<StatKey, number>;
export const STAT_KEYS: StatKey[] = [
  "damage",
  "attackSpeed",
  "crit",
  "critDamage",
  "maxHp",
  "armour",
  "speed",
  "dodgeCd",
  "skillCd",
  "regen",
  "lifesteal",
  "thorns",
  "feast",
  "xp",
  "amber",
  "luck",
  "reach",
];
export const zeroStats = (): StatBlock => Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as StatBlock;

/** Gameplay-changing effects, keyed by id with a potency; summed across every source. See rpg/effects.ts. */
export type Effects = Record<string, number>;

export interface Roll {
  stat: StatKey;
  value: number;
  min: number;
  max: number;
}
export interface EffectRoll {
  id: string;
  value: number;
  min: number;
  max: number;
}
export interface Mutation {
  id: string;
  base: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  ilvl: number;
  species: Dino[];
  primary: Roll;
  affixes: Roll[];
  /** rolled gameplay effects (rare+ may carry one) */
  effects: EffectRoll[];
  /** legendary identity, e.g. "thunderlung" */
  unique?: string;
  seed: number;
  rerolled?: boolean;
  at: number;
  fresh?: boolean;
}

export type QuestKind = "main" | "side";
export interface QuestState {
  status: "active" | "done";
  step: number;
  progress: number;
  /** free-form per-quest memory: choices made, clue indexes, timers */
  data: Record<string, number | string | boolean>;
  startedAt: number;
  doneAt?: number;
}

export interface Drop {
  id: string;
  x: number;
  y: number;
  /** present for mutation drops */
  mutation?: Mutation;
  /** present for amber piles */
  amber?: number;
  expires: number;
}

export type { Dino, Point, RegionId };
