import { describe, it, expect } from "vitest";
import { Adventure, idleInput } from "../src/adventure/sim";
import { freshAdventure } from "../src/adventure/save";
import { DISCOVERIES, GROWTH, MAX_HP, byRegion } from "../src/adventure/data";
import { parseWorld, type WorldMeta } from "../src/world/world";

// A real collision grid, isolated from rendering assets and network services.
const world = () => {
  const nx = 220,
    ny = 160,
    n = nx * ny;
  const raw = new Uint8Array(n * 4);
  raw.fill(1, 0, n);
  return parseWorld(
    {
      bounds: [-5, -5, 215, 155],
      cell: 1,
      nx,
      ny,
      surf: ["grass"],
      version: 2,
      pois: {},
      features: [],
      props: [],
      water: [],
    } as WorldMeta,
    raw,
  );
};
const make = (save = freshAdventure(), seed = 42) =>
  new Adventure(world(), save, seed);
const advance = (a: Adventure, n: number, input = idleInput()) => {
  for (let i = 0; i < n; i++) a.update(1 / 60, input);
};
const place = (a: Adventure, x = 20, y = 20) =>
  Object.assign(a.player, { x, y, face: 0, invuln: 0 });

describe("Rebuilt adventure gameplay", () => {
  it("does not lose banked progress on defeat and returns to the saved refuge", () => {
    const save = freshAdventure();
    save.xp.rex = 20;
    save.discoveries = ["fossil-hollow-shelf"];
    const a = make(save);
    a.actors = [];
    place(a);
    a.player.hp = 0;
    advance(a, 1);
    expect(a.player.hp).toBe(MAX_HP);
    expect(a.save.xp.rex).toBe(20);
    expect(a.save.discoveries).toContain("fossil-hollow-shelf");
    expect(a.nearNest).toBe(true);
    expect(a.events.some((e) => e.type === "defeat")).toBe(true);
  });
  it("requires milestone victories for Hunter and Apex even with enough food", () => {
    const save = freshAdventure();
    save.xp.rex = 200;
    const a = make(save);
    expect(a.tier).toBe(1);
    a.save.rivals.push("river-hunter");
    expect(a.stageFor("rex")).toBe(2);
    a.save.rivals.push("marsh-pack");
    expect(a.stageFor("rex")).toBe(3);
  });
  it("growth is applied after a quiet moment and restores health", () => {
    const a = make();
    a.actors = [];
    place(a);
    a.player.hp = 1;
    a.save.xp.rex = GROWTH[0];
    a.pendingGrow = true;
    advance(a, 40);
    expect(a.tier).toBe(1);
    expect(a.player.hp).toBe(MAX_HP);
    expect(a.events.filter((e) => e.type === "grow")).toHaveLength(1);
  });
  it("touching prey does not consume it; a bite has a windup and cooldown", () => {
    const a = make();
    place(a);
    const prey = a.actors.find((x) => x.spec.id === "beetle")!;
    Object.assign(prey, { x: 21, y: 20, state: "feed", t: 10 });
    a.actors = [prey];
    advance(a, 1);
    expect(prey.state).not.toBe("dead");
    const input = idleInput();
    input.bite = true;
    advance(a, 1, input);
    expect(prey.state).not.toBe("dead");
    advance(a, 7, input);
    expect(prey.state).toBe("dead");
    expect(a.save.xp.rex).toBe(1);
    expect(a.events.filter((e) => e.type === "bite")).toHaveLength(1);
    expect(a.biteCooldown).toBeGreaterThan(0);
  });
  it("punishing recovery deals more damage than attacking an active hunter", () => {
    const damage = (state: "stalk" | "recover") => {
      const a = make();
      place(a);
      const actor = a.actors.find((x) => x.spec.id === "raptor")!;
      Object.assign(actor, {
        x: 21,
        y: 20,
        state,
        hp: 100,
        maxHp: 100,
        home: { x: 21, y: 20 },
        t: 10,
        cooldown: 10,
      });
      a.actors = [actor];
      const input = idleInput();
      input.bite = true;
      advance(a, 8, input);
      return 100 - actor.hp;
    };
    expect(damage("recover")).toBeGreaterThan(damage("stalk") * 2);
  });
  it("dodge grants evasion, commits movement and cannot be retriggered instantly", () => {
    const a = make();
    a.actors = [];
    place(a);
    const input = idleInput();
    input.dodge = true;
    input.move.x = 1;
    advance(a, 1, input);
    expect(a.hurt(1, { x: 19, y: 20 })).toBe(false);
    advance(a, 20, input);
    expect(a.player.x).toBeGreaterThan(23);
    expect(a.events.filter((e) => e.type === "dodge")).toHaveLength(1);
    expect(a.dodgeCooldown).toBeGreaterThan(0);
  });
  it("a locked lunge misses a sidestep and enters a punishable recovery", () => {
    const a = make();
    place(a, 20, 23);
    const actor = a.actors.find((x) => x.spec.id === "raptor")!;
    Object.assign(actor, {
      x: 15,
      y: 20,
      home: { x: 15, y: 20 },
      state: "windup",
      dir: 0,
      t: 0.05,
      age: 1,
      provoked: 10,
    });
    a.actors = [actor];
    advance(a, 35);
    expect(a.player.hp).toBe(MAX_HP);
    expect(actor.y).toBeCloseTo(20);
    expect(actor.state).toBe("recover");
  });
  it("juvenile roar interrupts a winding-up hunter", () => {
    const save = freshAdventure();
    save.xp.rex = 8;
    const a = make(save);
    place(a);
    const actor = a.actors.find((x) => x.spec.id === "raptor")!;
    Object.assign(actor, { x: 22, y: 20, state: "windup", t: 0.8, age: 0.1 });
    a.actors = [actor];
    const input = idleInput();
    input.skill = true;
    advance(a, 1, input);
    expect(actor.state).toBe("stagger");
    expect(a.skillCooldown).toBeGreaterThan(0);
  });
  it("fossils grant progress once and cannot be farmed by standing beside them", () => {
    const a = make();
    a.actors = [];
    const fossil = DISCOVERIES.find((d) => d.kind === "fossil")!;
    place(a, fossil.x, fossil.y);
    advance(a, 1);
    const xp = a.save.xp.rex;
    advance(a, 120);
    expect(a.save.discoveries.filter((id) => id === fossil.id)).toHaveLength(1);
    expect(a.save.xp.rex).toBe(xp);
  });
  it("species changes require an unlocked species and a refuge; growth stays separate", () => {
    const save = freshAdventure();
    save.xp.rex = 20;
    save.species.push("raptor");
    const a = make(save);
    a.actors = [];
    place(a);
    expect(a.switchSpecies("raptor")).toBe(false);
    Object.assign(a.player, byRegion("hollow").nest);
    expect(a.switchSpecies("trike")).toBe(false);
    expect(a.switchSpecies("raptor")).toBe(true);
    expect(a.save.xp.rex).toBe(20);
    expect(a.save.xp.raptor).toBe(0);
    expect(a.tier).toBe(0);
  });
  it("armoured grazers cannot be consumed for food", () => {
    const a = make();
    place(a);
    // Add an armoured actor from the typed creature table to the test encounter.
    const actor = a.actors.find((x) => x.spec.id === "raptor")!;
    actor.spec = { ...actor.spec, role: "armour", reward: 0 };
    Object.assign(actor, { x: 21, y: 20, state: "feed", t: 10 });
    a.actors = [actor];
    const hp = actor.hp;
    const input = idleInput();
    input.bite = true;
    advance(a, 8, input);
    expect(actor.hp).toBe(hp);
    expect(a.save.xp.rex).toBe(0);
    expect(a.events.some((e) => e.type === "bounce")).toBe(true);
  });
  it("seeded AI remains deterministic and population stays bounded", () => {
    const a = make(freshAdventure(), 123),
      b = make(freshAdventure(), 123);
    advance(a, 600);
    advance(b, 600);
    expect(a.actors).toEqual(b.actors);
    expect(a.checkpoint(1791530000000)).toEqual(b.checkpoint(1791530000000));
    expect(a.actors.length).toBeLessThan(60);
  });
  it("large frame gaps do not teleport the player through the collision grid", () => {
    const a = make();
    a.actors = [];
    place(a);
    const input = idleInput();
    input.move.x = 1;
    a.update(10, input);
    expect(a.player.x - 20).toBeLessThan(0.2);
    expect(a.world.grid.fits(a.player.x, a.player.y, a.radius)).toBe(true);
  });
});

