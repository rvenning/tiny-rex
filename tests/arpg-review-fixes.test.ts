import { describe, it, expect } from "vitest";
import { Adventure } from "../src/adventure/sim";
import { AdventureStore } from "../src/adventure/save";
import { CharacterStore } from "../src/rpg/store";
import { validateCharacter, validateMutation, freshCharacter } from "../src/rpg/character";
import { rollMutation } from "../src/rpg/mutations";
import { QUESTS } from "../src/adventure/content";
import { parseWorld, type WorldMeta } from "../src/world/world";
import { make, makeChar, openWorld, tick, place, only } from "./helpers/sim";

class Mem implements Storage {
  m = new Map<string, string>();
  /** keys containing any of these make setItem throw, like a full disk */
  failOn: string[] = [];
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    if (this.failOn.some((f) => k.includes(f))) throw new Error("QuotaExceededError");
    this.m.set(k, String(v));
  }
}
const store = (mem = new Mem()) => ({ mem, chars: new CharacterStore(new AdventureStore(mem), mem) });

describe("save safety (review fixes)", () => {
  it("a stale session cannot overwrite newer progress; the player can choose to force it", () => {
    const { chars } = store();
    const c = chars.create("p", "Dino", "rex")!;
    const session = { ...c }; // what a running scene holds
    const newer = { ...c, rev: c.rev + 7, xp: 5000 };
    chars.replace("p", { ...chars.read("p"), characters: { [c.id]: newer } });
    expect(chars.isStale("p", session)).toBe(true);
    expect(chars.save("p", { ...session, xp: 0 })).toBeNull();
    expect(chars.get("p", c.id)!.xp).toBe(5000);
    const forced = chars.save("p", { ...session, xp: 123 }, Date.now(), true)!;
    expect(forced.rev).toBeGreaterThan(newer.rev);
    expect(chars.get("p", c.id)!.xp).toBe(123);
  });
  it("a normal session keeps its rev in step so autosaves are never stale against themselves", () => {
    const { chars } = store();
    const c = chars.create("p", "Dino", "rex")!;
    let cur = { ...c };
    for (let i = 0; i < 4; i++) {
      const saved = chars.save("p", { ...cur })!;
      expect(saved).not.toBeNull();
      cur = { ...cur, rev: saved.rev };
    }
    expect(chars.isStale("p", cur)).toBe(false);
  });
  it("the primary is written before backups, so a full disk fails cleanly and is reported", () => {
    const { mem, chars } = store();
    const c = chars.create("p", "Dino", "rex")!;
    chars.save("p", { ...c, xp: 10 });
    mem.failOn = ["_backup", "_good"];
    chars.save("p", { ...c, xp: 20, rev: 99 });
    expect(JSON.parse(mem.getItem("trex_chars_v2_p")!).characters[c.id].xp).toBe(20); // primary landed despite rotation failing
    mem.failOn = ["trex_chars_v2_p"];
    chars.save("p", { ...c, xp: 30, rev: 100 });
    expect(chars.available).toBe(false);
    mem.failOn = [];
    chars.save("p", { ...c, xp: 40, rev: 101 });
    expect(chars.available).toBe(true);
  });
  it("recovering from a corrupt primary keeps the good backup it used", () => {
    const { mem, chars } = store();
    const c = chars.create("p", "Dino", "rex")!;
    chars.save("p", { ...c, xp: 100 });
    chars.save("p", { ...c, xp: 200, rev: 50 });
    const backupBefore = mem.getItem("trex_chars_v2_p_backup");
    mem.setItem("trex_chars_v2_p", "{garbage");
    chars.invalidate();
    chars.read("p");
    expect(chars.recovered).toBe("backup");
    expect(mem.getItem("trex_chars_v2_p_backup")).toBe(backupBefore);
  });
  it("two different mutations never share an id, across sessions, and neither is lost", () => {
    const c = makeChar({ level: 5 });
    const first = new Adventure(openWorld(), c);
    first.actors = [];
    first.giveLoot({ rarity: "rare", slot: "jaws" });
    const saved = first.checkpoint(1);
    const second = new Adventure(openWorld(), saved);
    second.actors = [];
    second.giveLoot({ rarity: "rare", slot: "jaws" });
    const again = second.checkpoint(2);
    expect(again.bag.length + Object.keys(again.worn).length).toBe(2);
    expect(new Set(again.bag.map((m) => m.id)).size).toBe(again.bag.length);
  });
  it("colliding ids in a stored character are repaired instead of dropping an item", () => {
    const c = freshCharacter("Dup", "rex", 1, "cdup");
    const a = rollMutation({ seed: 1, ilvl: 3, species: "rex", rarity: "rare", slot: "jaws" });
    const b = { ...rollMutation({ seed: 2, ilvl: 3, species: "rex", rarity: "epic", slot: "hide" }), id: a.id };
    const v = validateCharacter(JSON.parse(JSON.stringify({ ...c, bag: [a, b] })))!;
    expect(v.bag).toHaveLength(2);
    expect(new Set(v.bag.map((m) => m.id)).size).toBe(2);
  });
  it("mutation ids are restricted to a safe character set", () => {
    const m = rollMutation({ seed: 3, ilvl: 3, species: "rex", rarity: "rare" });
    const v = validateMutation({ ...m, id: 'x"><img src=x onerror=alert(1)>' })!;
    expect(v.id).toMatch(/^[a-zA-Z0-9_-]+$/);
  });
  it("ground drops keep unique ids even when a new session starts counting again", () => {
    const a = make({ empty: true });
    a.addDrop({ amber: 5 }, { x: 20, y: 20 });
    const saved = a.checkpoint(1);
    const b = new Adventure(openWorld(), saved);
    b.actors = [];
    b.addDrop({ amber: 7 }, { x: 22, y: 22 });
    expect(new Set(b.drops.map((d) => d.id)).size).toBe(b.drops.length);
  });
  it("a quest reward that does not fit in a full bag waits on the ground and does not expire", () => {
    const a = make({ empty: true, level: 5 });
    for (let i = 0; i < 24; i++) a.save.bag.push({ ...rollMutation({ seed: i + 1, ilvl: 3, species: "rex", rarity: "common" }), id: "f" + i });
    const m = a.giveLoot({ rarity: "epic" });
    const drop = a.drops.find((d) => d.mutation?.id === m.id)!;
    expect(drop).toBeDefined();
    tick(a, 60 * 30);
    expect(a.drops.includes(drop)).toBe(true);
    expect(drop.expires - a.time).toBeGreaterThan(1e6);
  });
});

