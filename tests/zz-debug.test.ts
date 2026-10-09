import { it } from "vitest";
import { appendFileSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { parseWorld, type WorldMeta } from "../src/world/world";
const load = (d: string) => {
  const meta = JSON.parse(readFileSync(d + "/world.json", "utf8")) as WorldMeta;
  return parseWorld(meta, new Uint8Array(gunzipSync(readFileSync(d + "/world.bin.gz"))));
};
it("debug", () => {
  for (const d of ["public/world", ".scratch/pub"]) {
    const w = load(d);
    const g = w.grid;
    const from = w.meta.pois.start_nest as [number, number];
    const key = (x: number, y: number) => `${Math.round(x / 0.5)},${Math.round(y / 0.5)}`;
    const seen = new Set<string>();
    const q: [number, number][] = [[from[0], from[1]]];
    seen.add(key(from[0], from[1]));
    while (q.length) {
      const [x, y] = q.pop()!;
      for (const [dx, dy] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (!seen.has(k) && g.fits(nx, ny, 0.45)) { seen.add(k); q.push([nx, ny]); }
      }
    }
    const near = (p: [number, number]) => { for (let dx = -2.2; dx <= 2.2; dx += 0.5) for (let dy = -2.2; dy <= 2.2; dy += 0.5) if (seen.has(key(p[0] + dx, p[1] + dy))) return true; return false; };
    const lines = [d, "bounds " + JSON.stringify(w.meta.bounds), "reached " + seen.size];
    for (const k of ["egg_nest", "ford", "fossil_shelf", "exit_east", "cave_mouth"]) lines.push(k + " " + JSON.stringify(w.meta.pois[k]) + " " + near(w.meta.pois[k] as [number, number]));
    appendFileSync(".scratch/dbg.txt", lines.join("\n") + "\n");
  }
});
