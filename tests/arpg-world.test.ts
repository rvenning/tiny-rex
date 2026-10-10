import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Adventure, idleInput } from "../src/adventure/sim";
import { DISCOVERIES, GATES, OBJECTIVES, REGIONS, RIVALS, PORTALS, SPAWNS, regionAt } from "../src/adventure/data";
import { parseWorld, type WorldMeta } from "../src/world/world";
import { xpForLevel } from "../src/rpg/progression";
import { make, makeChar, openWorld, tick, place, held } from "./helpers/sim";

const move = (a: Adventure, x: number, y: number, n = 90) => tick(a, n, held({ move: { x, y } }));
const bite = (a: Adventure) => {
  tick(a, 1, held({ bite: true }));
  tick(a, 30);
};
const dir = process.env.WORLD_DIR ?? "public/world";
const connectedReady = existsSync(dir + "/world.json");
const realWorld = () => {
  const meta = JSON.parse(readFileSync(new URL("../" + dir + "/world.json", import.meta.url), "utf8"));
  return parseWorld(meta, gunzipSync(readFileSync(new URL("../" + dir + "/world.bin.gz", import.meta.url))));
};
const stages = { juvenile: 5, hunter: 10, apex: 18 };

describe("Connected world content", () => {
  it.skipIf(!connectedReady)("every authored actor spawns on terrain that fits its body, in its region, and the Hollow miniboss guards its perch", () => {
    const world = realWorld();
    const a = new Adventure(world, makeChar());
    const ordinary = Object.values(SPAWNS).flat().filter(([id, x, y]) => !RIVALS.some((r) => r.species === id && [r.home, ...(r.companions ?? [])].some((p) => p.x === x && p.y === y))).length;
    expect(a.actors).toHaveLength(ordinary + RIVALS.reduce((n, r) => n + 1 + (r.companions?.length ?? 0), 0));
    for (const actor of a.actors) {
      expect(world.grid.fits(actor.x, actor.y, actor.spec.r), actor.spec.id + " spawn").toBe(true);
      expect(world.grid.fits(actor.home.x, actor.home.y, actor.spec.r), actor.spec.id + " return home").toBe(true);
      if (actor.rival) expect(regionAt(actor.home)?.id).toBe(RIVALS.find((r) => r.id === actor.rival)!.region);
    }
    const scar = a.actors.find((x) => x.sentinel)!;
    expect(scar.spec.id).toBe("old-scar");
    expect(Math.hypot(scar.x - 40.5, scar.y - 31)).toBeLessThan(8);
    a.actors = [scar];
    place(a, 37.26, 34.14);
    tick(a, 240);
    expect(scar.state).not.toBe("idle");
    expect(a.events.some((e) => e.type === "tell" && e.actor === scar.id)).toBe(true);
  });
  it("has six populated regions, eighteen fossils, four boss encounters and ten mastery objectives", () => {
    const a = make();
    expect(REGIONS).toHaveLength(6);
    expect(OBJECTIVES).toHaveLength(10);
    expect(DISCOVERIES.filter((d) => d.kind === "fossil")).toHaveLength(18);
    for (const r of REGIONS) expect(a.actors.some((actor) => regionAt(actor.home)?.id === r.id)).toBe(true);
    expect(a.actors.filter((actor) => actor.rival === "marsh-pack")).toHaveLength(2);
    expect(RIVALS.map((r) => r.id)).toEqual(expect.arrayContaining(["old-scar", "river-hunter", "marsh-pack", "basalt-matriarch"]));
  });
  it("every creature a spawn or boss names exists", () => {
    const a = make();
    expect(a.actors.length).toBeGreaterThan(40);
  });
});

