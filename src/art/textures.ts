import * as Phaser from "phaser";
import { Art } from "./painters";
import { SPECIES, WORLDS, radius, PLAYER_R } from "../game/content";
import { presentation as P } from "../game/config";
import { paintStorybook, storybookRow, releaseStorybook } from "./storybook";
import { paintPlant, buildLandscape } from "./landscape";
const frames = P.animationFrames;
const resolution = P.atlasResolution;
/** Illustrations are baked at boot. Phaser owns all runtime animation/rendering. */
export function bakeTextures(scene: Phaser.Scene) {
  const make = (key: string, w: number, h: number) => {
    const texture = scene.textures.createCanvas(key, w, h)!;
    return { texture, ctx: texture.context };
  };
  for (const s of SPECIES) {
    const r = radius(s),
      cell = Math.ceil(r * 4 + 24),
      key = "animal-" + s.id;
    const { texture, ctx } = make(
      key,
      cell * 4 * resolution,
      cell * 2 * resolution,
    );
    ctx.scale(resolution, resolution);
    for (let f = 0; f < frames; f++) {
      const x = (f % 4) * cell,
        y = Math.floor(f / 4) * cell;
      ctx.save();
      ctx.translate(x + cell / 2, y + cell / 2);
      const row =
        s.id === "beetle"
          ? 7
          : s.id === "dragonfly"
            ? 8
            : s.id === "dimorph"
              ? 9
              : storybookRow(s.shape);
      if (row !== undefined) {
        Art.shadow(ctx, r, 1);
        const hue =
          s.id === "gigano"
            ? 150
            : s.id === "compy"
              ? 65
              : s.id === "hypsi"
                ? 35
                : s.id === "galli"
                  ? 190
                  : s.id === "kentro"
                    ? 80
                    : 0;
        paintStorybook(ctx, row, r, f, hue);
      } else if (s.kind === "plant") {
        Art.shadow(ctx, r, 1);
        paintPlant(ctx, s.id, r, (f / frames) * Math.PI * 2);
      } else
        Art.paintSpecies(
          ctx,
          s,
          r,
          1,
          (f / frames) * Math.PI * 2,
          false,
          f / frames,
        );
      ctx.restore();
      texture.add(
        String(f),
        0,
        x * resolution,
        y * resolution,
        cell * resolution,
        cell * resolution,
      );
    }
    texture.refresh();
    scene.anims.create({
      key,
      frames: Array.from({ length: frames }, (_, f) => ({
        key,
        frame: String(f),
      })),
      frameRate:
        s.id === "dragonfly"
          ? 18
          : s.id === "beetle"
            ? 14
            : s.id === "dimorph"
              ? 10
              : 12,
      repeat: -1,
    });
  }
  for (let tier = 1; tier <= 7; tier++) {
    const r = PLAYER_R[tier],
      cell = Math.ceil(r * 4.6 + 24),
      key = "rex-" + tier;
    const { texture, ctx } = make(
      key,
      cell * 4 * resolution,
      cell * 2 * resolution,
    );
    ctx.scale(resolution, resolution);
    for (let f = 0; f < frames; f++) {
      const x = (f % 4) * cell,
        y = Math.floor(f / 4) * cell;
      ctx.save();
      ctx.translate(x + cell / 2, y + cell / 2);
      Art.shadow(ctx, r, 1);
      paintStorybook(ctx, 0, r, f, tier >= 6 ? (tier - 5) * 12 : 0);
      ctx.restore();
      texture.add(
        String(f),
        0,
        x * resolution,
        y * resolution,
        cell * resolution,
        cell * resolution,
      );
    }
    for (let f = 0; f < 2; f++) {
      const x = (f + 2) * cell,
        y = cell;
      ctx.save();
      ctx.translate(x + cell / 2, y + cell / 2);
      Art.shadow(ctx, r, 1);
      paintStorybook(ctx, 6, r, f, tier >= 6 ? (tier - 5) * 12 : 0);
      ctx.restore();
      texture.add(
        "bite-" + f,
        0,
        x * resolution,
        y * resolution,
        cell * resolution,
        cell * resolution,
      );
    }
    scene.anims.create({
      key: key + "-bite",
      frames: [0, 1, 1, 0, 1, 0].map((f) => ({ key, frame: "bite-" + f })),
      frameRate: 16,
      repeat: 0,
    });
    texture.refresh();
    scene.anims.create({
      key,
      frames: Array.from({ length: frames }, (_, f) => ({
        key,
        frame: String(f),
      })),
      frameRate: 12,
      repeat: -1,
    });
  }
  releaseStorybook();
  ensureWorldTextures(scene, "hollow");
  const { texture, ctx } = make("spark", 16, 16);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(8, 8, 6, 0, Math.PI * 2);
  ctx.fill();
  texture.refresh();
}

/** Keep the menu valley and current hunt only; unused valleys cost no GPU memory. */
export function ensureWorldTextures(scene: Phaser.Scene, id: string) {
  if (scene.textures.exists(id + "-floor")) return;
  for (const world of WORLDS) {
    if (world.id === "hollow" || world.id === id) continue;
    for (const suffix of ["floor", "fringe"])
      if (scene.textures.exists(world.id + "-" + suffix))
        scene.textures.remove(world.id + "-" + suffix);
  }
  const landscape = buildLandscape(id);
  for (const [suffix, canvas] of [
    ["floor", landscape.floor],
    ["fringe", landscape.fringe],
  ] as const)
    scene.textures.addCanvas(id + "-" + suffix, canvas!);
}
