import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Adventure } from "../src/adventure/sim";
import { QUESTS, NPCS } from "../src/adventure/content";
import { CREATURES, DISCOVERIES, RIVALS, REGIONS, creature } from "../src/adventure/data";
import { findRoute } from "../src/adventure/guide";
import { parseWorld } from "../src/world/world";
import { make, makeChar, tick, place, held } from "./helpers/sim";
import type { Actor } from "../src/adventure/sim-types";
import type { Point } from "../src/adventure/data";

const clearDialogue = (a: Adventure, choice?: string) => {
  expect(a.dialogue).not.toBeNull();
  a.closeDialogue(choice);
};
const talk = (a: Adventure, npc: string, choice?: string) => {
  const actor = a.actors.find((x) => x.npc === npc && x.state !== "dead")!;
  expect(actor, "npc " + npc).toBeDefined();
  place(a, actor.x - 1.6, actor.y);
  a.player.invuln = 5;
  tick(a, 2);
  expect(a.nearNpc?.npc).toBe(npc);
  expect(a.interact()).toBe("talk");
  clearDialogue(a, choice);
};
const killTagged = (a: Adventure, tag: string) => {
  for (const x of a.actors.filter((z) => z.tag === tag && z.state !== "dead")) {
    x.hp = 0.1;
    place(a, x.x - 1.3, x.y);
    a.player.invuln = 5;
    a.hitEnemy(x, 3, { kind: "basic" });
  }
};
const quest = (a: Adventure, id: string) => a.save.quests[id];
const step = (a: Adventure, id: string) => a.quests.stepOf(id);

describe("A Quiet Nest (the opening chapter)", () => {
  it("starts by itself and walks a new hatchling through hunting, a conversation, a fight and a first mutation", () => {
    const a = make({ level: 1 });
    expect(quest(a, "quiet-nest")?.status).toBe("active");
    expect(a.objective).toMatch(/beetle/i);
    // 1. a beetle
    const beetle = a.actors.find((x) => x.spec.id === "beetle")!;
    a.actors = a.actors.filter((x) => x.npc);
    a.actors.push(beetle);
    place(a, beetle.x - 1, beetle.y);
    Object.assign(beetle, { state: "feed", t: 99, alert: 0 });
    tick(a, 1, held({ bite: true }));
    tick(a, 40);
    expect(beetle.state).toBe("dead");
    expect(step(a, "quiet-nest")?.type).toBe("kill");
    expect(a.objective).toMatch(/small prey/i);
    // 2. two more prey
    for (let i = 0; i < 2; i++) {
      const prey = a.addActor("beetle", { x: 20 + i * 4, y: 60 }, { exact: true, level: 1 })!;
      Object.assign(prey, { state: "feed", t: 99 });
      place(a, prey.x - 1, prey.y);
      tick(a, 1, held({ bite: true }));
      tick(a, 50);
      expect(prey.state).toBe("dead");
    }
    expect(step(a, "quiet-nest")?.type).toBe("talk");
    // 3. Pip
    talk(a, "pip");
    expect(step(a, "quiet-nest")?.type).toBe("kill");
    expect(a.actors.filter((x) => x.tag === "quiet-nest").length).toBe(3);
    // 4. the raiders: only the three that the quest sent count
    const stray = a.addActor("compy-raider", { x: 50, y: 50 }, { exact: true, level: 1 })!;
    stray.hp = 0.1;
    place(a, 49, 50);
    a.player.invuln = 5;
    a.hitEnemy(stray, 3, { kind: "basic" });
    expect(quest(a, "quiet-nest").progress).toBe(0);
    killTagged(a, "quiet-nest");
    expect(step(a, "quiet-nest")?.type).toBe("talk");
    // 5. Mossback hands over the first mutation
    const before = a.save.bag.length;
    talk(a, "mossback");
    expect(quest(a, "quiet-nest").status).toBe("done");
    expect(a.save.bag.length).toBe(before + 1);
    expect(a.save.bag.at(-1)!.rarity).toBe("rare");
    expect(a.save.amber).toBeGreaterThanOrEqual(12);
    expect(a.events.some((e) => e.type === "questdone")).toBe(true);
    // the next chapter is now on offer
    expect(a.quests.marker("mossback")).toBe("offer");
  });
  it("progress survives a save and reload mid-quest", () => {
    const a = make({ level: 1 });
    const beetle = a.actors.find((x) => x.spec.id === "beetle")!;
    beetle.hp = 0.1;
    place(a, beetle.x - 1, beetle.y);
    a.hitEnemy(beetle, 3, { kind: "basic" });
    const b = new Adventure(a.world, a.checkpoint(10));
    expect(quest(b, "quiet-nest").step).toBe(1);
    expect(b.objective).toMatch(/small prey/i);
  });
});

