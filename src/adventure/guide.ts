import type { WorldGrid } from "../world/grid";
import type { Point } from "./data";

/** A* over the real collision grid with a half-unit lattice and a hatchling-sized body: the route the objective arrow follows.
 *  Growth gates are not modelled here; the arrow only answers "which way is the path", the sim explains any gate.
 *  A binary heap keeps long routes (the whole valley) cheap enough to re-plan every second or so. */
export function findRoute(grid: WorldGrid, from: Point, to: Point, radius = 0.45): Point[] {
  // a half-unit lattice is quick; narrow pinches (the ford, root gaps) need the quarter-unit lattice the collision grid really uses
  const coarse = searchRoute(grid, from, to, radius, 0.5);
  return coarse.length ? coarse : searchRoute(grid, from, to, radius, 0.25);
}
function searchRoute(grid: WorldGrid, from: Point, to: Point, radius: number, S: number): Point[] {
  const x0 = grid.x0,
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
  // binary min-heap of [f, node]
  const heap: [number, number][] = [[0, key(a.ix, a.iy)]];
  const push = (f: number, n: number) => {
    heap.push([f, n]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const h = (ix: number, iy: number) => {
    const dx = Math.abs(ix - b.ix),
      dy = Math.abs(iy - b.iy);
    return (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)) * S;
  };
  const goal = key(b.ix, b.iy);
  let found = false,
    guard = 0,
    reached = goal;
  const closed = new Set<number>();
  while (heap.length && guard++ < 400000) {
    const [, cur] = pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    // close enough counts: the target itself may sit on a ledge just off the walkable lattice
    if (cur === goal || Math.hypot(cx(cur % nx) - to.x, cy(Math.floor(cur / nx)) - to.y) < 0.9) {
      reached = cur;
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
          ng = (g.get(cur) ?? 0) + (dx && dy ? 1.414 : 1) * S;
        if (ng < (g.get(nk) ?? 1e9)) {
          g.set(nk, ng);
          came.set(nk, cur);
          push(ng + h(jx, jy), nk);
        }
      }
  }
  if (!found) return [];
  const path: Point[] = [];
  for (let k: number | undefined = reached; k !== undefined; k = came.get(k)) path.push({ x: cx(k % nx), y: cy(Math.floor(k / nx)) });
  path.reverse();
  // thin the polyline: keep a point every ~3 units plus the ends
  const every = Math.max(1, Math.round(3 / S));
  return path.filter((_, i) => i % every === 0 || i === path.length - 1);
}
