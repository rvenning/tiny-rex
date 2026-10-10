import { describe, it, expect } from "vitest";
import { MAX_LEVEL, STAGE_LEVELS, blockedBy, effectiveLevel, feastBonus, feastStacks, levelCap, levelFromXp, stageForLevel, xpForLevel, xpToNext } from "../src/rpg/progression";
import { BASES, SLOTS_FOR, UNIQUES, canWear, compareMutations, describeMutation, mutationScore, rerollAffix, rollMutation, salvageValue, sortMutations } from "../src/rpg/mutations";
import { EFFECTS } from "../src/rpg/effects";
import { ACTIVES, TREE, availablePoints, canRank, defaultLoadout, nodesFor, rankUp, sanitiseSkills, treeModifiers } from "../src/rpg/skills";
import { rollDrop, PITY_LIMIT } from "../src/rpg/loot";
import { deriveStats } from "../src/rpg/stats";
import type { Dino, Rarity, Slot } from "../src/rpg/types";

const DINOS: Dino[] = ["rex", "raptor", "trike"];
const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];

describe("levels, stages and Feast (design §1.1)", () => {
  it("XP curve is monotonic and caps at the maximum level", () => {
    let last = 0;
    for (let l = 1; l < MAX_LEVEL; l++) {
      expect(xpToNext(l)).toBeGreaterThan(last);
      last = xpToNext(l);
    }
    expect(levelFromXp(xpForLevel(MAX_LEVEL) + 1e6)).toBe(MAX_LEVEL);
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(xpForLevel(7))).toBe(7);
    expect(levelFromXp(xpForLevel(7) - 1)).toBe(6);
  });
  it("stages follow level and bosses hold the level cap without losing banked XP", () => {
    expect(STAGE_LEVELS.map((l) => stageForLevel(l))).toEqual([0, 1, 2, 3]);
    expect(levelCap([])).toBe(STAGE_LEVELS[2] - 1);
    expect(levelCap(["river-hunter"])).toBe(STAGE_LEVELS[3] - 1);
    expect(levelCap(["river-hunter", "marsh-pack"])).toBe(MAX_LEVEL);
    const xp = xpForLevel(25);
    expect(effectiveLevel(xp, [])).toBe(9);
    expect(blockedBy(xp, [])).toBe("river-hunter");
    expect(blockedBy(xp, ["river-hunter"])).toBe("marsh-pack");
    expect(blockedBy(xp, ["river-hunter", "marsh-pack"])).toBeNull();
    expect(effectiveLevel(xp, ["river-hunter", "marsh-pack"])).toBe(25);
  });
  it("Feast is temporary, size-based, capped and gives no XP", () => {
    expect(feastStacks(0)).toBe(0);
    expect(feastStacks(1)).toBe(1);
    expect(feastStacks(90)).toBe(5);
    expect(feastStacks(400)).toBe(5);
    expect(feastBonus(90).damage).toBeLessThanOrEqual(0.15);
    expect(feastBonus(90)).not.toHaveProperty("xp");
    expect(feastBonus(0).scale).toBe(0);
  });
});