describe("The Missing Hatchlings (vertical slice) — both branches", () => {
  const prepare = (level = 3) => {
    const a = make({ level, mutate: (c) => (c.quests["quiet-nest"] = { status: "done", step: 5, progress: 0, data: {}, startedAt: 1, doneAt: 2 }) });
    a.quests.boot();
    return a;
  };
  const trackAndFight = (a: Adventure) => {
    talk(a, "mossback");
    expect(quest(a, "missing-hatchlings").status).toBe("active");
    const s = step(a, "missing-hatchlings");
    expect(s?.type).toBe("track");
    if (s?.type !== "track") return;
    for (const clue of s.clues) {
      place(a, clue.x, clue.y);
      a.player.invuln = 5;
      tick(a, 3);
    }
    expect(a.events.filter((e) => e.type === "quest" && e.kind === "clue")).toHaveLength(3);
    expect(step(a, "missing-hatchlings")?.type).toBe("kill");
    expect(a.actors.filter((x) => x.tag === "missing-hatchlings").length).toBe(4);
    killTagged(a, "missing-hatchlings");
    tick(a, 2);
    expect(step(a, "missing-hatchlings")?.type).toBe("choice");
    expect(a.actors.filter((x) => x.npc === "hatchlings")).toHaveLength(3);
  };
  const finish = (a: Adventure, branch: "hatch-escort" | "hatch-guard") => {
    const scar = a.actors.find((x) => x.rival === "old-scar")!;
    scar.hp = 0.1;
    scar.state = "recover";
    scar.t = 9;
    place(a, scar.x - 1.4, scar.y);
    a.player.invuln = 9;
    a.hitEnemy(scar, 3, { kind: "basic" });
    expect(a.save.rivals).toContain("old-scar");
    expect(step(a, "missing-hatchlings")?.type).toBe("talk");
    talk(a, "mossback");
    expect(quest(a, "missing-hatchlings").status).toBe("done");
    expect(a.hasFlag("hollow-restored")).toBe(true);
    expect(a.actors.some((x) => x.npc === "hatchling-home")).toBe(true);
    expect(a.save.bag.some((m) => m.slot === (branch === "hatch-escort" ? "hide" : "instinct"))).toBe(true);
    expect(a.quests.journal().find((j) => j.id === "missing-hatchlings")!.steps.every((s) => s.state === "done")).toBe(true);
    // Mossback's closing words play once
    place(a, 29, 37);
    const m = a.actors.find((x) => x.npc === "mossback")!;
    place(a, m.x - 1.6, m.y);
    a.player.invuln = 5;
    tick(a, 2);
    expect(a.interact()).toBe("talk");
    expect(a.dialogue!.kind).toBe("after");
    a.closeDialogue();
    expect(a.interact()).toBe("talk");
    expect(a.dialogue!.kind).toBe("chatter");
    a.closeDialogue();
  };
  it("escort branch: choose to lead them home, survive the trail, the hatchlings follow, Old Scar falls, the nest is restored", () => {
    const a = prepare();
    trackAndFight(a);
    talk(a, "hatchlings", "escort");
    expect(a.hasFlag("hatch-escort")).toBe(true);
    expect(step(a, "missing-hatchlings")?.type).toBe("escort");
    expect(a.actors.filter((x) => x.follow)).toHaveLength(3);
    // walk them home: the player moves in steps and the hatchlings trail behind
    const s = step(a, "missing-hatchlings");
    if (s?.type !== "escort") throw new Error("expected escort");
    const lurkers = a.actors.filter((x) => x.spec.id === "lurker" && x.tag === "missing-hatchlings");
    expect(lurkers.length).toBe(2);
    for (const l of lurkers) l.hp = 0;
    for (const l of lurkers) a.kill(l, false);
    for (let i = 0; i < 700 && step(a, "missing-hatchlings")?.type === "escort"; i++) {
      const dx = s.to.x - a.player.x,
        dy = s.to.y - a.player.y;
      const d = Math.hypot(dx, dy);
      a.player.invuln = 5;
      tick(a, 1, held({ move: { x: dx / d, y: dy / d } }));
    }
    expect(step(a, "missing-hatchlings")?.type).toBe("boss");
    finish(a, "hatch-escort");
  });
  it("guard branch: hold the hollow through two waves, then finish the chapter", () => {
    const a = prepare();
    trackAndFight(a);
    talk(a, "hatchlings", "guard");
    const s = step(a, "missing-hatchlings");
    expect(s?.type).toBe("protect");
    if (s?.type !== "protect") return;
    place(a, s.at.x, s.at.y);
    a.player.invuln = 99;
    tick(a, 2);
    expect(a.actors.filter((x) => x.tag === "missing-hatchlings" && !x.npc && x.state !== "dead")).toHaveLength(4);
    killTagged(a, "missing-hatchlings");
    tick(a, 2);
    expect(a.actors.filter((x) => x.tag === "missing-hatchlings" && !x.npc && x.state !== "dead").length).toBe(2);
    killTagged(a, "missing-hatchlings");
    tick(a, 2);
    expect(step(a, "missing-hatchlings")?.type).toBe("boss");
    finish(a, "hatch-guard");
  });
  it("never a dead end: defeat during the defence resets the waves; lost reinforcements respawn; escorts catch up", () => {
    const a = prepare();
    trackAndFight(a);
    talk(a, "hatchlings", "guard");
    const s = step(a, "missing-hatchlings");
    if (s?.type !== "protect") throw new Error("expected protect");
    place(a, s.at.x, s.at.y);
    tick(a, 2);
    expect(quest(a, "missing-hatchlings").data.wave).toBe(0);
    a.player.hp = 0;
    tick(a, 90);
    expect(quest(a, "missing-hatchlings").data.wave).toBeUndefined();
    expect(a.actors.filter((x) => x.tag === "missing-hatchlings" && !x.npc && x.state !== "dead")).toHaveLength(0);
    place(a, s.at.x, s.at.y);
    tick(a, 2);
    expect(a.actors.filter((x) => x.tag === "missing-hatchlings" && !x.npc && x.state !== "dead").length).toBeGreaterThan(0);
    // escorts: hatchlings far behind are brought to the player
    const b = prepare();
    trackAndFight(b);
    talk(b, "hatchlings", "escort");
    place(b, 27.5, 36.5);
    tick(b, 4);
    for (const k of b.actors.filter((x) => x.follow)) expect(Math.hypot(k.x - b.player.x, k.y - b.player.y)).toBeLessThan(6);
  });
  it("the kill step re-spawns its enemies if they all vanish, and a boss already beaten completes its step", () => {
    const a = prepare();
    talk(a, "mossback");
    const s = step(a, "missing-hatchlings");
    if (s?.type !== "track") throw new Error("expected track");
    for (const clue of s.clues) {
      place(a, clue.x, clue.y);
      a.player.invuln = 99;
      tick(a, 3);
    }
    a.actors = a.actors.filter((x) => x.tag !== "missing-hatchlings");
    tick(a, 60 * 6);
    expect(a.actors.filter((x) => x.tag === "missing-hatchlings").length).toBeGreaterThan(0);
    const b = prepare();
    b.save.rivals.push("old-scar");
    talk(b, "mossback");
    expect(quest(b, "missing-hatchlings").status).toBe("active");
  });
  it("the HUD tracker names the step and the guide target", () => {
    const a = prepare();
    expect(a.quests.tracker()?.text).toBeUndefined(); // nothing active until Mossback's offer is accepted
    talk(a, "mossback");
    const t = a.quests.tracker()!;
    expect(t.quest).toBe("The Missing Hatchlings");
    expect(t.text).toMatch(/footprints/i);
    expect(t.target).not.toBeNull();
    expect(a.objectiveTarget).toEqual(t.target);
  });
});

