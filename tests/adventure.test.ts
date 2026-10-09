import { describe, it, expect } from "vitest";
import { Adventure, idleInput } from "../src/adventure/simulation";
import {
  freshAdventure,
  mergeAdventure,
  validateAdventure,
} from "../src/adventure/save";
import {
  project,
  unproject,
  DISCOVERIES,
  CREATURES,
  nest,
  byRegion,
} from "../src/adventure/content";
const advance = (a: Adventure, n: number, input = idleInput()) => {
  for (let i = 0; i < n; i++) a.update(1 / 60, input);
};
describe("Adventure rules and persistent progress", () => {
  it("projection round-trips world points", () => {
    for (const p of [
      { x: 0, y: 0 },
      { x: 1400, y: 1650 },
      { x: -10, y: 80 },
    ]) {
      const w = unproject(project(p));
      expect(w.x).toBeCloseTo(p.x);
      expect(w.y).toBeCloseTo(p.y);
    }
  });
  it("does not drain growth or reset it after defeat", () => {
    const s = freshAdventure();
    s.xp.rex = 100;
    s.discoveries = ["fossil-hollow-0"];
    const a = new Adventure(s);
    a.actors = [];
    advance(a, 3600);
    expect(a.save.xp.rex).toBe(100);
    a.player.hp = 0;
    advance(a, 1);
    expect(a.player.hp).toBe(3);
    expect(a.save.discoveries).toContain("fossil-hollow-0");
    expect(a.tier).toBe(1);
    expect(a.player.x).toBe(nest(byRegion("hollow")).x);
  });
  it("requires a milestone hunt to become Hunter and Apex", () => {
    const s = freshAdventure();
    s.xp.rex = 2000;
    const a = new Adventure(s);
    expect(a.tier).toBe(1);
    a.save.rivals.push("river-hunter");
    expect(a.tier).toBe(2);
    a.save.rivals.push("marsh-pack");
    expect(a.tier).toBe(3);
  });
  it("crosses the connected creek route but blocks the ford while tiny", () => {
    const a = new Adventure(freshAdventure());
    a.actors = [];
    a.player.x = 890;
    a.player.y = 450;
    const i = idleInput();
    i.move.x = 1;
    advance(a, 20, i);
    expect(a.region).toBe("river");
    a.player.x = 1790;
    advance(a, 20, i);
    expect(a.player.x).toBeLessThan(1800);
    a.save.xp.rex = 100;
    advance(a, 20, i);
    expect(a.region).toBe("marsh");
    expect(a.save.gates).toContain("Shallow ford");
  });
  it("opened routes remain open for a newly unlocked species", () => {
    const s = freshAdventure();
    s.species.push("raptor");
    s.gates.push("Shallow ford");
    s.snapshot.dino = "raptor";
    s.snapshot.position = { x: 1810, y: 450 };
    const a = new Adventure(s);
    a.actors = [];
    const i = idleInput();
    i.move.x = -1;
    advance(a, 20, i);
    expect(a.region).toBe("river");
  });
  it("heavy route requires an attack as well as sufficient growth", () => {
    const s = freshAdventure();
    s.xp.rex = 400;
    s.rivals.push("river-hunter");
    const a = new Adventure(s);
    a.actors = [];
    a.player.x = 2250;
    a.player.y = 890;
    const i = idleInput();
    i.move.y = 1;
    advance(a, 20, i);
    expect(a.player.y).toBeLessThan(900);
    i.bite = true;
    advance(a, 20, i);
    expect(a.region).toBe("dunes");
    expect(a.save.gates).toContain("Fallen log");
  });
  it("ordinary prey requires an intentional bite, not contact", () => {
    const a = new Adventure(freshAdventure());
    const prey = a.actors.find((x) => x.spec.id === "beetle")!;
    a.actors = [prey];
    Object.assign(prey, { x: a.player.x + 30, y: a.player.y });
    a.player.face = 0;
    advance(a, 1);
    expect(prey.state).not.toBe("dead");
    a.bite();
    expect(prey.state).toBe("dead");
    expect(a.save.xp.rex).toBeGreaterThan(0);
  });
  it("a committed bite cannot be spammed within its cooldown", () => {
    const a = new Adventure(freshAdventure());
    a.player.x = 500;
    a.player.y = 500;
    a.player.face = 0;
    const prey = a.actors.find((x) => x.spec.id === "raptor")!;
    a.actors = [prey];
    Object.assign(prey, {
      x: 530,
      y: 500,
      state: "recover",
      timer: 10,
      hp: 100,
    });
    const i = idleInput();
    i.bite = true;
    advance(a, 5, i);
    expect(prey.hp).toBeCloseTo(100 - a.damage * 0.4 * 1.65);
  });
  it("a lunge commits to its tell direction and misses a sidestep", () => {
    const a = new Adventure(freshAdventure());
    a.player.x = 500;
    a.player.y = 500;
    a.player.invuln = 0;
    const r = a.actors.find((x) => x.spec.id === "raptor")!;
    a.actors = [r];
    Object.assign(r, {
      x: 650,
      y: 500,
      state: "tell",
      intent: Math.PI,
      timer: 0.05,
    });
    a.player.y = 650;
    advance(a, 40);
    expect(a.player.hp).toBe(3);
    expect(r.y).toBeCloseTo(500);
    expect(r.state).toBe("recover");
  });
  it("dodge grants a short evasion window; roar interrupts a tell", () => {
    const s = freshAdventure();
    s.xp.rex = 100;
    const a = new Adventure(s);
    const r = a.actors.find((x) => x.spec.id === "raptor")!;
    a.player.x = 500;
    a.player.y = 500;
    Object.assign(r, { x: 550, y: 500, state: "tell", timer: 1 });
    a.actors = [r];
    a.skill();
    expect(r.state).toBe("recover");
    const i = idleInput();
    i.dodge = true;
    advance(a, 1, i);
    expect(a.player.invuln).toBeGreaterThan(0);
    expect(a.dodgeCooldown).toBeGreaterThan(0);
  });
  it("banks a fossil once and unlocks species without erasing Rex growth", () => {
    const s = freshAdventure();
    s.xp.rex = 100;
    const a = new Adventure(s);
    a.actors = [];
    Object.assign(
      a.player,
      DISCOVERIES.find((d) => d.id === "fossil-hollow-0"),
    );
    advance(a, 1);
    const xp = a.save.xp.rex;
    advance(a, 60);
    expect(a.save.xp.rex).toBe(xp);
    Object.assign(
      a.player,
      DISCOVERIES.find((d) => d.id === "egg-marsh"),
    );
    advance(a, 1);
    expect(a.save.species).toContain("raptor");
    Object.assign(a.player, nest(byRegion("marsh")));
    advance(a, 1);
    expect(a.switchSpecies("raptor")).toBe(true);
    expect(a.save.xp.rex).toBeGreaterThan(100);
    expect(a.save.xp.raptor).toBe(0);
  });
  it("seeded simulation produces the same outcome and bounded actor population", () => {
    const a = new Adventure(freshAdventure(), 123),
      b = new Adventure(freshAdventure(), 123);
    advance(a, 600);
    advance(b, 600);
    expect(a.actors).toEqual(b.actors);
    expect(a.actors.length).toBeLessThan(60);
  });
  it("merges growth and discoveries monotonically with the latest complete session snapshot", () => {
    const a = freshAdventure(),
      b = freshAdventure();
    a.xp.rex = 100;
    b.xp.raptor = 150;
    a.discoveries = ["fossil-hollow-0"];
    b.discoveries = ["fossil-river-0"];
    a.snapshot.at = 1791530000000;
    b.snapshot.at = 1791530001000;
    b.snapshot.position = { x: 1100, y: 450 };
    const m = mergeAdventure(a, b);
    expect(m.xp).toEqual({ rex: 100, raptor: 150, trike: 0 });
    expect(m.discoveries).toHaveLength(2);
    expect(m.snapshot.position).toEqual(b.snapshot.position);
    expect(m.snapshot.at).toBe(b.snapshot.at);
    expect(mergeAdventure(m, m)).toEqual(m);
  });
  it("sanitizes corrupt data and retains exact modern timestamps", () => {
    const v = validateAdventure({
      xp: { rex: Infinity },
      species: ["rex", "evil"],
      discoveries: ["<script>"],
      snapshot: { dino: "evil", position: { x: NaN, y: 5 }, at: 1791530000000 },
      updated: 1791530000000,
    });
    expect(v.xp.rex).toBe(0);
    expect(v.species).toEqual(["rex"]);
    expect(v.discoveries).toEqual([]);
    expect(v.snapshot.at).toBe(1791530000000);
    expect(v.snapshot.position).toEqual(nest(byRegion("hollow")));
  });
  it("keeps herbivore diet nonlethal and armour unconsumable", () => {
    const s = freshAdventure();
    s.species.push("trike");
    s.snapshot.dino = "trike";
    const a = new Adventure(s);
    const arm = a.actors.find((x) => x.spec.pattern === "armour")!;
    a.player.x = arm.x - 10;
    a.player.y = arm.y;
    a.player.face = 0;
    a.actors = [arm];
    const before = arm.hp;
    a.bite();
    expect(arm.hp).toBe(before);
    expect(a.save.xp.trike).toBe(0);
  });
});
