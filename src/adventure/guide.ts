import type { WorldGrid } from "../world/grid";
import type { Point } from "./data";

/** A* over the real collision grid (1-unit cells, Rex-sized body): the route the objective arrow follows.
 *  Growth gates are not modelled here; the arrow only answers "which way is the path", the sim explains any gate. */
export function findRoute(grid: WorldGrid, from: Point, to: Point, radius = 0.55): Point[] {
  const S = 1,
    x0 = grid.x0,
    y0 = grid.y0,
    nx = Math.ceil((grid.nx * grid.cell) / S),
    ny = Math.ceil((grid.ny * grid.cell) / S);
  const cx = (ix: number) => x0 + (ix + 0.5) * S,
    cy = (iy: number) => y0 + (iy + 0.5) * S;
  const key = (ix: number, iy: number) => iy * nx + ix;
  const ok = new Map<number, boolean>();
  const pass = (ix: number, iy: number) => {
    if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return false;
    const k = key(ix, iy);
    let v = ok.get(k);
    if (v === undefined) {
      v = grid.fits(cx(ix), cy(iy), radius);
      ok.set(k, v);
    }
    return v;
  };
  const snap = (p: Point) => {
    const q = grid.nearestWalkable(p.x, p.y, radius);
    return { ix: Math.max(0, Math.min(nx - 1, Math.floor((q.x - x0) / S))), iy: Math.max(0, Math.min(ny - 1, Math.floor((q.y - y0) / S))) };
  };
  const a = snap(from),
    b = snap(to);
  const g = new Map<number, number>([[key(a.ix, a.iy), 0]]);
  const came = new Map<number, number>();
  const open: [number, number][] = [[0, key(a.ix, a.iy)]]; // [f, node]
  const h = (ix: number, iy: number) => {
    const dx = Math.abs(ix - b.ix),
      dy = Math.abs(iy - b.iy);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  const goal = key(b.ix, b.iy);
  let found = false,
    guard = 0;
  while (open.length && guard++ < 90000) {
    // tiny binary-less selection: the open list stays short on these maps
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[best][0]) best = i;
    const [, cur] = open.splice(best, 1)[0];
    if (cur === goal) {
      found = true;
      break;
    }
    const ix = cur % nx,
      iy = Math.floor(cur / nx);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const jx = ix + dx,
          jy = iy + dy;
        if (!pass(jx, jy)) continue;
        if (dx && dy && (!pass(ix + dx, iy) || !pass(ix, iy + dy))) continue; // no corner cutting
        const nk = key(jx, jy),
          ng = (g.get(cur) ?? 0) + (dx && dy ? 1.414 : 1);
        if (ng < (g.get(nk) ?? 1e9)) {
          g.set(nk, ng);
          came.set(nk, cur);
          open.push([ng + h(jx, jy), nk]);
        }
      }
  }
  if (!found) return [];
  const path: Point[] = [];
  for (let k: number | undefined = goal; k !== undefined; k = came.get(k)) path.push({ x: cx(k % nx), y: cy(Math.floor(k / nx)) });
  path.reverse();
  // thin the polyline: keep a point every ~3 cells plus the ends
  return path.filter((_, i) => i % 3 === 0 || i === path.length - 1);
}
