import type { Character } from "../../rpg/character";
import { DISCOVERIES, REGIONS, type Point } from "../../adventure/data";
import type { WorldGrid } from "../../world/grid";

const COLORS: Record<string, string> = {
  grass: "#6c9a3f",
  dirt: "#c5925a",
  moss: "#3b6a35",
  rock: "#8f8a80",
  mud: "#6d5438",
  gravel: "#aaa28d",
  sand: "#d8bf86",
  basalt: "#4b4650",
  lava: "#ff7a2a",
  ash: "#77736f",
};
/** Journal map: the real collision/surface grid, rotated to match the on-screen view. Unexplored regions stay in shadow. */
export function worldMap(grid: WorldGrid, save: Pick<Character, "regions" | "nests" | "discoveries">, player: Point) {
  const s = 3.2,
    pad = 10;
  const canvas = document.createElement("canvas");
  const bounds = REGIONS.filter((r) => r.built).reduce<[number, number, number, number]>(
    (b, r) => [Math.min(b[0], r.bounds[0]), Math.min(b[1], r.bounds[1]), Math.max(b[2], r.bounds[2]), Math.max(b[3], r.bounds[3])],
    [1e9, 1e9, -1e9, -1e9],
  );
  const rx = (x: number, y: number) => (x - y) * Math.SQRT1_2 * s;
  const ry = (x: number, y: number) => (x + y) * Math.SQRT1_2 * s;
  const corners = [
    [bounds[0], bounds[1]],
    [bounds[2], bounds[1]],
    [bounds[0], bounds[3]],
    [bounds[2], bounds[3]],
  ];
  const minX = Math.min(...corners.map(([x, y]) => rx(x, y))) - pad;
  const minY = Math.min(...corners.map(([x, y]) => ry(x, y))) - pad;
  canvas.width = Math.ceil(Math.max(...corners.map(([x, y]) => rx(x, y))) - minX + pad);
  canvas.height = Math.ceil(Math.max(...corners.map(([x, y]) => ry(x, y))) - minY + pad);
  canvas.className = "world-map";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "World map of the regions you have explored");
  const c = canvas.getContext("2d")!;
  const step = 0.75;
  for (const r of REGIONS) {
    if (!r.built) continue;
    const seen = save.regions.includes(r.id);
    for (let y = r.bounds[1]; y < r.bounds[3]; y += step)
      for (let x = r.bounds[0]; x < r.bounds[2]; x += step) {
        const f = grid.flagsAt(x, y);
        const wet = (f & 2) !== 0;
        const col = !seen ? ((f & 1) !== 0 ? "#2d3e34" : "#1b2a22") : wet ? ((f & 4) !== 0 ? "#2f93a6" : "#58c6c4") : (f & 1) !== 0 ? COLORS[grid.surface(x, y)] ?? "#6c9a3f" : "#264a31";
        c.fillStyle = col;
        c.fillRect(rx(x, y) - minX, ry(x, y) - minY, step * s * 1.1, step * s * 1.1);
      }
    c.fillStyle = seen ? "#fdf2cf" : "#8ea091";
    c.font = "600 15px Palatino, Georgia, serif";
    c.fillText(r.name, rx(r.nest.x, r.nest.y) - minX - 36, ry(r.nest.x, r.nest.y) - minY - 28);
    if (save.nests.includes(r.id)) {
      c.fillStyle = "#ffe08a";
      c.beginPath();
      c.arc(rx(r.nest.x, r.nest.y) - minX, ry(r.nest.x, r.nest.y) - minY, 6, 0, 7);
      c.fill();
    }
  }
  for (const d of DISCOVERIES) {
    if (d.kind === "forage" || !save.discoveries.includes(d.id)) continue;
    c.fillStyle = "#fff0b0";
    c.strokeStyle = "#1d2d22";
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(rx(d.x, d.y) - minX, ry(d.x, d.y) - minY, 3.5, 0, 7);
    c.fill();
    c.stroke();
  }
  c.fillStyle = "#ffffff";
  c.strokeStyle = "#143023";
  c.lineWidth = 2.5;
  c.beginPath();
  c.arc(rx(player.x, player.y) - minX, ry(player.x, player.y) - minY, 6, 0, 7);
  c.fill();
  c.stroke();
  return canvas;
}
