import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { SaveStore, blankProgress } from "../src/platform/storage";
import {
  validateProfile,
  validateProgress,
  matchesProfilePin,
} from "../src/platform/validation";
import { reconcile } from "../src/platform/sync-plan";
import { leaderboardMarkup } from "../src/ui/screens/leaderboard";
const profile = {
  id: "isabelle",
  name: "Isabelle",
  avatar: "🦖",
  pin: "1234",
  created: 1,
  updated: 1,
};
beforeEach(() => {
  const memory = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
    removeItem: (k: string) => memory.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("escapes synced avatars even if the validation boundary is bypassed", () => {
  const bad = { ...profile, avatar: '<img src=x onerror="evil()">' };
  const markup = leaderboardMarkup(
    [{ p: bad, progress: blankProgress() }],
    null,
    () => "",
    "",
    "",
    "",
  );
  expect(markup).not.toContain("<img");
  expect(markup).toContain("&lt;img");
});
it("validates profile identity, avatars, PINs and name length", () => {
  expect(validateProfile({ ...profile, id: "other" }, "isabelle")).toBe(null);
  expect(
    validateProfile({
      ...profile,
      avatar: "<script>",
      name: "x".repeat(80),
      pin: "bad",
    }),
  ).toMatchObject({ avatar: "🦖", name: "x".repeat(24), pin: null });
  expect(validateProfile({ ...profile, updated: Infinity })?.updated).toBe(0);
});
it("rejects markup in numeric progress while preserving future save fields", () => {
  expect(
    validateProgress({
      feastBest: "<img src=x>",
      feastTier: Infinity,
      catches: -5,
      met: { fern: 1 },
      future: 17,
    }),
  ).toMatchObject({
    feastBest: 0,
    feastTier: 0,
    catches: 0,
    met: { fern: 1 },
    future: 17,
  });
});
it("a stale device adding/editing/removing another player never queues the whole roster", () => {
  const store = new SaveStore(),
    saved = vi.fn();
  store.write("profiles", [profile], false);
  store.write("deleted", ["old"], false);
  store.onSave = saved;
  const p = store.add("Rosalie", "🦊", null);
  expect(saved.mock.calls.map(([key]) => key)).toEqual(["profile_" + p.id]);
  saved.mockClear();
  store.update({ ...p, name: "Rose" });
  expect(saved.mock.calls.map(([key]) => key)).toEqual(["profile_" + p.id]);
  saved.mockClear();
  store.remove(p.id);
  expect(saved.mock.calls.map(([key]) => key)).toEqual(["deleted_" + p.id]);
});
it("reconnect pulls newer profiles without rewriting equal profiles/progress or existing tombstones", () => {
  const store = new SaveStore(),
    queued = new Map<string, unknown>(),
    remote = { ...profile, pin: "9999", updated: 10 };
  store.write("profiles", [profile], false);
  store.write("deleted", ["old"], false);
  const docs = [
    { id: "profile_isabelle", data: remote },
    { id: "progress_isabelle", data: blankProgress() },
    { id: "deleted_old", data: { id: "old", at: 5 } },
  ];
  reconcile(store, docs, queued);
  reconcile(store, docs, queued);
  expect(store.profiles[0].pin).toBe("9999");
  expect(queued.size).toBe(0);
});
it("a new offline deletion retains its timestamp and cannot resurrect queued saves", () => {
  const store = new SaveStore(),
    queued = new Map<string, unknown>();
  store.write("deleted", ["isabelle"], false);
  queued.set("deleted_isabelle", { id: "isabelle", at: 7 });
  queued.set("profile_isabelle", profile);
  queued.set("progress_isabelle", blankProgress());
  reconcile(store, [], queued);
  expect([...queued]).toEqual([
    ["deleted_isabelle", { id: "isabelle", at: 7 }],
  ]);
});
it("malformed remote profile/progress values never land in rendered local saves", () => {
  const store = new SaveStore(),
    queued = new Map<string, unknown>();
  reconcile(
    store,
    [
      { id: "profile_isabelle", data: { ...profile, avatar: "<img src=x>" } },
      { id: "progress_isabelle", data: { feastBest: "<svg onload=x>" } },
    ],
    queued,
  );
  expect(store.profiles[0].avatar).toBe("🦖");
  expect(store.progress("isabelle").feastBest).toBe(0);
});
it("restores the original parent PIN override without accepting arbitrary PINs", () => {
  expect(matchesProfilePin(profile, "1234")).toBe(true);
  expect(matchesProfilePin(profile, "7777")).toBe(true);
  expect(matchesProfilePin(profile, "0000")).toBe(false);
});
it("keeps every avatar the original game offered", () => {
  for (const avatar of ["🦖", "🦕", "🐊", "🦎", "🐢", "🦅", "🐉", "🦊", "🐻", "🦉", "🐙", "⭐"])
    expect(validateProfile({ ...profile, avatar })?.avatar).toBe(avatar);
});