describe("migrated saves keep their chapters", () => {
  it("a legacy character that already beat the river is not sent back to the nest", () => {
    const a = make({ level: 12, rivals: ["river-hunter"], mutate: (c) => (c.flags = ["legacy"]) });
    expect(quest(a, "quiet-nest").status).toBe("done");
    expect(quest(a, "missing-hatchlings").status).toBe("done");
    expect(a.hasFlag("hollow-restored")).toBe(true);
  });
});

describe("content lint (applies to every quest and NPC anyone adds)", () => {
  const ids = new Set(QUESTS.map((q) => q.id));
  const npcIds = new Set(NPCS.map((n) => n.id));
  const discoveries = new Set(DISCOVERIES.map((d) => d.id));
  const rivals = new Set(RIVALS.map((r) => r.id));
  const creatures = new Set(CREATURES.map((c) => c.id));
  it("ids are unique and every reference resolves", () => {
    expect(ids.size).toBe(QUESTS.length);
    expect(npcIds.size).toBe(NPCS.length);
    for (const n of NPCS) expect(creatures.has(n.creature), `npc ${n.id} creature`).toBe(true);
    for (const q of QUESTS) {
      expect(q.steps.length, q.id).toBeGreaterThan(0);
      expect(q.title.length, q.id).toBeGreaterThan(2);
      if (q.giver) {
        expect(npcIds.has(q.giver), `${q.id} giver`).toBe(true);
        expect(q.offer.length, `${q.id} offer`).toBeGreaterThan(0);
      }
      for (const r of q.requires?.quests ?? []) expect(ids.has(r), `${q.id} requires ${r}`).toBe(true);
      for (const r of q.requires?.rivals ?? []) expect(rivals.has(r), `${q.id} rival ${r}`).toBe(true);
      const flagsSetByChoices = new Set(q.steps.flatMap((s) => (s.type === "choice" ? s.options.map((o) => o.flag).filter(Boolean) : [])));
      for (const s of q.steps) {
        expect(s.text.length, `${q.id} step text`).toBeGreaterThan(3);
        if (s.onlyIf) expect(flagsSetByChoices.has(s.onlyIf), `${q.id} onlyIf ${s.onlyIf} must be set by a choice`).toBe(true);
        if (s.type === "talk") {
          expect(npcIds.has(s.npc), `${q.id} talk ${s.npc}`).toBe(true);
          expect(s.dialogue.length).toBeGreaterThan(0);
        }
        if (s.type === "choice") {
          expect(s.options.length).toBeGreaterThanOrEqual(2);
          if (s.npc) expect(npcIds.has(s.npc), `${q.id} choice npc`).toBe(true);
        }
        if (s.type === "boss") expect(rivals.has(s.rival), `${q.id} boss ${s.rival}`).toBe(true);
        if (s.type === "find") expect(discoveries.has(s.discovery), `${q.id} find ${s.discovery}`).toBe(true);
        if (s.type === "kill") {
          if (s.creature) expect(creatures.has(s.creature), `${q.id} kill ${s.creature}`).toBe(true);
          for (const sp of s.spawn ?? []) expect(creatures.has(sp.id) || !!sp.npc, `${q.id} spawn ${sp.id}`).toBe(true);
        }
        for (const sp of [...(s.onEnter?.spawn ?? []), ...(s.type === "escort" ? (s.spawn ?? []) : []), ...(s.type === "protect" ? s.waves.flatMap((w) => w.spawn) : [])]) expect(creatures.has(sp.id), `${q.id} spawn ${sp.id}`).toBe(true);
        if (s.type === "track") expect(s.lines.length, `${q.id} clue lines`).toBe(s.clues.length);
        if (s.type === "plates") {
          expect(s.order.every((i) => i >= 0 && i < s.plates.length)).toBe(true);
          expect(s.order.length).toBeGreaterThanOrEqual(2);
        }
      }
      for (const p of [...q.offer, ...(q.after ?? [])]) expect(p.text.length).toBeGreaterThan(5);
      // a quest cannot wait forever on a flag nobody sets
      for (const s of q.steps) if (s.type === "flag") expect(QUESTS.some((o) => (o.reward.flags ?? []).includes(s.flag) || o.reward.world === s.flag || o.steps.some((t) => t.onDone?.flag?.includes(s.flag) || t.onEnter?.flag?.includes(s.flag))), `${q.id} waits for ${s.flag}`).toBe(true);
    }
  });
  it("quest prerequisites form no cycle", () => {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string) => {
      if (done.has(id)) return;
      expect(visiting.has(id), "cycle at " + id).toBe(false);
      visiting.add(id);
      for (const r of QUESTS.find((q) => q.id === id)?.requires?.quests ?? []) visit(r);
      visiting.delete(id);
      done.add(id);
    };
    for (const q of QUESTS) visit(q.id);
  });
  it("every region's quests only start where the player can be", () => {
    for (const q of QUESTS) expect(REGIONS.some((r) => r.id === q.region)).toBe(true);
  });
});