describe("mutations (design §1.3, §1.4)", () => {
  it("every base and legendary is valid content", () => {
    for (const b of BASES) expect(SLOTS_FOR.rex.concat(SLOTS_FOR.raptor, SLOTS_FOR.trike)).toContain(b.slot);
    for (const u of UNIQUES) {
      expect(EFFECTS[u.effect], u.id).toBeTruthy();
      const base = BASES.find((b) => b.id === u.base)!;
      expect(base.slot).toBe(u.slot);
      for (const s of u.species) expect(SLOTS_FOR[s]).toContain(u.slot);
    }
  });
  it("rolls are deterministic per seed and respect species/slot eligibility", () => {
    for (const species of DINOS) {
      for (const rarity of RARITIES) {
        for (let seed = 1; seed <= 60; seed++) {
          const a = rollMutation({ seed, ilvl: 5, species, rarity });
          const b = rollMutation({ seed, ilvl: 5, species, rarity });
          expect(a).toEqual(b);
          expect(SLOTS_FOR[species]).toContain(a.slot);
          expect(canWear(a, species)).toBe(true);
          expect(a.rarity).toBe(rarity);
          for (const r of [a.primary, ...a.affixes]) {
            expect(r.value).toBeGreaterThanOrEqual(Math.min(r.min, r.max) - 1e-9);
            expect(r.value).toBeLessThanOrEqual(Math.max(r.min, r.max) + 1e-9);
          }
          for (const e of a.effects) expect(EFFECTS[e.id], e.id).toBeTruthy();
        }
      }
    }
  });
  it("rarity decides affix count and gameplay effects; legendaries carry a named unique", () => {
    for (let seed = 1; seed < 80; seed++) {
      const c = rollMutation({ seed, ilvl: 3, species: "raptor", rarity: "common" });
      expect(c.affixes.length).toBeLessThanOrEqual(1);
      expect(c.effects).toHaveLength(0);
      const r = rollMutation({ seed, ilvl: 3, species: "raptor", rarity: "rare" });
      expect(r.affixes).toHaveLength(2);
      const e = rollMutation({ seed, ilvl: 3, species: "raptor", rarity: "epic" });
      expect(e.affixes).toHaveLength(3);
      expect(e.effects).toHaveLength(1);
      const l = rollMutation({ seed, ilvl: 3, species: "raptor", rarity: "legendary" });
      expect(l.unique).toBeTruthy();
      expect(l.effects).toHaveLength(1);
      expect(l.species).toContain("raptor");
    }
  });
  it("Triceratops never rolls claws or jaws and Rex never rolls claws or horns", () => {
    const slots = (species: Dino) => new Set<Slot>(Array.from({ length: 400 }, (_, i) => rollMutation({ seed: i + 1, ilvl: 4, species, rarity: RARITIES[i % 4] }).slot));
    expect(slots("trike").has("claws")).toBe(false);
    expect(slots("trike").has("jaws")).toBe(false);
    expect(slots("trike").has("horns")).toBe(true);
    expect(slots("rex").has("claws")).toBe(false);
    expect(slots("rex").has("horns")).toBe(false);
    expect(slots("raptor").has("claws")).toBe(true);
  });
  it("higher rarity is better on average, and higher item level scales values", () => {
    const avg = (r: Rarity) => Array.from({ length: 200 }, (_, i) => mutationScore(rollMutation({ seed: i + 1, ilvl: 8, species: "rex", rarity: r }))).reduce((a, b) => a + b, 0) / 200;
    expect(avg("rare")).toBeGreaterThan(avg("common"));
    expect(avg("epic")).toBeGreaterThan(avg("rare"));
    const lo = rollMutation({ seed: 9, ilvl: 1, species: "rex", rarity: "rare" });
    const hi = rollMutation({ seed: 9, ilvl: 20, species: "rex", rarity: "rare" });
    expect(hi.primary.max).toBeGreaterThan(lo.primary.max);
  });
  it("compare, sort, describe and salvage are transparent", () => {
    const a = rollMutation({ seed: 3, ilvl: 4, species: "rex", rarity: "rare", slot: "jaws" });
    const b = rollMutation({ seed: 4, ilvl: 4, species: "rex", rarity: "epic", slot: "jaws" });
    expect(compareMutations(a, b).length).toBeGreaterThan(0);
    expect(compareMutations(undefined, b).every((d) => d.from === "–" || d.from === "has" || d.better !== null)).toBe(true);
    expect(sortMutations([a, b], "rarity")[0].rarity).toBe("epic");
    expect(describeMutation(b).length).toBe(1 + b.affixes.length + b.effects.length);
    const leg = rollMutation({ seed: 5, ilvl: 4, species: "rex", rarity: "legendary" });
    expect(salvageValue(leg)).toBeGreaterThan(salvageValue(b));
    expect(salvageValue(leg, true)).toBe(salvageValue(leg) * 2);
    expect(salvageValue(b)).toBeGreaterThan(salvageValue(a));
  });
  it("an affix can be rerolled once, and never the primary stat or a legendary", () => {
    const a = rollMutation({ seed: 33, ilvl: 6, species: "raptor", rarity: "rare" });
    const next = rerollAffix(a, 0, "raptor")!;
    expect(next.rerolled).toBe(true);
    expect(next.primary).toEqual(a.primary);
    expect(next.affixes[0].stat).not.toBe(a.affixes[0].stat);
    expect(rerollAffix(next, 1, "raptor")).toBeNull();
    expect(rerollAffix(rollMutation({ seed: 1, ilvl: 3, species: "rex", rarity: "legendary" }), 0, "rex")).toBeNull();
  });
});

describe("skills and the passive tree (design A5)", () => {
  it("every class has four actives and 15 tree nodes with consistent gates", () => {
    for (const d of DINOS) {
      expect(ACTIVES.filter((a) => a.species === d)).toHaveLength(4);
      expect(nodesFor(d)).toHaveLength(15);
      expect(defaultLoadout(d, 1)[0]).toMatch(new RegExp(`^${d}\\.`));
      expect(defaultLoadout(d, 1)[1]).toBeNull();
      expect(defaultLoadout(d, 5)[1]).not.toBeNull();
    }
    for (const n of TREE) for (const id of Object.keys(n.effects ?? {})) expect(EFFECTS[id], `${n.id} → ${id}`).toBeTruthy();
  });
  it("the tree cannot be filled: 29 points for ~33 ranks forces choices", () => {
    for (const d of DINOS) expect(nodesFor(d).reduce((n, x) => n + x.max, 0)).toBeGreaterThan(MAX_LEVEL - 1);
  });
  it("ranks need points and branch investment, and cannot cross classes", () => {
    let skills: Record<string, number> = {};
    expect(canRank("rex", 1, skills, "rex.p.heavy").ok).toBe(false); // no points at level 1
    expect(canRank("rex", 6, skills, "rex.p.apex").ok).toBe(false);
    expect(canRank("rex", 6, skills, "rap.r.hook").ok).toBe(false);
    skills = rankUp("rex", 6, skills, "rex.p.heavy")!;
    skills = rankUp("rex", 6, skills, "rex.p.heavy")!;
    skills = rankUp("rex", 6, skills, "rex.p.heavy")!;
    expect(availablePoints(6, skills)).toBe(2);
    expect(canRank("rex", 6, skills, "rex.p.finisher").ok).toBe(true); // tier 2 opens after 3 points
    expect(canRank("rex", 6, skills, "rex.p.heavy").reason).toMatch(/full rank/);
  });
  it("trade-offs show up in derived stats and sanitising keeps legal builds only", () => {
    const skills = sanitiseSkills("rex", 8, { "rex.p.heavy": 3, "rex.p.apex": 1, "rex.p.crit": 99, "nonsense": 4 });
    expect(skills["rex.p.apex"]).toBeUndefined(); // not enough branch points yet
    expect(skills["rex.p.heavy"]).toBe(3);
    expect(skills["nonsense"]).toBeUndefined();
    const mods = treeModifiers("rex", { "rex.p.heavy": 3 });
    expect(mods.stats.damage).toBeCloseTo(0.24);
    expect(mods.stats.attackSpeed).toBeCloseTo(-0.09);
    const base = deriveStats({ species: "rex", level: 8, skills: {}, worn: {} });
    const built = deriveStats({ species: "rex", level: 8, skills: { "rex.p.heavy": 3 }, worn: {} });
    expect(built.damage).toBeGreaterThan(base.damage);
    expect(built.swing).toBeGreaterThan(base.swing);
  });
});