describe("Species discoveries and diets", () => {
  it("rescued Raptor eggs unlock it permanently and survive a checkpoint reload", () => {
    const a = make();
    a.actors = [];
    const egg = DISCOVERIES.find((d) => d.id === "egg-hollow")!;
    place(a, egg.x, egg.y);
    advance(a, 1);
    expect(a.save.species).toContain("raptor");
    const xp = a.save.xp.rex;
    advance(a, 120);
    expect(a.save.xp.rex).toBe(xp);
    expect(make(a.checkpoint()).save.species).toContain("raptor");
  });
  it("Trike requires both the fossil and four distinct creature studies", () => {
    const a = make();
    a.actors = [];
    a.save.studied = ["beetle", "compy", "dragonfly"];
    const fossil = DISCOVERIES.find((d) => d.id === "fossil-hollow-shelf")!;
    place(a, fossil.x, fossil.y);
    advance(a, 1);
    expect(a.save.species).not.toContain("trike");
    a.save.studied.push("raptor");
    advance(a, 1);
    expect(a.save.species).toContain("trike");
    expect(make(a.checkpoint()).save.species).toContain("trike");
  });
  it("Trike grazes intentionally, grows on plants and cannot immediately farm one patch", () => {
    const save = freshAdventure();
    save.species.push("trike");
    save.snapshot.dino = "trike";
    const a = make(save);
    a.actors = [];
    const plant = DISCOVERIES.find((d) => d.kind === "forage")!;
    place(a, plant.x, plant.y);
    advance(a, 2);
    expect(a.save.xp.trike).toBe(0);
    const input = idleInput();
    input.bite = true;
    advance(a, 8, input);
    expect(a.save.xp.trike).toBe(2);
    advance(a, 120, input);
    expect(a.save.xp.trike).toBe(2);
  });
  it("Trike horns and charge do not injure or consume ordinary prey", () => {
    const save = freshAdventure();
    save.species.push("trike");
    save.snapshot.dino = "trike";
    const a = make(save);
    place(a);
    const prey = a.actors.find((x) => x.spec.id === "beetle")!;
    Object.assign(prey, { x: 21, y: 20, state: "feed", t: 10 });
    a.actors = [prey];
    const input = idleInput();
    input.bite = true;
    advance(a, 8, input);
    expect(prey.hp).toBe(prey.maxHp);
    expect(a.save.xp.trike).toBe(0);
    advance(a, 25);
    input.bite = false;
    input.skill = true;
    advance(a, 30, input);
    expect(prey.hp).toBe(prey.maxHp);
    expect(a.save.xp.trike).toBe(0);
  });
});

describe("World discovery persistence", () => {
  it("preserves previously earned remote-region knowledge while resuming at a built refuge", () => {
    const save = freshAdventure();
    save.regions.push("marsh", "ember");
    save.nests.push("ember");
    save.snapshot.nest = "ember";
    const a = make(save);
    expect(a.save.regions).toContain("ember");
    expect(a.save.nests).toContain("ember");
    expect(a.save.snapshot.nest).toBe("ember");
    expect(a.nearNest).toBe(true);
    expect(a.safe).toBe(true);
  });
  it("connected regions award exploration once across reloads", () => {
    const a = make();
    a.actors = [];
    place(a, 100, 30);
    advance(a, 1);
    expect(a.save.regions).toContain("river");
    expect(a.save.xp.rex).toBe(2);
    const resumed = make(a.checkpoint(1)); resumed.actors=[]; advance(resumed,2);
    expect(resumed.save.xp.rex).toBe(2);
  });
});
