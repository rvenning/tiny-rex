import { createRequire } from "node:module";
import { it, expect } from "vitest";
import { Simulation } from "../src/game/simulation";
import { LEVELS, relation, value } from "../src/game/content";
import { Random } from "../src/game/random";
import type { Level } from "../src/game/types";
// Reuse the original's player model as an independent test oracle, never at runtime.
const require = createRequire(import.meta.url);
const { play } = require("./legacy/brain.cjs");
let sim: Simulation;
const Game = {
  start: ({ level, seed }: { level: Level; seed: number }) => {
    sim = new Simulation(level, seed);
  },
  get player() {
    return sim.player;
  },
  get ents() {
    return sim.entities.map((e) => ({ ...e, boredT: e.bored }));
  },
  get q() {
    return sim.events;
  },
  get running() {
    return sim.running;
  },
  get result() {
    return sim.result;
  },
  input: {
    set tx(x: number) {
      sim.target.x = x;
    },
    set ty(y: number) {
      sim.target.y = y;
    },
  },
  update: (dt: number) => sim.update(dt),
  end: (win: boolean, reason: string) => sim.end(win, reason),
  edibleCount: () =>
    sim.entities.filter(
      (e) => !e.dead && relation(e.sp, sim.player.tier) === "food",
    ).length,
};
const context = {
  Game,
  LW: 360,
  LH: 560,
  relation,
  speciesValue: value,
  RNG: {
    make: (seed: number) => {
      const r = new Random(seed);
      return {
        float: (a: number, b: number) => r.range(a, b),
        chance: (p: number) => r.next() < p,
      };
    },
  },
};
it("a careful player can clear every valley using the original independent bot model", () => {
  const failures: string[] = [];
  let wins = 0;
  for (const level of LEVELS) {
    let levelWins = 0;
    for (const seed of [11, 47, 903]) {
      const res = play(context, level, "perfect", seed);
      if (res.win) {
        wins++;
        levelWins++;
      }
    }
    if (!levelWins) failures.push(level.name);
  }
  expect(failures).toEqual([]);
  expect(wins / 60).toBeGreaterThanOrEqual(0.95);
}, 60000);
it("the five-year-old player model can progress through all four valleys", () => {
  let wins = 0;
  const walls: string[] = [];
  for (const level of LEVELS) {
    let levelWins = 0;
    for (const seed of [11, 47, 903]) {
      const res = play(context, level, "isabelle", seed);
      if (res.win) {
        wins++;
        levelWins++;
      }
    }
    if (!levelWins) walls.push(level.name);
  }
  expect(walls).toEqual([]);
  expect(wins / 60).toBeGreaterThanOrEqual(0.85);
}, 60000);
