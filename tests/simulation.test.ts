import { describe, it, expect } from "vitest";
import { Simulation } from "../src/game/simulation";
import {
  LEVELS,
  SPECIES,
  relation,
  species,
  NEED,
  PLAYER_R,
  PLAYER_SPEED,
} from "../src/game/content";
import { blankProgress, mergeProgress } from "../src/platform/storage";
import type { Entity } from "../src/game/types";
const contact = (sim: Simulation, id: string): Entity => ({
  id: 999,
  sp: species(id),
  x: sim.player.x + 1,
  y: sim.player.y + 1,
  r: id === "berries" ? 8 : 12,
  face: 1,
  step: 0,
  dir: 0,
  wander: 100,
  flee: 0,
  cooldown: 0,
  hunt: 100,
  bored: 0,
  sprint: 2.2,
  rest: 0,
  beast: false,
  dead: false,
});
describe("Tiny Rex rules", () => {
  it("endless growth caps at Prowler and retains larger predators", () => {
    const sim = new Simulation(null, 37);
    sim.entities = [];
    for (let n = 0; n < 180; n++) sim.eat(contact(sim, "berries"));
    expect(sim.player.tier).toBe(5);
    expect(relation(species("rex"), sim.player.tier)).toBe("danger");
    expect(relation(species("gigano"), sim.player.tier)).toBe("danger");
    expect(sim.running).toBe(true);
    expect(Number.isFinite(sim.bellyFraction)).toBe(true);
    const before = sim.player.belly;
    sim.update(1 / 60);
    expect(sim.player.belly).toBeLessThan(before);
  });
  it("very late waves have a bounded population", () => {
    const sim = new Simulation(null, 37);
    sim.wave = 1000;
    const population = sim.population();
    expect(population.every(([, n]) => n <= 8)).toBe(true);
    expect(population.reduce((total, [, n]) => total + n, 0)).toBeLessThan(90);
  });
  it("hunger and predator pursuit keep escalating after population caps", () => {
    const sample = (wave: number) => {
      const sim = new Simulation(null, 37);
      sim.elapsed = wave * 24;
      sim.wave = wave;
      sim.player.belly = 4;
      const predator = contact(sim, "raptor");
      predator.x = sim.player.x + 100;
      sim.entities = [predator];
      sim.update(1 / 60);
      return {
        drain: 4 - sim.player.belly,
        pursuit: 100 - (predator.x - sim.player.x),
      };
    };
    const early = sample(10),
      late = sample(20);
    expect(late.drain).toBeGreaterThan(early.drain);
    expect(late.pursuit).toBeGreaterThan(early.pursuit);
  });
  it("same size is safe, armour never food, plants always edible", () => {
    for (const s of SPECIES)
      for (let tier = 1; tier <= 7; tier++) {
        if (s.kind === "plant") expect(relation(s, tier)).toBe("food");
        else if (s.spiky) expect(relation(s, tier)).toBe("spiky");
        else if (s.tier === tier) expect(relation(s, tier)).toBe("bump");
      }
  });
  it("finishes the first hunt after enough food; stars depend on hearts", () => {
    const sim = new Simulation(LEVELS[0], 10);
    sim.entities = [];
    for (let i = 0; i < 6; i++) sim.eat(contact(sim, "berries"));
    sim.update(1 / 60);
    expect(sim.result).toMatchObject({
      win: true,
      tier: 2,
      stars: 3,
      catches: 6,
      score: 780,
    });
  });
  it("same-size contact costs neither a heart nor belly", () => {
    const sim = new Simulation(LEVELS[0], 7);
    sim.player.belly = 3;
    sim.entities = [contact(sim, "compy")];
    sim.update(1 / 60);
    expect(sim.hearts).toBe(3);
    expect(sim.player.belly).toBe(3);
    expect(sim.events.some((e) => e.type === "bump")).toBe(true);
  });
  it("armour costs a mouthful but never a heart even after outgrowing it", () => {
    const sim = new Simulation(LEVELS[18], 7);
    sim.player.belly = 10;
    sim.entities = [contact(sim, "kentro")];
    sim.update(1 / 60);
    expect(sim.hearts).toBe(3);
    expect(sim.player.belly).toBe(9);
  });
  it("a scare retains size, grants grace, and does not double-hit", () => {
    const sim = new Simulation(LEVELS[0], 7);
    sim.player.belly = 4;
    const predator = contact(sim, "rex");
    sim.entities = [predator];
    sim.update(1 / 60);
    expect(sim.hearts).toBe(2);
    expect(sim.player.tier).toBe(1);
    expect(sim.player.belly).toBe(3);
    predator.x = sim.player.x;
    predator.y = sim.player.y;
    sim.update(1 / 60);
    expect(sim.hearts).toBe(2);
  });
  it("named finales need their beast, not just growth", () => {
    const sim = new Simulation(LEVELS[4], 10);
    sim.player.belly = 100;
    sim.grow();
    sim.update(1 / 60);
    expect(sim.running).toBe(true);
    const beast = sim.entities.find((e) => e.beast)!;
    expect(beast).toBeDefined();
    sim.eat(beast);
    sim.update(1 / 60);
    expect(sim.result?.win).toBe(true);
  });
  it("feast hunger causes shrink and waves ramp", () => {
    const sim = new Simulation(null, 7);
    sim.player.tier = 2;
    sim.player.r = PLAYER_R[2];
    sim.player.speed = PLAYER_SPEED[2];
    sim.player.belly = 0;
    sim.entities = [];
    sim.update(1 / 60);
    expect(sim.player.tier).toBe(1);
    expect(sim.player.belly).toBeCloseTo(NEED[1] * 0.6);
    sim.elapsed = 24;
    sim.update(1 / 60);
    expect(sim.wave).toBe(1);
  });
  it("seeded target trajectories replay identically", () => {
    const run = () => {
      const sim = new Simulation(LEVELS[8], 123);
      for (let i = 0; i < 1200; i++) {
        sim.target = {
          x: 180 + Math.cos(i * 0.02) * 130,
          y: 280 + Math.sin(i * 0.013) * 220,
        };
        sim.update(1 / 60);
      }
      return JSON.stringify({
        p: sim.player,
        e: sim.entities,
        result: sim.result,
        score: sim.score,
      });
    };
    expect(run()).toBe(run());
  });
  it("dead entities do not accumulate during long hunts", () => {
    const sim = new Simulation(null, 7);
    for (let i = 0; i < 500; i++) {
      sim.eat(contact(sim, "berries"));
      sim.update(1 / 60);
    }
    expect(sim.entities.filter((e) => e.dead)).toHaveLength(0);
    expect(sim.entities.length).toBeLessThan(70);
  });
  it("all authored hunts retain legal growth and beatable beast tiers", () => {
    expect(LEVELS).toHaveLength(20);
    for (const l of LEVELS) {
      expect(l.target).toBeGreaterThan(l.start);
      if (l.beast) expect(species(l.beast.id).tier).toBe(l.target - 1);
    }
  });
});
describe("save merging", () => {
  it("preserves both devices best results and future fields", () => {
    const a = {
      ...blankProgress(),
      levels: { 0: { stars: 3, best: 200 } },
      met: { fern: 1 },
      feastBest: 80,
      catches: 5,
      future: 17,
    };
    const b = {
      ...blankProgress(),
      levels: { 0: { stars: 1, best: 400 }, 1: { stars: 2, best: 300 } },
      met: { rex: 1 },
      feastBest: 50,
      catches: 3,
    };
    const merged = mergeProgress(a, b);
    expect(merged).toMatchObject({
      levels: { 0: { stars: 3, best: 400 }, 1: { stars: 2, best: 300 } },
      met: { fern: 1, rex: 1 },
      feastBest: 80,
      catches: 5,
      future: 17,
    });
    expect(mergeProgress(a, blankProgress())).toEqual(a);
  });
});
