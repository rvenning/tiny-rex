import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { SaveStore, blankProgress } from "../src/platform/storage";
import { connectSync } from "../src/platform/sync";
import { AdventureStore, freshAdventure } from "../src/adventure/save";
const fake = vi.hoisted(() => ({
  docs: new Map<string, unknown>(),
  writes: [] as string[],
  auth: vi.fn(),
  reads: vi.fn(),
}));
vi.mock("firebase/app", () => ({
  getApps: () => [{ name: "tiny-rex-phaser" }],
  initializeApp: vi.fn(),
}));
vi.mock("firebase/auth", () => ({
  getAuth: () => ({}),
  signInAnonymously: fake.auth,
}));
vi.mock("firebase/firestore", () => ({
  getFirestore: () => ({}),
  collection: () => ({}),
  doc: (_db: unknown, _collection: string, id: string) => id,
  getDocs: async () => {
    fake.reads();
    return {
      docs: [...fake.docs].map(([id, value]) => ({
        id,
        data: () => structuredClone(value),
      })),
    };
  },
  runTransaction: async (_db: unknown, fn: (tx: unknown) => unknown) =>
    fn({
      get: async (id: string) => ({
        exists: () => fake.docs.has(id),
        data: () => structuredClone(fake.docs.get(id)),
      }),
      set: (id: string, value: unknown) => {
        fake.writes.push(id);
        fake.docs.set(id, value);
      },
      delete: (id: string) => {
        fake.writes.push("delete:" + id);
        fake.docs.delete(id);
      },
    }),
}));
const p = {
  id: "isabelle",
  name: "Isabelle",
  avatar: "🦖",
  pin: "1234",
  created: 1,
  updated: 1,
};
beforeEach(() => {
  vi.useFakeTimers();
  fake.docs.clear();
  fake.writes = [];
  fake.auth.mockReset().mockResolvedValue({});
  fake.reads.mockClear();
  const memory = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
    removeItem: (k: string) => memory.delete(k),
  });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), { hidden: false }),
  );
  fake.docs.set("profile_isabelle", p);
  fake.docs.set("progress_isabelle", blankProgress());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("merges concurrent adventure discoveries without touching legacy progress", async () => {
  const a = freshAdventure(),
    b = freshAdventure();
  a.xp.rex = 120;
  a.updated = 100;
  a.snapshot.at = 100;
  a.discoveries = ["fossil-hollow-0"];
  b.xp.raptor = 180;
  b.updated = 200;
  b.snapshot.at = 200;
  b.discoveries = ["fossil-river-0"];
  const store = new SaveStore();
  new AdventureStore().write("isabelle", a);
  fake.docs.set("adventure_v1_isabelle", b);
  await connectSync(store, () => {});
  await vi.advanceTimersByTimeAsync(4000);
  expect(new AdventureStore().read("isabelle").discoveries).toHaveLength(2);
  expect((fake.docs.get("adventure_v1_isabelle") as any).xp).toEqual({
    rex: 120,
    raptor: 180,
    trike: 0,
  });
  expect(fake.docs.get("progress_isabelle")).toEqual(blankProgress());
});
it("a tombstone prevents adventure resurrection and removes its local backup", async () => {
  const store = new SaveStore();
  const adventure = new AdventureStore();
  const s = freshAdventure();
  s.updated = 100;
  s.snapshot.at = 100;
  adventure.write("isabelle", s);
  adventure.write("isabelle", s);
  fake.docs.set("deleted_isabelle", { id: "isabelle", at: 101 });
  await connectSync(store, () => {});
  expect(localStorage.getItem("trex_adventure_v1_isabelle")).toBeNull();
  expect(localStorage.getItem("trex_adventure_v1_isabelle_backup")).toBeNull();
  store.onSave("adventure_v1_isabelle", s);
  await vi.advanceTimersByTimeAsync(4000);
  expect(fake.docs.has("adventure_v1_isabelle")).toBe(false);
});
it("recovers a corrupt adventure from the previous valid snapshot", () => {
  const adventure = new AdventureStore();
  const s = freshAdventure();
  s.updated = 1;
  s.xp.rex = 80;
  adventure.write("isabelle", s);
  s.updated = 2;
  s.xp.rex = 100;
  adventure.write("isabelle", s);
  localStorage.setItem("trex_adventure_v1_isabelle", "{broken");
  expect(adventure.read("isabelle").xp.rex).toBe(80);
});
it("continues to rules-controlled Firestore access after an anonymous-auth failure", async () => {
  fake.auth.mockRejectedValueOnce(new Error("Auth config disabled"));
  const status = vi.fn(),
    store = new SaveStore();
  await connectSync(store, status);
  expect(fake.reads).toHaveBeenCalled();
  expect(store.profiles[0].name).toBe("Isabelle");
  expect(status).toHaveBeenLastCalledWith("Family sync connected");
});
it("transaction comparison protects a newer PIN written after the sync snapshot", async () => {
  const store = new SaveStore();
  await connectSync(store, () => {});
  store.update({ ...store.profiles[0], pin: "2345" });
  fake.docs.set("profile_isabelle", {
    ...p,
    pin: "9999",
    updated: Date.now() + 1000,
  });
  await vi.advanceTimersByTimeAsync(3000);
  expect((fake.docs.get("profile_isabelle") as typeof p).pin).toBe("9999");
  expect(fake.writes).not.toContain("profile_isabelle");
});
it("concurrent remote progress is merged inside the write transaction", async () => {
  const store = new SaveStore();
  await connectSync(store, () => {});
  store.write("progress_isabelle", {
    ...blankProgress(),
    feastBest: 50,
    met: { fern: 1 },
  });
  fake.docs.set("progress_isabelle", {
    ...blankProgress(),
    feastBest: 100,
    met: { compy: 1 },
  });
  await vi.advanceTimersByTimeAsync(3000);
  expect(fake.docs.get("progress_isabelle")).toMatchObject({
    feastBest: 100,
    met: { compy: 1, fern: 1 },
  });
});
it("a tombstone arriving during a queued save prevents resurrection", async () => {
  const store = new SaveStore();
  await connectSync(store, () => {});
  store.update({ ...store.profiles[0], pin: "2345" });
  fake.docs.set("deleted_isabelle", { id: "isabelle", at: 1 });
  fake.docs.delete("profile_isabelle");
  await vi.advanceTimersByTimeAsync(3000);
  expect(fake.docs.has("profile_isabelle")).toBe(false);
});
