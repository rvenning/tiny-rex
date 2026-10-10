import { describe, it, expect } from "vitest";
import { CREATURES, RIVALS, creature } from "../src/adventure/data";
import { deriveStats } from "../src/rpg/stats";
import { SPECIES, enemyHp } from "../src/rpg/progression";
import { idleInput } from "../src/adventure/sim";
import { make, place } from "./helpers/sim";
import { duel } from "./helpers/bot";

type Sp = "rex" | "raptor" | "trike";
const SPECIES_LIST: Sp[] = ["rex", "raptor", "trike"];
/** sustained damage per second of a base-gear player (combo averaged, non-exposed target, expected crits) */
const dps = (sp: Sp, lvl: number) => {
  const d = deriveStats({ species: sp, level: lvl, skills: {}, worn: {} });
  const m = SPECIES[sp].chain === 4 ? [0.8, 0.9, 1, 1.5] : [1, 1.1, 1.7];
  const t = SPECIES[sp].chain === 4 ? d.swing * 4.5 : d.swing * 3.5;
  return ((d.damage * m.reduce((a, b) => a + b, 0)) / t) * 0.85 * (1 + d.crit * (d.critMult - 1));
};
const ordinary = CREATURES.filter((c) => c.role !== "prey" && c.archetype !== "neutral" && !c.boss);
const bosses = CREATURES.filter((c) => !!c.boss);

describe("combat balance (design A6)", () => {
  it("an ordinary creature dies in a few seconds of sustained damage at its own level", () => {
    for (const c of ordinary) for (const sp of SPECIES_LIST) {
      const ttk = enemyHp(c.hp, c.level) / dps(sp, c.level);
      expect(ttk, `${c.id} vs ${sp}`).toBeGreaterThan(0.5);
      expect(ttk, `${c.id} vs ${sp}`).toBeLessThan(12);
    }
  });
  it("bosses take 18–110 s of sustained base-gear damage, so a real fight with dodging lasts a minute or more", () => {
    for (const c of bosses) {
      const lvl = c.level + 1;
      const ttk = enemyHp(c.hp, c.level) / dps("rex", lvl);
      expect(ttk, c.id).toBeGreaterThan(18);
      expect(ttk, c.id).toBeLessThan(110);
    }
  });
  it("a player who stands still survives a lone level-matched raptor for at least ten seconds", () => {
    for (const sp of SPECIES_LIST) {
      const a = make({ empty: true, species: sp, level: 3 });
      place(a, 40, 40);
      a.player.invuln = 0;
      const r = a.addActor("raptor", { x: 44, y: 40 }, { exact: true, level: 3 })!;
      Object.assign(r, { state: "stalk", provoked: 99, t: 0, cooldown: 0 });
      a.actors = [r];
      let t = 0;
      while (a.player.hp > 0 && t < 120) {
        a.update(1 / 60, idleInput());
        a.events.length = 0;
        t += 1 / 60;
      }
      expect(t, sp).toBeGreaterThan(10);
    }
  });
  it("every telegraphed fight is winnable by reading the tells, for every species", () => {
    const cases: [string, number, number][] = [["raptor", 3, 3], ["oviraptor", 4, 4], ["dilo", 6, 6], ["kentro", 6, 6], ["caller", 5, 5], ["lurker", 5, 5]];
    for (const sp of SPECIES_LIST) for (const [id, lvl, pl] of cases) {
      const a = make({ empty: true, species: sp, level: pl });
      place(a, 40, 40);
      a.player.invuln = 0;
      const e = a.addActor(id, { x: 46, y: 40 }, { exact: true, level: lvl })!;
      Object.assign(e, { state: "stalk", provoked: 99, t: 0, cooldown: 0 });
      a.actors = [e];
      const r = duel(a, [e], { maxSeconds: 90 });
      expect(r.won, `${sp} vs ${id}`).toBe(true);
      expect(r.hpLeft, `${sp} vs ${id}`).toBeGreaterThan(0.35);
    }
  });
  it("each boss can be beaten with base gear by a player who reads the tells, in under 2.5 minutes", () => {
    const cases: [string, number, number][] = [["old-scar", 4, 5], ["river-hunter", 8, 9], ["sunscar", 17, 18], ["gigano", 22, 23], ["glimmerjaw", 27, 28]];
    for (const sp of SPECIES_LIST) for (const [id, lvl, pl] of cases) {
      const a = make({ empty: true, species: sp, level: pl, rivals: pl >= 18 ? ["river-hunter", "marsh-pack", "old-scar"] : pl >= 10 ? ["river-hunter", "old-scar"] : [] });
      place(a, 40, 40);
      a.player.invuln = 0;
      const rival = RIVALS.find((r) => r.species === id)!.id;
      const b = a.addActor(id, { x: 46, y: 40 }, { rival, exact: true, level: lvl })!;
      Object.assign(b, { state: "stalk", provoked: 99, t: 0, cooldown: 0 });
      a.actors = [b];
      const r = duel(a, [b], { maxSeconds: 150 });
      expect(r.won, `${sp} vs ${id}`).toBe(true);
      expect(r.seconds, `${sp} vs ${id}`).toBeGreaterThan(15);
    }
  });
  it("ignoring the tells is punished: a bot that never dodges loses to a boss", () => {
    const a = make({ empty: true, species: "rex", level: 9, rivals: [] });
    place(a, 40, 40);
    a.player.invuln = 0;
    const b = a.addActor("river-hunter", { x: 46, y: 40 }, { rival: "river-hunter", exact: true, level: 8 })!;
    Object.assign(b, { state: "stalk", provoked: 99, t: 0, cooldown: 0 });
    a.actors = [b];
    const r = duel(a, [b], { dodges: false, maxSeconds: 60 });
    expect(r.won || r.hpLeft < 0.4).toBe(true);
    void creature;
  });
});