describe("exploits closed (review fixes)", () => {
  it("rematching a defeated boss pays like an ordinary hunter: no guaranteed legendaries", () => {
    let items = 0,
      legendaries = 0;
    const a = make({ level: 20, rivals: ["river-hunter", "marsh-pack"] });
    for (let i = 0; i < 20; i++) {
      a.actors = [];
      place(a, 93, 24);
      a.player.invuln = 99;
      a.player.action = 0;
      expect(a.interact()).toBe("rematch");
      for (const x of a.actors.filter((z) => z.rival === "river-hunter")) {
        expect(x.rematch).toBe(true);
        x.hp = 0.1;
        x.state = "recover";
        x.t = 9;
        a.hitEnemy(x, 3, { kind: "basic" });
      }
    }
    for (const d of a.drops) if (d.mutation) {
      items++;
      if (d.mutation.rarity === "legendary") legendaries++;
    }
    for (const m of a.save.bag) if (m) items++;
    expect(legendaries).toBe(0);
    expect(items).toBeLessThan(12);
  });
  it("reloading in the middle of a defence calls the wave again instead of counting it as beaten", () => {
    const def = QUESTS.find((q) => q.steps.some((s) => s.type === "protect"))!;
    const idx = def.steps.findIndex((s) => s.type === "protect");
    const c = makeChar({ level: 25, rivals: ["river-hunter", "marsh-pack"] });
    c.flags = [...Object.values(def.steps).flatMap((s) => (s.type === "choice" ? s.options.map((o) => o.flag!).slice(0, 1) : [])), ...(def.steps[idx].onlyIf ? [def.steps[idx].onlyIf!] : [])];
    c.quests[def.id] = { status: "active", step: idx, progress: 0, data: { wave: 0 }, startedAt: 1 };
    const a = new Adventure(openWorld(), c);
    expect(a.save.quests[def.id].step).toBe(idx);
    expect(a.save.quests[def.id].data.wave).toBe(0);
    expect(a.actors.filter((x) => x.tag === def.id && x.state !== "dead" && !x.npc).length).toBeGreaterThan(0);
  });
  it("shadowstep never lands through a wall", () => {
    // a solid wall at x = 22..23.5 between the player and the target
    const nx = 234,
      ny = 170,
      n = nx * ny,
      raw = new Uint8Array(n * 4);
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) if (!(x >= 42 && x < 44)) raw[y * nx + x] = 1;
    const world = parseWorld({ bounds: [-20, -20, 214, 150], cell: 1, nx, ny, surf: ["grass"], version: 2, pois: {}, features: [], props: [], water: [] } as WorldMeta, raw);
    const a = new Adventure(world, makeChar({ species: "raptor", level: 14 }));
    a.actors = [];
    place(a, 20, 20);
    a.save.loadout = ["raptor.shadow", null];
    const t = a.addActor("raptor", { x: 27, y: 20 }, { exact: true, level: 5 })!;
    Object.assign(t, { state: "stalk", provoked: 9, cooldown: 99, face: Math.PI });
    a.actors = [t];
    a.player.invuln = 99;
    a.update(1 / 60, { move: { x: 0, y: 0 }, bite: false, dodge: false, skillA: true, skillB: false, interact: false });
    tick(a, 30);
    expect(a.player.x).toBeLessThan(23);
    void only;
  });
});
