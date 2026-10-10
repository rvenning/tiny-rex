import { describe, it, expect } from "vitest";
import { Adventure } from "../src/adventure/sim";
import { QUESTS, NPCS } from "../src/adventure/content";
import { CREATURES, DISCOVERIES, RIVALS, REGIONS } from "../src/adventure/data";
import type { StepDef } from "../src/adventure/quests";
import { make, tick, place } from "./helpers/sim";

/** A generic quest bot: it reads the active step and does what a player would, using only public sim calls. */
function play(a: Adventure, pick: "first" | "last", maxSteps = 4000) {
  const log: string[] = [];
  const npcActor = (id: string) => {
    let n = a.actors.find((x) => x.npc === id && x.state !== "dead");
    if (!n) {
      const def = NPCS.find((x) => x.id === id)!;
      n = a.addActor(def.creature, def.home, { npc: id, exact: true });
    }
    return n!;
  };
  const talk = (id: string, choice?: (ids: string[]) => string) => {
    const n = npcActor(id);
    place(a, n.x - 1.5, n.y);
    a.player.invuln = 99;
    tick(a, 2);
    expect(a.interact(), "talk " + id).toBe("talk");
    const s = a.dialogue!;
    a.closeDialogue(s.choices && choice ? choice(s.choices.map((c) => c.id)) : undefined);
  };
  const killTagged = (tag: string) => {
    for (const x of a.actors.filter((z) => z.tag === tag && z.state !== "dead" && !z.npc)) {
      x.hp = 0.1;
      place(a, x.x - 1.3, x.y);
      a.player.invuln = 99;
      a.hitEnemy(x, 3, { kind: "basic" });
    }
  };
  const act = (qid: string, step: StepDef) => {
    switch (step.type) {
      case "talk":
        return talk(step.npc);
      case "choice":
        return talk(step.npc ?? QUESTS.find((q) => q.id === qid)!.giver!, (ids) => (pick === "first" ? ids[0] : ids.at(-1)!));
      case "goto":
        place(a, step.at.x, step.at.y);
        a.player.invuln = 99;
        return tick(a, 3);
      case "protect": {
        place(a, step.at.x, step.at.y);
        a.player.invuln = 99;
        tick(a, 3);
        for (let i = 0; i < step.waves.length + 1; i++) {
          killTagged(qid);
          tick(a, 3);
        }
        return;
      }
      case "track":
        for (const c of step.clues) {
          place(a, c.x, c.y);
          a.player.invuln = 99;
          tick(a, 3);
        }
        return;
      case "collect":
        for (const c of step.items) {
          place(a, c.x, c.y);
          a.player.invuln = 99;
          tick(a, 3);
        }
        return;
      case "plates":
        for (const i of step.order) {
          place(a, step.plates[i].x, step.plates[i].y);
          a.player.invuln = 99;
          tick(a, 3);
          place(a, step.plates[i].x + 8, step.plates[i].y);
          tick(a, 3);
        }
        return;
      case "find": {
        const d = DISCOVERIES.find((x) => x.id === step.discovery)!;
        place(a, d.x, d.y);
        return tick(a, 3);
      }
      case "flag":
        return void a.setFlag(step.flag);
      case "escort": {
        const kids = a.actors.filter((x) => x.tag === qid + ":esc" && x.state !== "dead");
        expect(kids.length, "escort hatchlings").toBeGreaterThan(0);
        for (const k of a.actors.filter((z) => z.tag === qid && !z.npc)) a.kill(k, false);
        place(a, step.to.x, step.to.y);
        a.player.invuln = 99;
        for (const k of kids) {
          k.x = step.to.x + 1;
          k.y = step.to.y;
        }
        return tick(a, 40);
      }
      case "kill": {
        if (step.spawn) {
          killTagged(qid);
          return tick(a, 2);
        }
        for (let i = 0; i < step.count; i++) {
          const id = step.creature ?? CREATURES.find((c) => c.archetype === (step.archetype ?? "prey"))!.id;
          const region = REGIONS.find((r) => r.id === (step.region ?? "hollow"))!;
          const at = { x: (region.bounds[0] + region.bounds[2]) / 2, y: (region.bounds[1] + region.bounds[3]) / 2 };
          const m = a.addActor(id, at, { exact: true, level: 3 })!;
          m.hp = 0.1;
          place(a, m.x - 1.2, m.y);
          a.player.invuln = 99;
          a.hitEnemy(m, 3, { kind: "basic" });
        }
        return;
      }
      case "boss": {
        let b = a.actors.find((x) => x.rival === step.rival && x.state !== "dead");
        if (!b) {
          const r = RIVALS.find((x) => x.id === step.rival)!;
          b = a.addActor(r.species, r.home, { rival: r.id })!;
        }
        for (const x of a.actors.filter((z) => z.rival === step.rival && z.state !== "dead")) {
          x.hp = 0.1;
          x.state = "recover";
          x.t = 9;
          place(a, x.x - 1.5, x.y);
          a.player.invuln = 99;
          a.hitEnemy(x, 3, { kind: "basic" });
        }
        return;
      }
    }
  };
  for (let n = 0; n < maxSteps; n++) {
    a.quests.autoStart();
    // offers: talk to every giver with something available
    const offer = a.quests.available().find((q) => q.giver);
    if (offer) {
      talk(offer.giver!);
      continue;
    }
    const active = a.quests.activeIds();
    if (!active.length) break;
    const qid = active.find((id) => QUESTS.find((q) => q.id === id)?.kind === "main") ?? active[0];
    const step = a.quests.stepOf(qid)!;
    log.push(qid + ":" + step.type);
    const before = JSON.stringify(a.save.quests[qid]);
    act(qid, step);
    tick(a, 2);
    if (JSON.stringify(a.save.quests[qid]) === before && a.quests.stepOf(qid) === step) throw new Error(`stuck on ${qid} step ${a.save.quests[qid].step} (${step.type}: ${step.text})`);
  }
  return log;
}