const dir = process.env.WORLD_DIR ?? "public/world";
const connectedReady = existsSync(dir + "/world.json");
describe("every quest target is reachable in the real connected world (A7)", () => {
  it.skipIf(!connectedReady)("an A* route exists from the start nest to each step target", () => {
    const meta = JSON.parse(readFileSync(new URL("../" + dir + "/world.json", import.meta.url), "utf8"));
    const world = parseWorld(meta, gunzipSync(readFileSync(new URL("../" + dir + "/world.bin.gz", import.meta.url))));
    const a = new Adventure(world, makeChar({ level: 30, rivals: ["river-hunter", "marsh-pack"] }));
    const start = { x: 27, y: 35 };
    const points: { q: string; what: string; p: Point }[] = [];
    for (const q of QUESTS) {
      for (const s of q.steps) {
        if (s.type === "goto" || s.type === "protect") points.push({ q: q.id, what: s.type, p: s.at });
        if (s.type === "track") s.clues.forEach((p, i) => points.push({ q: q.id, what: "clue" + i, p }));
        if (s.type === "collect") s.items.forEach((p, i) => points.push({ q: q.id, what: "item" + i, p }));
        if (s.type === "plates") s.plates.forEach((p, i) => points.push({ q: q.id, what: "plate" + i, p }));
        if (s.type === "escort") points.push({ q: q.id, what: "escort-to", p: s.to }, { q: q.id, what: "escort-from", p: s.from });
        if (s.type === "kill" && s.at) points.push({ q: q.id, what: "kill-at", p: s.at });
        for (const sp of [...(s.type === "kill" ? (s.spawn ?? []) : []), ...(s.type === "escort" ? (s.spawn ?? []) : []), ...(s.type === "protect" ? s.waves.flatMap((w) => w.spawn) : []), ...(s.onEnter?.spawn ?? [])]) points.push({ q: q.id, what: "spawn-" + sp.id, p: sp.at });
      }
    }
    for (const n of NPCS) if (!n.appears) points.push({ q: "npc", what: n.id, p: n.home });
    for (const { q, what, p } of points) {
      const snapped = world.grid.nearestWalkable(p.x, p.y, 0.55);
      expect(Math.hypot(snapped.x - p.x, snapped.y - p.y), `${q}/${what} (${p.x},${p.y}) must be on walkable ground`).toBeLessThan(1.6);
      if (Math.hypot(p.x - start.x, p.y - start.y) < 3) continue;
      const route = findRoute(world.grid, start, snapped, 0.55);
      const end = route.at(-1);
      expect(end && Math.hypot(end.x - snapped.x, end.y - snapped.y) < 1.5, `${q}/${what} (${p.x},${p.y}) reachable from the start nest`).toBe(true);
    }
    void a;
  });
});
void (null as unknown as Actor);
void creature;
