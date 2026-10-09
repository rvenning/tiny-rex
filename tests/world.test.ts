import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { parseWorld, type WorldMeta } from "../src/world/world";
import { proj, unproj } from "../src/world/projection";

const load = () => {
  const meta = JSON.parse(readFileSync("public/world/world.json", "utf8")) as WorldMeta;
  return parseWorld(meta, new Uint8Array(gunzipSync(readFileSync("public/world/world.bin.gz"))));
};

describe("projection", () => {
  it("round-trips ground points including height", () => {
    for (const [x, y, z] of [[3, 4, 0], [30, 12, 1.5], [-5, 40, 0.3]]) {
      const p = proj(x, y, z);
      const q = unproj(p.x, p.y, z);
      expect(q.x).toBeCloseTo(x, 6);
      expect(q.y).toBeCloseTo(y, 6);
    }
  });
  it("+gx runs down-right, +gy down-left, +gz up", () => {
    const o = proj(0, 0), a = proj(1, 0), b = proj(0, 1), c = proj(0, 0, 1);
    expect(a.x).toBeGreaterThan(o.x); expect(a.y).toBeGreaterThan(o.y);
    expect(b.x).toBeLessThan(o.x); expect(b.y).toBeGreaterThan(o.y);
    expect(c.y).toBeLessThan(o.y);
  });
});

describe("Fern Hollow world data", () => {
  const w = load();
  const reach = (from: [number, number], r = 0.45) => {
    const g = w.grid, seen = new Set<string>(), q: [number, number][] = [];
    const key = (x: number, y: number) => `${Math.round(x / 0.5)},${Math.round(y / 0.5)}`;
    q.push(from); seen.add(key(...from));
    while (q.length) {
      const [x, y] = q.pop()!;
      for (const [dx, dy] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (!seen.has(k) && g.fits(nx, ny, r)) { seen.add(k); q.push([nx, ny]); }
      }
    }
    // a point counts as reachable when a walkable, reached cell lies within 2.2 units (nests are solid)
    return (p: [number, number]) => {
      for (let dx = -2.2; dx <= 2.2; dx += 0.5)
        for (let dy = -2.2; dy <= 2.2; dy += 0.5)
          if (seen.has(key(p[0] + dx, p[1] + dy))) return true;
      return false;
    };
  };
  it("every discovery point is reachable from the start nest by a hatchling", () => {
    const can = reach(w.meta.pois.start_nest);
    for (const k of ["egg_nest", "ford", "fossil_shelf", "exit_east", "cave_mouth"]) {
      expect(can(w.meta.pois[k]), k).toBe(true);
    }
  });
  it("the creek blocks wading in deep water but the stepping-stone ford is walkable", () => {
    const g = w.grid;
    expect(g.fits(...(w.meta.pois.ford as [number, number]), 0.45)).toBe(true);
    expect(g.walkable(30, 25.5)).toBe(false);
  });
  it("a body cannot walk through the cliff behind the waterfall", () => {
    const g = w.grid;
    const r = g.move(14, 26, -10, -10, 0.5);
    expect(Math.hypot(r.x - 14, r.y - 26)).toBeLessThan(6);
  });
});
