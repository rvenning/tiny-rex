/** Derives everything combat needs from a character's level, mutations, skill tree and Feast. Pure and cached by the caller. */
import type { Dino } from "../adventure/data";
import { SPECIES, baseDamage, baseHp, feastBonus, stageForLevel } from "./progression";
import { treeModifiers } from "./skills";
import { zeroStats, type Effects, type Mutation, type Slot, type StatBlock } from "./types";

export interface StatInput {
  species: Dino;
  /** effective level (already clamped behind undefeated bosses) */
  level: number;
  skills: Record<string, number>;
  worn: Partial<Record<Slot, Mutation>>;
}
export interface Derived {
  level: number;
  stage: number;
  maxHp: number;
  damage: number;
  swing: number;
  chain: number;
  crit: number;
  critMult: number;
  armour: number;
  speedMult: number;
  reachMult: number;
  dodgeCd: number;
  skillCdMult: number;
  regen: number;
  lifesteal: number;
  thorns: number;
  xpMult: number;
  amberMult: number;
  luck: number;
  feastMult: number;
  feastGlow: boolean;
  effects: Effects;
  /** raw summed mutation + tree stats, for the character sheet */
  sheet: StatBlock;
}

export function gather(input: StatInput): { stats: StatBlock; effects: Effects } {
  const stats = zeroStats();
  const effects: Effects = {};
  for (const m of Object.values(input.worn)) {
    if (!m) continue;
    for (const r of [m.primary, ...m.affixes]) stats[r.stat] += r.value;
    for (const e of m.effects) effects[e.id] = (effects[e.id] ?? 0) + e.value;
  }
  const tree = treeModifiers(input.species, input.skills);
  for (const k of Object.keys(stats) as (keyof StatBlock)[]) stats[k] += tree.stats[k];
  for (const [k, v] of Object.entries(tree.effects)) effects[k] = (effects[k] ?? 0) + v;
  return { stats, effects };
}

export function deriveStats(input: StatInput, feastSeconds = 0): Derived {
  const { stats, effects } = gather(input);
  const sp = SPECIES[input.species];
  const stage = stageForLevel(input.level);
  const feast = feastBonus(feastSeconds);
  // legendary trade-offs that are really stat changes live here so the character sheet shows them
  const dmgExtra = (effects.razorTalons ? -0.15 : 0) + (effects.glowheart ? 0.05 * feast.stacks : 0);
  const speedExtra = (effects.windSplit ? 0.15 : 0) + (effects.stoneback ? -0.15 : 0);
  const sheet = { ...stats };
  if (effects.amberEye) {
    stats.amber += 0.25;
    stats.luck += 0.25;
  }
  return {
    level: input.level,
    stage,
    maxHp: Math.max(20, Math.round(baseHp(input.species, input.level) * (1 + stats.maxHp))),
    damage: baseDamage(input.species, input.level, stage) * Math.max(0.2, 1 + stats.damage + feast.damage + dmgExtra),
    swing: Math.max(0.1, sp.swing / Math.max(0.4, 1 + stats.attackSpeed)),
    chain: sp.chain,
    crit: Math.min(0.75, sp.crit + stats.crit),
    critMult: 1.5 + stats.critDamage,
    armour: Math.max(-0.5, Math.min(0.75, sp.armour + stats.armour)),
    speedMult: Math.max(0.5, 1 + stats.speed + feast.speed + speedExtra),
    reachMult: 1 + stats.reach,
    dodgeCd: sp.dodgeCd * (1 - Math.min(0.6, stats.dodgeCd)),
    skillCdMult: 1 - Math.min(0.5, stats.skillCd),
    regen: Math.max(0, stats.regen) + feast.regen,
    lifesteal: Math.max(0, stats.lifesteal),
    thorns: Math.max(0, stats.thorns),
    xpMult: 1 + stats.xp,
    amberMult: 1 + stats.amber,
    luck: stats.luck,
    feastMult: 1 + stats.feast,
    feastGlow: !!effects.glowheart,
    effects,
    sheet,
  };
}
