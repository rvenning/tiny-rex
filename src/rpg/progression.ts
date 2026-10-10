/** Level, XP, stage and Feast rules. Pure functions; every constant is the contract in docs/arpg/01-design.md §1.1. */
import type { Dino } from "../adventure/data";

export const MAX_LEVEL = 30;
/** first level of each body stage: Hatchling, Juvenile, Hunter, Apex */
export const STAGE_LEVELS = [1, 5, 10, 18] as const;
/** boss that must fall before the character may reach the level that starts stage i (null = free) */
export const STAGE_BOSS: (string | null)[] = [null, null, "river-hunter", "marsh-pack"];
export const STAGE_NAMES = ["Hatchling", "Juvenile", "Hunter", "Apex"] as const;

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number) => (level >= MAX_LEVEL ? Infinity : Math.round(24 + 16 * level + 1.6 * level * level));
/** total XP that must be banked to *be* `level` */
export function xpForLevel(level: number) {
  let t = 0;
  for (let l = 1; l < level; l++) t += xpToNext(l);
  return t;
}
export function levelFromXp(xp: number) {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
}
/** the highest level reachable with the bosses defeated so far */
export function levelCap(rivals: readonly string[]) {
  let cap = MAX_LEVEL;
  for (let s = STAGE_LEVELS.length - 1; s >= 1; s--) {
    const boss = STAGE_BOSS[s];
    if (boss && !rivals.includes(boss)) cap = STAGE_LEVELS[s] - 1;
  }
  return cap;
}
/** effective level: banked XP is never lost, the level just waits behind an undefeated boss */
export const effectiveLevel = (xp: number, rivals: readonly string[]) => Math.min(levelFromXp(xp), levelCap(rivals));
export function stageForLevel(level: number) {
  let s = 0;
  for (let i = 1; i < STAGE_LEVELS.length; i++) if (level >= STAGE_LEVELS[i]) s = i;
  return s;
}
/** name of the boss blocking further growth, if any */
export function blockedBy(xp: number, rivals: readonly string[]): string | null {
  const lvl = levelFromXp(xp);
  const cap = levelCap(rivals);
  if (lvl <= cap) return null;
  for (let s = STAGE_LEVELS.length - 1; s >= 1; s--) {
    const boss = STAGE_BOSS[s];
    if (boss && !rivals.includes(boss) && STAGE_LEVELS[s] - 1 === cap) return boss;
  }
  return null;
}
export const skillPointsAtLevel = (level: number) => Math.max(0, level - 1);

// ---------------------------------------------------------------- Feast (temporary, size-based growth)
export const FEAST_PER_MEAL = 18;
export const FEAST_MAX = 90;
export const FEAST_STACK_SECONDS = 18;
export const feastStacks = (t: number) => Math.max(0, Math.min(5, Math.ceil(Math.max(0, t) / FEAST_STACK_SECONDS - 1e-9))) + 0;
export const feastBonus = (t: number) => {
  const n = feastStacks(t);
  return { stacks: n, damage: Math.min(0.15, 0.03 * n), speed: 0.02 * n, scale: 0.025 * n, regen: 0.004 * n };
};

// ---------------------------------------------------------------- species bases
export interface SpeciesBase {
  hp: number;
  hpPerLevel: number;
  damage: number;
  /** attack combo tempo: seconds per swing, and swings in the chain */
  swing: number;
  chain: number;
  crit: number;
  armour: number;
  /** baseline dodge cooldown */
  dodgeCd: number;
  /** where this class gets the second skill slot */
  slotBLevel: number;
}
export const SPECIES: Record<Dino, SpeciesBase> = {
  rex: { hp: 130, hpPerLevel: 10, damage: 12, swing: 0.38, chain: 3, crit: 0.05, armour: 0.0, dodgeCd: 1.0, slotBLevel: 5 },
  raptor: { hp: 90, hpPerLevel: 7, damage: 7.5, swing: 0.24, chain: 4, crit: 0.12, armour: 0.0, dodgeCd: 0.8, slotBLevel: 5 },
  trike: { hp: 150, hpPerLevel: 11, damage: 10, swing: 0.46, chain: 3, crit: 0.04, armour: 0.15, dodgeCd: 1.15, slotBLevel: 5 },
};
/** base damage of one basic hit before mutations and skills */
export const baseDamage = (dino: Dino, level: number, stage: number) => SPECIES[dino].damage * (1 + 0.09 * (level - 1)) * (1 + 0.15 * stage);
export const baseHp = (dino: Dino, level: number) => Math.round(SPECIES[dino].hp + SPECIES[dino].hpPerLevel * (level - 1));

// ---------------------------------------------------------------- enemy scaling
export const enemyHp = (baseHpValue: number, level: number) => baseHpValue * (1 + 0.14 * (level - 1));
export const enemyDamage = (hearts: number, level: number) => hearts * 28 * (1 + 0.1 * (level - 1));
export const enemyXp = (level: number, power: number) => Math.round((6 + 3.2 * level) * (1 + power * 0.35));
/** XP is damped against creatures far below your level so farming the starter area stops paying */
export const xpDamping = (playerLevel: number, enemyLevel: number) => (playerLevel - enemyLevel <= 2 ? 1 : Math.max(0.15, 1 - 0.22 * (playerLevel - enemyLevel - 2)));

export const DIFFICULTY = {
  gentle: { taken: 0.6, tell: 1.3, enemyHp: 0.9, xp: 1, loot: 1, aim: 1.15 },
  standard: { taken: 1, tell: 1, enemyHp: 1, xp: 1, loot: 1, aim: 0.7 },
  fierce: { taken: 1.25, tell: 1, enemyHp: 1.25, xp: 1.2, loot: 1.2, aim: 0.7 },
} as const;
