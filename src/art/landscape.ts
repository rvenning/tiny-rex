import type { Scene } from "phaser";
import { presentation as P } from "../game/config";
import { hash2 } from "./math";

let props: HTMLImageElement;
export function prepareLandscape(scene: Scene) {
  props = scene.textures
    .get("props-source")
    .getSourceImage() as HTMLImageElement;
}
export function paintProp(
  ctx: CanvasRenderingContext2D,
  index: number,
  x: number,
  y: number,
  w: number,
  h: number,
  flip = false,
) {
  const cw = props.width / 4,
    row = Math.floor(index / 4),
    cuts = [0, 390, 730, 1086],
    ch = cuts[row + 1] - cuts[row];
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(
    props,
    (index % 4) * cw,
    cuts[row],
    cw,
    ch,
    -w / 2,
    -h / 2,
    w,
    h,
  );
  ctx.restore();
}
export function paintPlant(
  ctx: CanvasRenderingContext2D,
  id: string,
  r: number,
  phase: number,
) {
  ctx.save();
  ctx.rotate(Math.sin(phase) * 0.035);
  paintProp(ctx, id === "berries" ? 0 : 1, 0, -r * 0.25, r * 3.6, r * 3.3);
  ctx.restore();
}
const palettes: Record<string, string[]> = {
  hollow: ["#b4d98a", "#719b58", "#315c38"],
  gulch: ["#e8c593", "#be9666", "#735a40"],
  ridge: ["#b5aecb", "#888298", "#48465d"],
  basin: ["#d09670", "#94634f", "#563d36"],
};
/** Quiet open ground; detailed painted props frame the arena without hiding food. */
export function buildLandscape(id: string) {
  const make = () => {
    const c = document.createElement("canvas");
    c.width = P.width * P.renderScale;
    c.height = P.height * P.renderScale;
    const ctx = c.getContext("2d")!;
    ctx.scale(P.renderScale, P.renderScale);
    return { canvas: c, ctx };
  };
  const floor = make(),
    fringe = make(),
    ctx = floor.ctx,
    pal = palettes[id];
  const backdrop = ctx.createLinearGradient(0, 0, 0, 740);
  backdrop.addColorStop(0, pal[2]);
  backdrop.addColorStop(1, "#13291f");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, 420, 740);
  ctx.shadowColor = "#081611";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 7;
  ctx.fillStyle = pal[2];
  ctx.beginPath();
  ctx.roundRect(24, 119, 372, 572, 22);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(30, 125, 360, 560, 16);
  ctx.clip();
  const ground = ctx.createLinearGradient(35, 140, 365, 680);
  ground.addColorStop(0, pal[0]);
  ground.addColorStop(0.55, pal[1]);
  ground.addColorStop(1, pal[2]);
  ctx.fillStyle = ground;
  ctx.fillRect(30, 125, 360, 560);
  for (let i = 0; i < 38; i++) {
    const x = 30 + hash2(i, 71) * 360,
      y = 125 + hash2(i, 97) * 560,
      r = 14 + hash2(i, 51) * 65;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, i % 2 ? "#fff9ce13" : "#18312112");
    g.addColorStop(1, "#ffffff00");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 150; i++) {
    const x = 35 + hash2(i, 21) * 350,
      y = 130 + hash2(i, 53) * 550;
    ctx.strokeStyle = i % 3 ? "#24392d1b" : "#fff2c336";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x - 2, y + 1);
    ctx.quadraticCurveTo(x, y - 3, x + 3, y);
    ctx.stroke();
  }
  const rock =
    id === "hollow" ? 4 : id === "gulch" ? 5 : id === "ridge" ? 6 : 7;
  for (let i = 0; i < 10; i++) {
    ctx.globalAlpha = 0.35;
    const index = i % 3 === 0 ? rock : i % 3 === 1 ? 3 : 2;
    paintProp(
      ctx,
      index,
      48 + hash2(i, 19) * 320,
      150 + hash2(i, 31) * 495,
      23 + hash2(i, 29) * 16,
      25 + hash2(i, 37) * 16,
      i % 2 === 0,
    );
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.strokeStyle = "#ffefb83d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(30, 125, 360, 560, 16);
  ctx.stroke();
  const edge = fringe.ctx;
  for (let i = 0; i < 12; i++) {
    const y = 138 + i * 47;
    for (const side of [0, 1]) {
      const green = id === "hollow";
      const index = green
        ? i % 3 === 0
          ? 9
          : 10
        : i % 3 === 0 && id === "gulch"
          ? 11
          : rock;
      const size = green ? 72 : 60;
      paintProp(edge, index, side ? 410 : 10, y, size, size, side === 1);
    }
  }
  for (let i = 0; i < 6; i++) {
    const x = 35 + i * 70;
    paintProp(edge, id === "hollow" ? 10 : rock, x, 113, 68, 57, i % 2 === 0);
    paintProp(
      edge,
      id === "hollow" ? (i % 2 ? 9 : 10) : rock,
      x,
      708,
      74,
      66,
      i % 2 === 0,
    );
  }
  return { floor: floor.canvas, fringe: fringe.canvas };
}
