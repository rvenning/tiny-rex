/** Drop tables. Deterministic: a character's loot stream is seeded from its own `lootSeed` and kill counter, so drops are
 *  reproducible in tests and cannot be save-scummed by reloading. No real-money or gambling mechanics. */
import type { Dino } from "../adventure/data";
import { Random } from "../game/random";
import { rollMutation } from "./mutations";
import type { Mutation, Rarity } from "./types";

export type Archetype = "prey" | "rusher" | "swarm" | "ranged" | "tank" | "ambusher" | "support" | "miniboss" | "boss";
export interface DropContext {
  /** enemy level and archetype */
  level: number;
  archetype: Archetype;
  elite?: boolean;
  /** first-ever defeat of this boss */
  firstKill?: boolean;
  species: Dino;
  luck: number;
  lootMult: number;
  amberMult: number;
  /** consecutive drops since the last epic-or-better (bad-luck protection) */
  pity: number;
  /** monotonically increasing per-character counter */
  counter: number;
  lootSeed: number;
  at?: number;
}
export interface DropResult {
  mutation?: Mutation;
  amber: number;
  /** new pity counter */
  pity: number;
}
export const PITY_LIMIT = 24;

const CHANCE: Record<Archetype, number> = { prey: 0.04, swarm: 0.06, rusher: 0.12, ranged: 0.16, tank: 0.18, ambusher: 0.14, support: 0.2, miniboss: 0.85, boss: 1 };
const AMBER: Record<Archetype, [number, number]> = { prey: [0, 2], swarm: [1, 3], rusher: [2, 5], ranged: [3, 6], tank: [3, 7], ambusher: [2, 5], support: [3, 6], miniboss: [10, 20], boss: [30, 60] };
/** base rarity weights [common, rare, epic, legendary] */
const WEIGHTS: Record<Archetype, [number, number, number, number]> = {
  prey: [90, 9, 1, 0],
  swarm: [86, 12, 2, 0],
  rusher: [74, 21, 5, 0],
  ranged: [68, 25, 7, 0],
  tank: [62, 28, 9.5, 0.5],
  ambusher: [70, 23, 6.5, 0.5],
  support: [60, 29, 10, 1],
  miniboss: [0, 62, 35, 3],
  boss: [0, 20, 60, 20],
};
const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];

export function rollDrop(ctx: DropContext): DropResult {
  const rng = new Random((ctx.lootSeed ^ Math.imul(ctx.counter + 1, 0x9e3779b1)) >>> 0);
  rng.next();
  const [lo, hi] = AMBER[ctx.archetype];
  const amber = Math.round(rng.range(lo, hi + 0.99) * (1 + ctx.level * 0.12) * ctx.amberMult * (ctx.elite ? 2 : 1));
  const elite = ctx.elite ? 2.6 : 1;
  const chance = Math.min(1, CHANCE[ctx.archetype] * elite * (1 + ctx.luck) * ctx.lootMult);
  if (rng.next() > chance && !(ctx.firstKill && ctx.archetype === "boss")) return { amber, pity: ctx.pity };
  const w = [...WEIGHTS[ctx.archetype]];
  // luck shifts weight from common to the better tiers; elites skip the junk
  const shift = Math.min(0.5, ctx.luck + (ctx.lootMult - 1)) * w[0];
  w[0] -= shift;
  w[1] += shift * 0.55;
  w[2] += shift * 0.35;
  w[3] += shift * 0.1;
  if (ctx.elite) {
    w[1] += w[0] * 0.5;
    w[0] *= 0.5;
  }
  let rarity: Rarity;
  if (ctx.pity >= PITY_LIMIT) rarity = "epic";
  else {
    const total = w.reduce((a, b) => a + b, 0);
    let r = rng.next() * total,
      i = 0;
    for (; i < 3; i++) {
      r -= w[i];
      if (r <= 0) break;
    }
    rarity = RARITIES[i];
  }
  if (ctx.firstKill && ctx.archetype === "boss" && rarity === "common") rarity = "epic";
  const ilvl = Math.max(1, ctx.level + (rng.next() < 0.25 ? 1 : 0));
  const mutation = rollMutation({ seed: Math.floor(rng.next() * 0xffffffff), ilvl, species: ctx.species, rarity, at: ctx.at });
  const better = mutation.rarity === "epic" || mutation.rarity === "legendary";
  return { mutation, amber, pity: better ? 0 : ctx.pity + 1 };
}