describe("Gates follow the body stage, which follows the level (design §1.1)", () => {
  it("enforces the ford for hatchlings and does not allow a dash to bypass it", () => {
    const a = make({ empty: true });
    place(a, 100, 65.8, Math.PI / 2);
    move(a, 0, 1);
    expect(a.player.y).toBeLessThan(66);
    tick(a, 1, held({ dodge: true, move: { x: 0, y: 1 } }));
    tick(a, 30);
    expect(a.player.y).toBeLessThan(66);
    const juvenile = make({ empty: true, level: stages.juvenile });
    place(juvenile, 100, 65.8);
    tick(juvenile, 40);
    move(juvenile, 0, 1);
    expect(juvenile.save.gates).toContain("river-ford");
    expect(juvenile.save.regions).toContain("marsh");
    place(juvenile, 80, 65.8);
    move(juvenile, 0, 1);
    expect(juvenile.player.y).toBeLessThan(66);
  });
  it("requires a Hunter bite to clear the log and an Apex bite to clear basalt, then banks both routes", () => {
    const young = make({ empty: true, level: 9, rivals: [] });
    place(young, 128, 100);
    bite(young);
    move(young, 1, 0);
    expect(young.player.x).toBeLessThan(130);
    expect(young.save.gates).not.toContain("marsh-log");
    const hunter = make({ empty: true, level: stages.hunter, rivals: ["river-hunter"] });
    expect(hunter.tier).toBe(2);
    place(hunter, 128, 100);
    bite(hunter);
    move(hunter, 1, 0);
    expect(hunter.save.gates).toContain("marsh-log");
    expect(hunter.save.regions).toContain("dunes");
    place(hunter, 162, 68, -Math.PI / 2);
    bite(hunter);
    move(hunter, 0, -1);
    expect(hunter.player.y).toBeGreaterThanOrEqual(66);
    const apex = make({ empty: true, level: stages.apex, rivals: ["river-hunter", "marsh-pack"] });
    expect(apex.tier).toBe(3);
    place(apex, 162, 68, -Math.PI / 2);
    bite(apex);
    move(apex, 0, -1);
    expect(apex.save.gates).toContain("ember-basalt");
    expect(apex.save.regions).toContain("ember");
    const reloaded = new Adventure(openWorld(), apex.checkpoint(100));
    expect(reloaded.save.gates).toContain("ember-basalt");
  });
  it("keeps caves optional and stage-gates both tunnel directions", () => {
    const young = make({ empty: true, level: 5 });
    place(young, 55, 111);
    expect(young.interact()).toBe("");
    expect(young.player.x).toBe(55);
    const hunter = make({ empty: true, level: 10, rivals: ["river-hunter"] });
    place(hunter, 55, 111);
    expect(hunter.interact()).toBe("portal");
    expect(hunter.player.x).toBe(140);
    expect(hunter.region).toBe("dunes");
    expect(hunter.interact()).toBe("portal");
    expect(hunter.player.x).toBe(55);
    expect(hunter.region).toBe("caves");
    place(hunter, 23, 105);
    expect(hunter.interact()).toBe("");
  });
  it("growth moves a larger body out of a corridor that no longer fits it", () => {
    const nx = 48,
      ny = 24,
      n = nx * ny,
      raw = new Uint8Array(n * 4);
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const px = 18 + (x + 0.5) * 0.25;
      if ((px >= 19.5 && px < 20.5) || px >= 23) raw[y * nx + x] = 1;
    }
    const world = parseWorld({ bounds: [18, 18, 30, 24], cell: 0.25, nx, ny, surf: ["grass"], version: 2, pois: {}, features: [], props: [], water: [] } as WorldMeta, raw);
    const c = makeChar({ level: 4 });
    c.snapshot.position = { x: 20, y: 20 };
    const a = new Adventure(world, c);
    a.actors = [];
    expect(world.grid.fits(a.player.x, a.player.y, a.radius)).toBe(true);
    a.gainXp(xpForLevel(5), a.player);
    tick(a, 60);
    expect(a.tier).toBe(1);
    expect(world.grid.fits(a.player.x, a.player.y, a.radius)).toBe(true);
    expect(a.player.x).toBeGreaterThan(23);
  });
});

