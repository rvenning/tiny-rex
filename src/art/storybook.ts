import type { Scene } from "phaser";

// The supplied painted sheet has deliberately calibrated row cuts. Every frame
// is rebaked to a uniform feet baseline; raw generated-grid alignment is never
// trusted at runtime. Source alpha and a single scale per row are preserved.
const cuts = [0, 202, 380, 570, 740, 889, 1086];
type Frame = {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
};
let rows: Frame[][] = [];
let sizes: { w: number; h: number }[] = [];
export function prepareStorybook(scene: Scene) {
  const source = scene.textures
    .get("storybook-source")
    .getSourceImage() as HTMLImageElement;
  rows = [];
  sizes = [];
  for (let row = 0; row < 6; row++) {
    const frames: Frame[] = [];
    for (let col = 0; col < 6; col++) {
      const left = Math.round((col * source.width) / 6),
        right = Math.round(((col + 1) * source.width) / 6);
      const canvas = document.createElement("canvas");
      canvas.width = right - left;
      canvas.height = cuts[row + 1] - cuts[row];
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(
        source,
        left,
        cuts[row],
        canvas.width,
        canvas.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let x = canvas.width,
        y = canvas.height,
        x2 = 0,
        y2 = 0;
      for (let j = 0; j < canvas.height; j++)
        for (let i = 0; i < canvas.width; i++)
          if (pixels[(j * canvas.width + i) * 4 + 3] > 100) {
            x = Math.min(x, i);
            y = Math.min(y, j);
            x2 = Math.max(x2, i);
            y2 = Math.max(y2, j);
          }
      frames.push({ canvas, x, y, w: x2 - x + 1, h: y2 - y + 1 });
    }
    rows.push(frames);
    sizes.push({
      w: Math.max(...frames.map((f) => f.w)),
      h: Math.max(...frames.map((f) => f.h)),
    });
  }
  // The source is used at boot only; atlases own the pixels from now on.
  scene.textures.remove("storybook-source");
  const bite = scene.textures
    .get("bite-source")
    .getSourceImage() as HTMLImageElement;
  const biteFrames: Frame[] = [];
  for (const col of [0, 2]) {
    const canvas = document.createElement("canvas");
    canvas.width = bite.width / 3;
    canvas.height = bite.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(
      bite,
      col * canvas.width,
      0,
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let x = canvas.width,
      y = canvas.height,
      x2 = 0,
      y2 = 0;
    for (let j = 0; j < canvas.height; j++)
      for (let i = 0; i < canvas.width; i++)
        if (pixels[(j * canvas.width + i) * 4 + 3] > 100) {
          x = Math.min(x, i);
          y = Math.min(y, j);
          x2 = Math.max(x2, i);
          y2 = Math.max(y2, j);
        }
    biteFrames.push({ canvas, x, y, w: x2 - x + 1, h: y2 - y + 1 });
  }
  rows.push(biteFrames);
  sizes.push({
    w: Math.max(...biteFrames.map((f) => f.w)),
    h: Math.max(...biteFrames.map((f) => f.h)),
  });
  scene.textures.remove("bite-source");
  const bugs = scene.textures
    .get("bugs-source")
    .getSourceImage() as HTMLImageElement;
  for (let row = 0; row < 3; row++) {
    const frames: Frame[] = [];
    for (let col = 0; col < 6; col++) {
      const left = Math.round((col * bugs.width) / 6),
        right = Math.round(((col + 1) * bugs.width) / 6);
      const bugCuts = [0, 295, 555, 887].map((y) =>
        Math.round((y * bugs.height) / 887),
      );
      const top = bugCuts[row],
        bottom = bugCuts[row + 1];
      const canvas = document.createElement("canvas");
      canvas.width = right - left;
      canvas.height = bottom - top;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(
        bugs,
        left,
        top,
        canvas.width,
        canvas.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let x = canvas.width,
        y = canvas.height,
        x2 = 0,
        y2 = 0;
      for (let j = 0; j < canvas.height; j++)
        for (let i = 0; i < canvas.width; i++)
          if (pixels[(j * canvas.width + i) * 4 + 3] > 100) {
            x = Math.min(x, i);
            y = Math.min(y, j);
            x2 = Math.max(x2, i);
            y2 = Math.max(y2, j);
          }
      frames.push({ canvas, x, y, w: x2 - x + 1, h: y2 - y + 1 });
    }
    rows.push(frames);
    sizes.push({
      w: Math.max(...frames.map((f) => f.w)),
      h: Math.max(...frames.map((f) => f.h)),
    });
  }
  scene.textures.remove("bugs-source");
}
export function releaseStorybook() {
  rows = [];
  sizes = [];
}
export function paintStorybook(
  ctx: CanvasRenderingContext2D,
  row: number,
  r: number,
  frame: number,
  hue = 0,
) {
  const f = rows[row][frame % 6],
    max = sizes[row];
  const scale = Math.min(
    (r * (row === 6 ? 3.4 : 3.2)) / max.w,
    (r * 2.6) / max.h,
  );
  ctx.save();
  if (hue) ctx.filter = `hue-rotate(${hue}deg)`;
  ctx.drawImage(
    f.canvas,
    f.x,
    f.y,
    f.w,
    f.h,
    (-f.w * scale) / 2,
    r * 0.88 - f.h * scale,
    f.w * scale,
    f.h * scale,
  );
  ctx.restore();
}
export function storybookRow(shape: string): number | undefined {
  return (
    {
      biped: 1,
      runner: 1,
      crested: 1,
      rex: 0,
      frilled: 2,
      quad: 3,
      plated: 3,
      club: 4,
      longneck: 5,
    } as Record<string, number>
  )[shape];
}
