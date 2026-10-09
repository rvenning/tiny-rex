/** Isometric projection shared with tools/art/common.py. Game space is (gx, gy, gz) in world units. */
export const PPU = 80; // rendered pixels per unit along a screen axis at zoom 1
export const COS45 = Math.SQRT1_2;
const ELEV = (35.264 * Math.PI) / 180;
export const SQUASH = Math.sin(ELEV);
export const VSCALE = Math.cos(ELEV);
export interface Pt {
  x: number;
  y: number;
}
/** game ground coords (+height) -> render-pixel position in Phaser world space */
export function proj(gx: number, gy: number, gz = 0): Pt {
  return {
    x: (gx - gy) * COS45 * PPU,
    y: (gx + gy) * COS45 * PPU * SQUASH - gz * PPU * VSCALE,
  };
}
/** render-pixel position -> game ground coords at height gz */
export function unproj(sx: number, sy: number, gz = 0): Pt {
  const a = sx / (COS45 * PPU); // gx - gy
  const b = (sy + gz * PPU * VSCALE) / (COS45 * PPU * SQUASH); // gx + gy
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
/** a screen-space direction (right/down) as a unit ground direction */
export function screenDirToGround(sx: number, sy: number): Pt {
  const g = unproj(sx, sy);
  const o = unproj(0, 0);
  const x = g.x - o.x,
    y = g.y - o.y,
    l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}