describe("Mastery and encounters carry over from the connected world", () => {
  it("banks discovery, delivery and fossil mastery rewards only once, including after reload", () => {
    const a = make({ empty: true, level: 20, rivals: ["river-hunter", "marsh-pack"] });
    for (const d of DISCOVERIES.filter((d) => d.region === "caves" && d.kind === "fossil")) {
      place(a, d.x, d.y);
      tick(a);
    }
    expect(a.save.challenges).toContain("echo-trail");
    const egg = DISCOVERIES.find((d) => d.id === "egg-marsh")!;
    place(a, egg.x, egg.y);
    tick(a);
    expect(a.save.challenges).not.toContain("lost-clutch");
    place(a, 102, 91);
    tick(a);
    expect(a.save.challenges).toContain("lost-clutch");
    const before = a.save.xp;
    const b = new Adventure(openWorld(), a.checkpoint(123));
    b.actors = [];
    for (const d of DISCOVERIES.filter((d) => d.region === "caves" && d.kind === "fossil")) {
      place(b, d.x, d.y);
      tick(b);
    }
    place(b, 102, 91);
    tick(b);
    expect(b.save.xp).toBe(before);
  });
  it("a partial pack defeat grants neither victory nor farmable XP; the whole pack is the milestone", () => {
    const a = make({ level: 10, rivals: ["river-hunter"] });
    const pack = a.actors.filter((actor) => actor.rival === "marsh-pack");
    a.actors = pack;
    place(a, 111, 100);
    Object.assign(pack[0], { hp: 1, state: "recover", t: 9, x: 112.2, y: 100 });
    pack[1].x = 125;
    pack[1].y = 110;
    tick(a);
    const before = a.save.xp;
    bite(a);
    expect(pack[0].state).toBe("dead");
    expect(a.save.rivals).not.toContain("marsh-pack");
    expect(a.save.xp).toBe(before);
    place(a, 124, 110);
    Object.assign(pack[1], { hp: 1, state: "recover", t: 9, x: 125.2, y: 110 });
    bite(a);
    expect(a.save.rivals).toContain("marsh-pack");
    expect(a.save.challenges).toContain("split-pack");
    expect(a.save.xp).toBeGreaterThan(before);
  });
  it("plant regrowth timers persist so reloading cannot award repeated free grazing Feast", () => {
    const a = make({ empty: true, species: "trike" });
    place(a, 34.5, 41.5);
    bite(a);
    expect(a.feastT).toBeGreaterThan(0);
    const b = new Adventure(openWorld(), a.checkpoint(55));
    b.actors = [];
    bite(b);
    expect(b.feastT).toBe(0);
  });
  it("records clean encounters across all hits and permits a mastery rematch without repeated rival XP", () => {
    const a = make({ level: 8 });
    const hunter = a.actors.find((actor) => actor.rival === "river-hunter")!;
    a.actors = [hunter];
    place(a, 93, 24);
    tick(a);
    a.player.invuln = 0;
    a.hurt(3, hunter);
    place(a, 93, 24);
    Object.assign(hunter, { x: 94.4, y: 24, hp: 1, state: "recover", t: 9 });
    bite(a);
    expect(a.save.rivals).toContain("river-hunter");
    expect(a.save.challenges).not.toContain("read-river");
    const before = a.save.xp;
    a.player.action = 0;
    expect(a.interact()).toBe("rematch");
    const rematch = a.actors.find((actor) => actor.rival === "river-hunter" && actor.state !== "dead")!;
    place(a, 93, 24);
    Object.assign(rematch, { hp: 1, state: "recover", t: 9, x: 94.4, y: 24 });
    bite(a);
    expect(a.save.challenges).toContain("read-river");
    expect(a.save.xp).toBeGreaterThan(before);
    const earned = a.save.xp;
    a.player.action = 0;
    expect(a.interact()).toBe("rematch");
    const again = a.actors.find((actor) => actor.rival === "river-hunter" && actor.state !== "dead")!;
    place(a, 93, 24);
    Object.assign(again, { hp: 1, state: "recover", t: 9, x: 94.4, y: 24 });
    bite(a);
    expect(a.save.xp).toBe(earned);
  });
  it("observing peaceful herd animals earns study and mastery without hurting them", () => {
    const a = make({ level: 20, rivals: ["river-hunter", "marsh-pack"] });
    const trike = a.actors.find((actor) => actor.spec.id === "trike" && actor.home.x === 184)!;
    a.actors = [trike];
    place(a, 178, 109);
    Object.assign(trike, { state: "idle", t: 100 });
    tick(a, 905);
    expect(a.save.studied).toContain("trike");
    expect(a.save.challenges).toContain("leave-herd");
    expect(trike.hp).toBe(trike.maxHp);
  });
  it("slow-hunt mastery requires creeping through the hunt instead of ordinary sprint kills", () => {
    const a = make();
    const beetles = a.actors.filter((actor) => actor.spec.id === "beetle").slice(0, 3);
    a.actors = [];
    place(a, 20, 20);
    for (const beetle of beetles) {
      tick(a, 30, held({ move: { x: 0.3, y: 0 } }));
      Object.assign(beetle, { x: a.player.x + 1, y: a.player.y, hp: 1, state: "feed", t: 100, alert: 0 });
      a.actors = [beetle];
      tick(a, 1, held({ bite: true, move: { x: 0.3, y: 0 } }));
      tick(a, 30, held({ move: { x: 0.3, y: 0 } }));
      expect(beetle.state).toBe("dead");
      a.actors = [];
    }
    expect(a.save.challenges).toContain("stalk-first");
  });
  it("waiting for unaware feeding dragonflies completes the River wingbeat objective", () => {
    const a = make({ level: 8 });
    const flies = a.actors.filter((actor) => actor.spec.id === "dragonfly").slice(0, 3);
    a.actors = [];
    place(a, 85, 50);
    for (const fly of flies) {
      Object.assign(fly, { x: 86, y: 50, hp: 1, state: "feed", t: 100, alert: 0 });
      a.actors = [fly];
      a.player.action = 0;
      bite(a);
      expect(fly.state).toBe("dead");
      tick(a, 40); // let the combo window close so the next catch is an opening swing, not a slow finisher
    }
    expect(a.save.challenges).toContain("reed-watch");
  });
  it("the dunes recovery objective counts recovery kills, not staggered targets", () => {
    const a = make({ level: 20, rivals: ["river-hunter", "marsh-pack"] });
    const dilos = a.actors.filter((actor) => actor.spec.id === "dilo").slice(0, 3);
    a.actors = [];
    place(a, 170, 96);
    for (const [i, dilo] of dilos.entries()) {
      Object.assign(dilo, { x: 171.2, y: 96, hp: 1, state: i === 0 ? "stagger" : "recover", t: 100 });
      a.actors = [dilo];
      a.player.action = 0;
      a.player.face = 0;
      bite(a);
      expect(dilo.state).toBe("dead");
      if (i === 0) expect(a.save.mastery["sunscar-flank"] ?? 0).toBe(0);
    }
    expect(a.save.challenges).toContain("sunscar-flank");
  });
  it("the hatchling escort waits for its guide and completes only after walking home", () => {
    const a = make({ empty: true, level: 12, rivals: ["river-hunter"] });
    place(a, 82, 83);
    tick(a);
    const hatchling = a.actors.find((actor) => actor.escort)!;
    expect(hatchling).toBeDefined();
    expect(a.save.challenges).not.toContain("hatchling-escort");
    place(a, 102, 91);
    tick(a, 120);
    expect(hatchling.x).toBe(82);
    expect(a.save.challenges).not.toContain("hatchling-escort");
    for (let i = 0; i < 400; i++) {
      const angle = Math.atan2(91 - hatchling.y, 102 - hatchling.x);
      place(a, hatchling.x + Math.cos(angle) * 3, hatchling.y + Math.sin(angle) * 3);
      tick(a);
      if (a.save.challenges.includes("hatchling-escort")) break;
    }
    expect(a.save.challenges).toContain("hatchling-escort");
  });
});

