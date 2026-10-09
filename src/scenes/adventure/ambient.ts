import * as Phaser from "phaser";
import { proj, unproj } from "../../world/projection";
import type { WorldGrid } from "../../world/grid";
import type { Fx } from "./fx";

/** The living layer on top of the baked world: drifting leaves and pollen, water glints and wading ripples,
 *  slow cloud shadows and the odd bird. All of it is decorative and honours reduced motion. */
export class Ambient {
  private clouds?: Phaser.GameObjects.Image;
  private t = 0;
  private leafT = 0;
  private moteT = 0;
  private glintT = 0;
  private rippleT = 0;
  private birdT = 12 + Math.random() * 10;
  private birds: Phaser.GameObjects.Image[] = [];
  constructor(
    private scene: Phaser.Scene,
    private fx: Fx,
    private grid: WorldGrid,
    private reduced: boolean,
  ) {
    if (!reduced) {
      this.clouds = scene.add.image(0, 0, "fx-clouds").setBlendMode(Phaser.BlendModes.MULTIPLY).setAlpha(0.55).setDepth(8e5);
    }
  }
  /** wind strength 0..1 driving sway, shared with the prop layer */
  get wind() {
    return this.reduced ? 0.15 : 1;
  }
  update(dt: number, view: Phaser.Geom.Rectangle, zoom: number, wading: { x: number; y: number; r: number }[]) {
    this.t += dt;
    if (this.reduced) return;
    // --- cloud shadows: one big multiplied image, drifting across the ground
    if (this.clouds) {
      const w = view.width * 1.6,
        h = view.height * 1.6;
      const scale = Math.max(w, h) / 512;
      this.clouds.setScale(scale * 2.4);
      const drift = this.t * 9;
      // wrap inside one texture period so the drift never runs out
      const period = 512 * scale * 2.4;
      this.clouds.setPosition(view.centerX + ((drift + view.x * 0.9) % period) - period * 0.5, view.centerY + (((drift * 0.55 + view.y * 0.9) % period) - period * 0.5));
      void zoom;
    }
    // --- drifting leaves (from the canopy side of the screen) and sunlit pollen
    this.leafT -= dt;
    if (this.leafT <= 0) {
      this.leafT = 0.7 + Math.random() * 1.1;
      this.fx.spawn("fx-leaf", view.x + Math.random() * view.width * 0.8, view.y - 20 + Math.random() * view.height * 0.3, {
        vx: 26 + Math.random() * 24,
        vy: 22 + Math.random() * 20,
        g: 2,
        life: 6 + Math.random() * 3,
        a: 0.9,
        s0: 0.55 + Math.random() * 0.4,
        s1: 0.55,
        spin: Math.random() * 3 - 1.5,
        tint: Math.random() < 0.7 ? 0xa9de5a : 0xe3c66a,
        depth: 7e5,
      });
    }
    this.moteT -= dt;
    if (this.moteT <= 0) {
      this.moteT = 0.35;
      this.fx.spawn("fx-soft", view.x + Math.random() * view.width, view.y + view.height * (0.2 + Math.random() * 0.7), {
        vx: 6 + Math.random() * 8,
        vy: -6 - Math.random() * 6,
        life: 5 + Math.random() * 3,
        a: 0.55,
        s0: 0.1,
        s1: 0.17,
        tint: 0xfff0c0,
        depth: 7e5,
        blend: Phaser.BlendModes.ADD,
      });
    }
    // --- sun glints on the water in view
    this.glintT -= dt;
    if (this.glintT <= 0) {
      this.glintT = 0.06;
      for (let i = 0; i < 6; i++) {
        const sx = view.x + Math.random() * view.width,
          sy = view.y + Math.random() * view.height;
        const g = unproj(sx, sy);
        if (!this.grid.inWater(g.x, g.y) || this.grid.walkable(g.x, g.y)) continue;
        this.fx.spawn("fx-spark", sx, sy, { life: 0.5 + Math.random() * 0.5, a: 0.9, s0: 0.1, s1: 0.45, tint: 0xffffff, depth: sy + 1, blend: Phaser.BlendModes.ADD, spin: 1.5 });
        break;
      }
    }
    // --- ripples under anything wading
    this.rippleT -= dt;
    if (this.rippleT <= 0) {
      this.rippleT = 0.28;
      for (const m of wading) {
        if (!this.grid.inWater(m.x, m.y)) continue;
        const q = proj(m.x, m.y, this.grid.height(m.x, m.y));
        const ring = this.scene.add.image(q.x, q.y, "fx-ring").setDepth(q.y - 1).setAlpha(0.55).setScale(0.12, 0.07).setTint(0xdffcff);
        this.scene.tweens.add({ targets: ring, scaleX: 0.5 + m.r * 0.4, scaleY: (0.5 + m.r * 0.4) * 0.577, alpha: 0, duration: 800, onComplete: () => ring.destroy() });
        for (let i = 0; i < 3; i++) this.fx.spawn("fx-soft", q.x + (Math.random() - 0.5) * 24, q.y - 6, { vx: (Math.random() - 0.5) * 50, vy: -50 - Math.random() * 40, g: 180, life: 0.5, a: 0.8, s0: 0.12, s1: 0.05, tint: 0xeaffff, depth: q.y + 5 });
      }
    }
    // --- the occasional bird crossing high above
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 20 + Math.random() * 25;
      const n = 2 + Math.floor(Math.random() * 3);
      const y0 = view.y + view.height * (0.08 + Math.random() * 0.25);
      for (let i = 0; i < n; i++) {
        const b = this.scene.add.image(view.x - 80 - i * 40, y0 + i * 18, "fx-bird").setDepth(9e5).setAlpha(0.7).setScale(0.8 + Math.random() * 0.3);
        this.birds.push(b);
        b.setData("v", 90 + Math.random() * 25);
        b.setData("ph", Math.random() * 6);
        this.scene.tweens.add({ targets: b, x: view.right + 120, y: y0 - 60 + i * 12, duration: (view.width + 300) / 100 * 1000, onComplete: () => { b.destroy(); this.birds = this.birds.filter((x) => x !== b); } });
      }
    }
    for (const b of this.birds) b.setScale(b.scaleX, 0.65 + 0.35 * Math.sin(this.t * 9 + (b.getData("ph") as number)));
  }
  destroy() {
    this.clouds?.destroy();
    for (const b of this.birds) b.destroy();
    this.birds = [];
  }
}
