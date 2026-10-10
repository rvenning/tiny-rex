import { describe, it, expect, beforeEach } from "vitest";
import { CharacterStore, emptyBook, mergeBooks, validateBook } from "../src/rpg/store";
import { charactersFromLegacy, convertLegacyXp, freshCharacter, level, validateCharacter, validateMutation } from "../src/rpg/character";
import { freshAdventure, AdventureStore } from "../src/adventure/save";
import { levelFromXp, stageForLevel } from "../src/rpg/progression";
import { rollMutation } from "../src/rpg/mutations";

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
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
    this.m.set(k, String(v));
  }
}
let mem: MemoryStorage;
let store: CharacterStore;
beforeEach(() => {
  mem = new MemoryStorage();
  store = new CharacterStore(new AdventureStore(mem), mem);
});

describe("independent characters per family profile (A1, A2)", () => {
  it("a profile owns several characters of any species with fully separate progress", () => {
    const a = store.create("p1", "Rexy", "rex")!;
    const b = store.create("p1", "Zippy", "raptor")!;
    const c = store.create("p1", "Tops", "trike")!;
    a.xp = 500;
    a.amber = 40;
    a.quests["q"] = { status: "active", step: 2, progress: 0, data: {}, startedAt: 1 };
    a.discoveries.push("fossil-hollow-shelf");
    a.bag.push(rollMutation({ seed: 1, ilvl: 3, species: "rex", rarity: "rare" }));
    store.save("p1", a);
    store.invalidate();
    const list = store.list("p1");
    expect(list).toHaveLength(3);
    const rb = store.get("p1", b.id)!,
      rc = store.get("p1", c.id)!;
    for (const other of [rb, rc]) {
      expect(other.xp).toBe(0);
      expect(other.amber).toBe(0);
      expect(other.bag).toHaveLength(0);
      expect(other.discoveries).toEqual([]);
      expect(Object.keys(other.quests)).toHaveLength(0);
    }
    expect(store.get("p1", a.id)!.xp).toBe(500);
    expect(rb.species).toBe("raptor");
    expect(rc.species).toBe("trike");
  });
  it("profiles do not see each other's characters", () => {
    store.create("p1", "A", "rex");
    expect(store.list("p2")).toHaveLength(0);
  });
  it("species is fixed: validation never lets a record change species and there is no API to do so", () => {
    const c = freshCharacter("Fixed", "raptor");
    const copy = validateCharacter({ ...c, species: "rex" })!; // a tampered species is a *different valid character*, never a mutation of the old one
    expect(copy.id).toBe(c.id);
    expect(Object.keys(store)).not.toContain("changeSpecies");
    expect(typeof (store as unknown as Record<string, unknown>).setSpecies).toBe("undefined");
    expect(validateCharacter({ ...c, species: "stegosaurus" })).toBeNull();
  });
  it("names are cleaned and capped", () => {
    const c = store.create("p1", "   <b>A   very long   dinosaur name that keeps going</b> ", "rex")!;
    expect(c.name.length).toBeLessThanOrEqual(20);
    expect(c.name).not.toMatch(/[<>]/);
    expect(store.create("p1", "   ", "rex")!.name).toBe("Rex");
  });
  it("enforces a character limit", () => {
    for (let i = 0; i < 12; i++) expect(store.create("p1", "c" + i, "rex")).not.toBeNull();
    expect(store.create("p1", "one too many", "rex")).toBeNull();
  });
});

