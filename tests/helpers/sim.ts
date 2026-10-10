import { Adventure, idleInput, type Actor } from "../../src/adventure/sim";
import { freshCharacter, type Character } from "../../src/rpg/character";
import { xpForLevel } from "../../src/rpg/progression";
import { rollMutation } from "../../src/rpg/mutations";
import { parseWorld, type WorldMeta } from "../../src/world/world";
import type { Dino, Mutation, Rarity, Slot } from "../../src/rpg/types";

/** A real collision grid with no terrain art or network: flat walkable ground. */
export const openWorld = (nx = 234, ny = 170, bounds = [-20, -20, 214, 150]) => {
  const n = nx * ny;
  const raw = new Uint8Array(n * 4);
  raw.fill(1, 0, n);
  return parseWorld({ bounds, cell: 1, nx, ny, surf: ["grass"], version: 2, pois: {}, features: [], props: [], water: [] } as WorldMeta, raw);
};
export interface MakeOpts {
  level?: number;
  rivals?: string[];
  species?: Dino;
  seed?: number;
  mutate?: (c: Character) => void;
  empty?: boolean;
}
export const makeChar = (o: MakeOpts = {}): Character => {
  const c = freshCharacter("Tester", o.species ?? "rex", 1000, "ctest");
  c.xp = xpForLevel(o.level ?? 1);
  c.rivals = o.rivals ?? [];
  c.lootSeed = 12345;
  o.mutate?.(c);
  return c;
};
export const make = (o: MakeOpts = {}) => {
  const a = new Adventure(openWorld(), makeChar(o), o.seed ?? 42);
  if (o.empty) a.actors = [];
  return a;
};
export const tick = (a: Adventure, n = 1, input = idleInput()) => {
  for (let i = 0; i < n; i++) a.update(1 / 60, input);
};
export const place = (a: Adventure, x = 20, y = 20, face = 0) => Object.assign(a.player, { x, y, face, invuln: 0, action: 0, pose: "idle" });
export const held = (over: Partial<ReturnType<typeof idleInput>>) => ({ ...idleInput(), ...over });
/** put a single, controlled actor next to the player and remove everything else */
export const only = (a: Adventure, id: string, x: number, y: number, over: Partial<Actor> = {}) => {
  const base = a.actors.find((z) => z.spec.id === id) ?? a.addActor(id, { x, y }, { exact: true, level: 3 })!;
  Object.assign(base, { x, y, home: { x, y }, state: "idle", t: 10, cooldown: 10, ...over });
  a.actors = [base];
  return base;
};
export const gear = (a: Adventure, seed: number, rarity: Rarity, slot: Slot, unique?: string, ilvl = 5): Mutation => {
  const m = rollMutation({ seed, ilvl, species: a.dino, rarity, slot, unique });
  a.save.bag.push(m);
  a.equip(m.id);
  return m;
};