describe("derived stats", () => {
  it("mutations change stats and effects; legendary trade-offs apply", () => {
    const talons = rollMutation({ seed: 1, ilvl: 5, species: "raptor", rarity: "legendary", unique: "razortalons" });
    const plain = deriveStats({ species: "raptor", level: 10, skills: {}, worn: {} });
    const worn = deriveStats({ species: "raptor", level: 10, skills: {}, worn: { claws: talons } });
    expect(worn.effects.razorTalons).toBe(1);
    expect(worn.swing).toBeLessThan(plain.swing); // attack-speed fixed roll
    const wind = rollMutation({ seed: 2, ilvl: 5, species: "raptor", rarity: "legendary", unique: "windsplitter" });
    expect(deriveStats({ species: "raptor", level: 10, skills: {}, worn: { legs: wind } }).speedMult).toBeGreaterThan(1.1);
  });
  it("level scales HP and damage, and Feast adds a capped bonus", () => {
    const a = deriveStats({ species: "trike", level: 1, skills: {}, worn: {} });
    const b = deriveStats({ species: "trike", level: 20, skills: {}, worn: {} });
    expect(b.maxHp).toBeGreaterThan(a.maxHp * 2);
    expect(b.damage).toBeGreaterThan(a.damage * 2.5);
    const fed = deriveStats({ species: "trike", level: 1, skills: {}, worn: {} }, 90);
    expect(fed.damage / a.damage).toBeLessThanOrEqual(1.151);
    expect(fed.speedMult).toBeGreaterThan(a.speedMult);
  });
});

describe("loot (design §1.4)", () => {
  const ctx = (over: object = {}) => ({ level: 6, archetype: "rusher" as const, species: "rex" as Dino, luck: 0, lootMult: 1, amberMult: 1, pity: 0, counter: 0, lootSeed: 12345, ...over });
  it("is deterministic for a seed and counter", () => {
    expect(rollDrop(ctx({ counter: 7 }))).toEqual(rollDrop(ctx({ counter: 7 })));
    const results = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(rollDrop(ctx({ counter: i })))));
    expect(results.size).toBeGreaterThan(10);
  });
  it("bosses always drop epic or better on the first kill, minibosses at least rare", () => {
    for (let i = 0; i < 40; i++) {
      const b = rollDrop(ctx({ archetype: "boss", firstKill: true, counter: i }));
      expect(["epic", "legendary", "rare"]).toContain(b.mutation!.rarity);
      expect(b.mutation).toBeTruthy();
      const m = rollDrop(ctx({ archetype: "miniboss", counter: i }));
      if (m.mutation) expect(m.mutation.rarity).not.toBe("common");
    }
  });
  it("drop rates are sane: most small fry drop nothing, and legendaries are rare from ordinary enemies", () => {
    let drops = 0,
      legendary = 0;
    for (let i = 0; i < 2000; i++) {
      const r = rollDrop(ctx({ counter: i, lootSeed: 777 }));
      if (r.mutation) drops++;
      if (r.mutation?.rarity === "legendary") legendary++;
    }
    expect(drops / 2000).toBeGreaterThan(0.06);
    expect(drops / 2000).toBeLessThan(0.2);
    expect(legendary).toBe(0);
  });
  it("bad-luck protection guarantees an epic after the pity limit", () => {
    let hit = false;
    for (let i = 0; i < 50 && !hit; i++) {
      const r = rollDrop(ctx({ archetype: "boss", pity: PITY_LIMIT, counter: i }));
      hit = !!r.mutation && ["epic", "legendary"].includes(r.mutation.rarity);
    }
    expect(hit).toBe(true);
  });
});