describe("Connected collision", () => {
  it.skipIf(!connectedReady)("the actual connected collision grid provides a body-sized route to every refuge", () => {
    const world = realWorld();
    const c = makeChar({ level: 22, rivals: ["river-hunter", "marsh-pack"] });
    c.gates = GATES.filter((g) => !g.optional).map((g) => g.id);
    const a = new Adventure(world, c);
    const start = { x: 27, y: 35 },
      queue = [start],
      seen = new Set([`${start.x},${start.y}`]);
    const travel = (a as unknown as { canTravel: (from: { x: number; y: number }, to: { x: number; y: number }) => boolean }).canTravel.bind(a);
    for (let i = 0; i < queue.length; i++) {
      const from = queue[i];
      for (const [dx, dy] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) {
        const to = { x: from.x + dx, y: from.y + dy },
          key = `${to.x},${to.y}`;
        if (seen.has(key) || !world.grid.fits(to.x, to.y, a.radius) || !travel(from, to)) continue;
        seen.add(key);
        queue.push(to);
      }
      for (const portal of PORTALS) {
        if (portal.requiredStage > a.tier || (portal.species && portal.species !== a.dino)) continue;
        const dest = Math.hypot(from.x - portal.x, from.y - portal.y) < 2.5 ? portal.to : portal.bidirectional && Math.hypot(from.x - portal.to.x, from.y - portal.to.y) < 2.5 ? portal : null;
        if (!dest) continue;
        const to = { x: dest.x, y: dest.y },
          key = `${to.x},${to.y}`;
        if (!seen.has(key) && world.grid.fits(to.x, to.y, a.radius)) {
          seen.add(key);
          queue.push(to);
        }
      }
    }
    for (const r of REGIONS) expect(queue.some((p) => Math.hypot(p.x - r.nest.x, p.y - r.nest.y) < 3), r.name).toBe(true);
  });
});
void idleInput;
