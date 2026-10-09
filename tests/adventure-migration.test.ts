import { afterEach, expect, it, vi } from "vitest";
import { AdventureStore, validateAdventure } from "../src/adventure/save";
import { byRegion } from "../src/adventure/data";

afterEach(() => vi.unstubAllGlobals());
it("keeps earned draft progress while relocating obsolete coordinates to a refuge", () => {
  const legacy = { version: 1, xp: { rex: 120, raptor: 30 }, species: ["rex", "raptor"], discoveries: ["fossil-hollow-0"], snapshot: { dino: "raptor", nest: "hollow", position: { x: 800, y: 900 }, at: 200 }, updated: 200 };
  const memory = new Map([["trex_adventure_v1_test", JSON.stringify(legacy)]]);
  vi.stubGlobal("localStorage", { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) });
  const migrated = new AdventureStore().read("test");
  expect(migrated.world).toBe(2);
  expect(migrated.xp.rex).toBe(120);
  expect(migrated.species).toContain("raptor");
  expect(migrated.discoveries).toContain("fossil-hollow-0");
  expect(migrated.snapshot.position).toEqual(byRegion("hollow").nest);
  new AdventureStore().write("test", migrated);
  expect(JSON.parse(memory.get("trex_adventure_v1_test_backup")!)).toEqual(legacy);
  expect(validateAdventure(migrated)).toEqual(migrated);
});