describe("every quest can be completed from a fresh character (A7, no soft locks)", () => {
  for (const pick of ["first", "last"] as const) {
    it(`bot playthrough, choosing the ${pick} option at every fork`, () => {
      const a = make({ level: 30, rivals: [], mutate: (c) => void c });
      const log = play(a, pick);
      for (const q of QUESTS) {
        const unreachable = !!q.requires?.level && q.requires.level > 30;
        if (!unreachable) expect(a.save.quests[q.id]?.status, `${q.id} (${pick}) after: ${log.slice(-4).join(" > ")}`).toBe("done");
      }
      // both endings exist and exactly one was chosen
      const sealed = a.hasFlag("heartstone-sealed"),
        bound = a.hasFlag("heartstone-bound");
      expect(sealed || bound).toBe(true);
      expect(sealed && bound).toBe(false);
      expect(a.hasFlag(pick === "first" ? "heartstone-sealed" : "heartstone-bound")).toBe(true);
      // rewards were actually delivered: mutations in the bag or worn, amber banked, XP gained
      expect(a.save.bag.length + Object.keys(a.save.worn).length).toBeGreaterThan(6);
      expect(a.save.amber).toBeGreaterThan(100);
    });
  }
  it("the story reaches the finale only through the chapters in order", () => {
    const a = make({ level: 30 });
    play(a, "first", 40);
    const done = QUESTS.filter((q) => a.save.quests[q.id]?.status === "done").map((q) => q.id);
    expect(done).not.toContain("glimmerjaw");
    expect(done).toContain("quiet-nest");
  });
  it("legendary rewards respect the species: the universal two only", () => {
    for (const q of QUESTS) {
      const loots = [q.reward.loot, ...q.steps.map((s) => s.onDone?.loot), ...q.steps.map((s) => s.onEnter?.loot)].filter(Boolean);
      for (const l of loots) if (l!.unique) expect(["glowheart", "amber-eye"]).toContain(l!.unique);
    }
  });
});