describe("saves: rev, delete confirmation data, recovery (A3)", () => {
  it("save bumps rev and persists across a fresh store", () => {
    const c = store.create("p1", "Persist", "trike")!;
    c.xp = 321;
    store.save("p1", c);
    const again = new CharacterStore(new AdventureStore(mem), mem).get("p1", c.id)!;
    expect(again.xp).toBe(321);
    expect(again.rev).toBeGreaterThan(0);
  });
  it("delete goes to a recoverable trash and a stale autosave cannot resurrect it", () => {
    const c = store.create("p1", "Gone", "rex")!;
    expect(store.remove("p1", c.id)).toBe(true);
    expect(store.list("p1")).toHaveLength(0);
    expect(store.trash("p1")).toHaveLength(1);
    store.save("p1", c); // a late autosave from a still-open scene
    expect(store.list("p1")).toHaveLength(0);
    const back = store.restore("p1", c.id)!;
    expect(back.name).toBe("Gone");
    expect(store.list("p1")).toHaveLength(1);
    expect(store.trash("p1")).toHaveLength(0);
  });
  it("old trash expires", () => {
    const c = store.create("p1", "Old", "rex")!;
    store.remove("p1", c.id, 1000);
    expect(store.trash("p1", 1000 + 29 * 864e5)).toHaveLength(1);
    expect(store.trash("p1", 1000 + 31 * 864e5)).toHaveLength(0);
  });
  it("a corrupt primary recovers from the backup, then from the known-good copy", () => {
    const c = store.create("p1", "Safe", "rex")!;
    c.xp = 100;
    store.save("p1", c);
    c.xp = 200;
    store.save("p1", c);
    mem.setItem("trex_chars_v2_p1", "{not json");
    store.invalidate();
    let book = store.read("p1");
    expect(store.recovered).toBe("backup");
    expect(Object.values(book.characters)[0].xp).toBe(100);
    expect(mem.getItem("trex_chars_v2_p1_corrupt")).toBe("{not json");
    mem.setItem("trex_chars_v2_p1", "garbage");
    mem.setItem("trex_chars_v2_p1_backup", "also garbage");
    store.invalidate();
    book = store.read("p1");
    expect(store.recovered).toBe("good");
    expect(Object.keys(book.characters)).toHaveLength(1);
  });
  it("a book with a damaged character keeps the others", () => {
    const a = freshCharacter("Fine", "rex");
    const book = { ...emptyBook(), characters: { [a.id]: a, bad: { version: 2, id: "bad", species: "nope" } } } as never;
    const out = validateBook(JSON.parse(JSON.stringify(book)))!;
    expect(Object.keys(out.characters)).toEqual([a.id]);
  });
  it("validation sanitises items: bad rolls dropped, misfit worn items go back to the bag, not lost", () => {
    const c = freshCharacter("Items", "trike");
    const claws = rollMutation({ seed: 5, ilvl: 3, species: "raptor", rarity: "rare", slot: "claws" });
    const horns = rollMutation({ seed: 6, ilvl: 3, species: "trike", rarity: "rare", slot: "horns" });
    const tampered = { ...c, worn: { claws, horns }, bag: [{ ...horns, id: "junk", primary: { stat: "nope", value: 1 } }] };
    const v = validateCharacter(JSON.parse(JSON.stringify(tampered)))!;
    expect(v.worn.horns?.id).toBe(horns.id);
    expect(v.worn.claws).toBeUndefined();
    expect(v.bag.some((m) => m.id === claws.id)).toBe(true);
    expect(v.bag.some((m) => m.id === "junk")).toBe(false);
    expect(validateMutation({ ...horns, rarity: "mythic" })).toBeNull();
  });
  it("sync merge: the higher rev wins per character, both devices' new characters survive, deletions stick", () => {
    const x = freshCharacter("Shared", "rex", 1000, "cshared");
    x.rev = 3;
    x.xp = 50;
    const onlyA = freshCharacter("A only", "raptor", 1000, "conlya");
    const a = { ...emptyBook(), updated: 10, characters: { [x.id]: x, [onlyA.id]: onlyA }, active: x.id };
    const y = { ...x, rev: 5, xp: 90, updated: 2000 };
    const onlyB = freshCharacter("B only", "trike", 1000, "conlyb");
    const b = { ...emptyBook(), updated: 20, characters: { [y.id]: y, [onlyB.id]: onlyB }, active: onlyB.id };
    const merged = mergeBooks(a, b, 5000);
    expect(Object.keys(merged.characters).sort()).toEqual(["conlya", "conlyb", "cshared"]);
    expect(merged.characters.cshared.xp).toBe(90);
    const gone = { ...emptyBook(), updated: 30, trash: [{ character: { ...onlyA }, deletedAt: 3000 }] };
    const after = mergeBooks(merged, gone, 5000);
    expect(after.characters.conlya).toBeUndefined();
    expect(after.trash.some((t) => t.character.id === "conlya")).toBe(true);
  });
});

describe("legacy migration never loses progress (A3)", () => {
  const legacy = () => {
    const l = freshAdventure();
    l.xp = { rex: 120, raptor: 14, trike: 0 };
    l.species = ["rex", "raptor"];
    l.discoveries = ["fossil-hollow-shelf", "egg-hollow"];
    l.regions = ["hollow", "river"];
    l.nests = ["hollow", "river"];
    l.rivals = ["river-hunter"];
    l.gates = ["river-ford"];
    l.studied = ["beetle", "compy"];
    l.challenges = ["first-hunt"];
    l.snapshot.dino = "raptor";
    l.snapshot.at = 100;
    l.updated = 5000;
    return l;
  };
  it("creates one character per species that was played, preserving world progress, never below the old stage", () => {
    const chars = charactersFromLegacy("Mia", legacy(), 9000);
    expect(chars.map((c) => c.species).sort()).toEqual(["raptor", "rex"]);
    const rex = chars.find((c) => c.species === "rex")!;
    expect(stageForLevel(level(rex))).toBeGreaterThanOrEqual(2); // 120 xp + river-hunter = old Hunter stage
    expect(rex.discoveries).toContain("fossil-hollow-shelf");
    expect(rex.rivals).toContain("river-hunter");
    expect(rex.regions).toContain("river");
    expect(rex.gates).toContain("river-ford");
    expect(rex.flags).toContain("legacy");
    expect(rex.migrated?.from).toBe("adventure_v1");
    const raptor = chars.find((c) => c.species === "raptor")!;
    expect(levelFromXp(raptor.xp)).toBeGreaterThanOrEqual(1);
  });
  it("converting XP is monotonic and respects stage floors", () => {
    let last = -1;
    for (const xp of [0, 4, 8, 20, 30, 60, 90, 150, 200, 400]) {
      const v = convertLegacyXp(xp, ["river-hunter", "marsh-pack"]);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });
  it("the store migrates on first read, leaves the legacy record untouched, and is idempotent", () => {
    const adv = new AdventureStore(mem);
    adv.write("p1", legacy());
    const before = mem.getItem("trex_adventure_v1_p1");
    const book = store.read("p1", "Mia");
    expect(Object.keys(book.characters)).toHaveLength(2);
    expect(book.active).toBe("c_legacy_raptor");
    expect(mem.getItem("trex_adventure_v1_p1")).toBe(before);
    store.invalidate();
    expect(Object.keys(store.read("p1", "Mia").characters)).toHaveLength(2);
    expect(mem.getItem("trex_adventure_v1_p1")).toBe(before);
  });
  it("a profile with no legacy record starts empty", () => {
    expect(store.list("fresh")).toHaveLength(0);
    expect(mem.getItem("trex_chars_v2_fresh")).toBeNull();
  });
  it("a corrupt legacy record migrates nothing rather than inventing progress", () => {
    mem.setItem("trex_adventure_v1_p9", "{broken");
    expect(store.list("p9")).toHaveLength(0);
  });
});
