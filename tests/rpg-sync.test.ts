import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { SaveStore } from "../src/platform/storage";
import { reconcile, charDocId, charDelDocId } from "../src/platform/sync-plan";
import { CharacterStore } from "../src/rpg/store";
import { freshCharacter } from "../src/rpg/character";

const profile = { id: "p1", name: "Mia", avatar: "🦖", pin: null, created: 1, updated: 1 };
let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => mem.set(k, v),
    removeItem: (k: string) => mem.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

const setup = () => {
  const store = new SaveStore();
  store.write("profiles", [profile], false);
  return { store, chars: new CharacterStore(), queued: new Map<string, unknown>() };
};

it("cloud characters merge into the local book and local-only characters are queued for upload", () => {
  const { store, chars, queued } = setup();
  const local = chars.create("p1", "Local Rex", "rex")!;
  const remote = freshCharacter("Cloud Raptor", "raptor", 5, "ccloud");
  remote.rev = 4;
  remote.xp = 900;
  reconcile(store, [{ id: "profile_p1", data: profile }, { id: charDocId("p1", remote.id), data: remote }], queued, chars);
  const list = chars.list("p1");
  expect(list.map((c) => c.id).sort()).toEqual([local.id, "ccloud"].sort());
  expect(chars.get("p1", "ccloud")!.xp).toBe(900);
  expect(queued.has(charDocId("p1", local.id))).toBe(true);
  expect(queued.has(charDocId("p1", "ccloud"))).toBe(false);
});

it("the higher revision wins per character and a newer local save is queued", () => {
  const { store, chars, queued } = setup();
  const c = chars.create("p1", "Shared", "trike")!;
  c.xp = 500;
  chars.save("p1", c);
  chars.save("p1", c);
  const stale = { ...c, rev: 1, xp: 10, updated: 1 };
  reconcile(store, [{ id: "profile_p1", data: profile }, { id: charDocId("p1", c.id), data: stale }], queued, chars);
  expect(chars.get("p1", c.id)!.xp).toBe(500);
  expect(queued.has(charDocId("p1", c.id))).toBe(true);
});

it("a deletion made on another device removes the character here, and it stays in recoverable trash", () => {
  const { store, chars, queued } = setup();
  const c = chars.create("p1", "Doomed", "rex")!;
  reconcile(
    store,
    [
      { id: "profile_p1", data: profile },
      { id: charDocId("p1", c.id), data: c },
      { id: charDelDocId("p1", c.id), data: { character: c, at: c.updated + 1000 } },
    ],
    queued,
    chars,
  );
  expect(chars.list("p1")).toHaveLength(0);
  expect(chars.trash("p1", c.updated + 2000)).toHaveLength(1);
});

it("garbage character documents are ignored", () => {
  const { store, chars, queued } = setup();
  reconcile(store, [{ id: "profile_p1", data: profile }, { id: "char_p1__bad", data: { version: 2, id: "bad", species: "nope" } }, { id: "char_oops", data: {} }], queued, chars);
  expect(chars.list("p1")).toHaveLength(0);
});
