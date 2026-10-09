/** Collision / height / surface grid exported by tools/world/export.py. Pure data, no Phaser. */
export const F_WALK = 1,
  F_WATER = 2,
  F_DEEP = 4,
  F_STEEP = 8;
export interface GridMeta {
  bounds: [number, number, number, number];
  cell: number;
  nx: number;
  ny: number;
  surf: string[];
}
export class WorldGrid {
  readonly x0: number;
  readonly y0: number;
  readonly cell: number;
  readonly nx: number;
  readonly ny: number;
  readonly surfNames: string[];
  private flags: Uint8Array;
  private surf: Uint8Array;
  private z: Int16Array;
  constructor(meta: GridMeta, raw: Uint8Array) {
    this.x0 = meta.bounds[0];
    this.y0 = meta.bounds[1];
    this.cell = meta.cell;
    this.nx = meta.nx;
    this.ny = meta.ny;
    this.surfNames = meta.surf;
    const n = this.nx * this.ny;
    this.flags = raw.subarray(0, n);
    this.surf = raw.subarray(n, 2 * n);
    const lo = raw.subarray(2 * n, 3 * n),
      hi = raw.subarray(3 * n, 4 * n);
    this.z = new Int16Array(n);
    for (let i = 0; i < n; i++) this.z[i] = ((hi[i] << 8) | lo[i]) << 16 >> 16;
  }
  private idx(x: number, y: number) {
    const ix = Math.floor((x - this.x0) / this.cell),
      iy = Math.floor((y - this.y0) / this.cell);
    if (ix < 0 || iy < 0 || ix >= this.nx || iy >= this.ny) return -1;
    return iy * this.nx + ix;
  }
  flagsAt(x: number, y: number) {
    const i = this.idx(x, y);
    return i < 0 ? 0 : this.flags[i];
  }
  walkable(x: number, y: number) {
    return (this.flagsAt(x, y) & F_WALK) !== 0;
  }
  inWater(x: number, y: number) {
    return (this.flagsAt(x, y) & F_WATER) !== 0;
  }
  surface(x: number, y: number) {
    const i = this.idx(x, y);
    return i < 0 ? "grass" : this.surfNames[this.surf[i]];
  }
  /** terrain height in world units (bilinear) */
  height(x: number, y: number) {
    const fx = (x - this.x0) / this.cell - 0.5,
      fy = (y - this.y0) / this.cell - 0.5;
    const ix = Math.floor(fx),
      iy = Math.floor(fy),
      tx = fx - ix,
      ty = fy - iy;
    const g = (a: number, b: number) =>
      this.z[
        Math.max(0, Math.min(this.ny - 1, b)) * this.nx +
          Math.max(0, Math.min(this.nx - 1, a))
      ] / 100;
    return (
      g(ix, iy) * (1 - tx) * (1 - ty) +
      g(ix + 1, iy) * tx * (1 - ty) +
      g(ix, iy + 1) * (1 - tx) * ty +
      g(ix + 1, iy + 1) * tx * ty
    );
  }
  /** can a circle of radius r stand at (x,y)? Samples the rim, so thin gaps stay passable for small bodies. */
  fits(x: number, y: number, r: number) {
    if (!this.walkable(x, y)) return false;
    const n = r < 0.6 ? 6 : 10;
    const rr = r * 0.85;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (!this.walkable(x + Math.cos(a) * rr, y + Math.sin(a) * rr)) return false;
    }
    return true;
  }
  /** slide a circle by (dx,dy), sweeping in small steps so nothing tunnels through a wall */
  move(x: number, y: number, dx: number, dy: number, r: number) {
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 1.5)));
    let px = x,
      py = y;
    const sx = dx / steps,
      sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (this.fits(px + sx, py + sy, r)) {
        px += sx;
        py += sy;
      } else if (this.fits(px + sx, py, r)) px += sx;
      else if (this.fits(px, py + sy, r)) py += sy;
      else break;
    }
    return { x: px, y: py };
  }
  /** nearest walkable point (spiral search) - used when spawning and respawning */
  nearestWalkable(x: number, y: number, r = 0.5) {
    if (this.fits(x, y, r)) return { x, y };
    for (let ring = 1; ring < 80; ring++) {
      const d = ring * this.cell * 2;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * d,
          py = y + Math.sin(a) * d;
        if (this.fits(px, py, r)) return { x: px, y: py };
      }
    }
    return { x, y };
  }
  /** line of sight across non-blocked ground (used by stalking AI) */
  clearLine(x0: number, y0: number, x1: number, y1: number) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / this.cell);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (!this.walkable(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }
}
