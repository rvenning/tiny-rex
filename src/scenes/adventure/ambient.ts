import * as Phaser from "phaser";
import { proj, unproj } from "../../world/projection";
import type { WorldGrid } from "../../world/grid";
import type { Fx } from "./fx";

export interface FallFeature {
  kind: string;
  x: number;
  y: number;
  w?: number;
  ztop?: number;
  zbot?: number;
}
const D = Math.SQRT1_2;
const run = (t: number) => 0.25 + 1.15 * t * t; // the sheet leaves the cliff as it falls (matches tools/art/render_world.py)
interface Streak {
  img: Phaser.GameObjects.Image;
  s: number;
  u: number;
  v: number;
}
interface Fall {
  f: Required<Pick<FallFeature, "x" | "y" | "w" | "ztop" | "zbot">>;
  streaks: Streak[];
  mist: number;
}

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
  private falls: Fall[] = [];
  constructor(
    private scene: Phaser.Scene,
    private fx: Fx,
    private grid: WorldGrid,
    private reduced: boolean,
    features: FallFeature[] = [],
  ) {
    if (!reduced)
      for (const f of features) {
        if (f.kind !== "waterfall") continue;
        const fall: Fall = { f: { x: f.x, y: f.y, w: f.w ?? 3, ztop: f.ztop ?? 2.3, zbot: f.zbot ?? -0.2 }, streaks: [], mist: 0 };
        for (let i = 0; i < 46; i++) fall.streaks.push({ img: scene.add.image(0, 0, "fx-streak").setBlendMode(Phaser.BlendModes.ADD), s: Math.random() - 0.5, u: Math.random(), v: 0.8 + Math.random() * 0.5 });
        this.falls.push(fall);
      }
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
    // --- the waterfall: streaks run down the sheet, mist blooms at its foot
    for (const fall of this.falls) {
      const { x, y, w, ztop, zbot } = fall.f;
      const foot = proj(x + D * 1.45, y + D * 1.45, zbot);
      if (foot.x < view.x - 300 || foot.x > view.right + 300 || foot.y < view.y - 700 || foot.y > view.bottom + 300) {
        for (const st of fall.streaks) st.img.setVisible(false);
        continue;
      }
      for (const st of fall.streaks) {
        const t = (st.u + this.t * 0.55 * st.v) % 1;
        const side = st.s * w * (1 + 0.25 * t);
        const gx = x + D * run(t) - D * side,
          gy = y + D * run(t) + D * side;
        const q = proj(gx, gy, ztop + (zbot - ztop) * t);
        st.img.setVisible(true).setPosition(q.x, q.y).setDepth(q.y + 6).setAlpha(Math.sin(Math.PI * t) ** 0.6 * 0.5).setScale(0.55 + 0.2 * st.v, 0.5 + t * 0.9);
      }
      fall.mist -= dt;
      if (fall.mist <= 0) {
        fall.mist = 0.1;
        const s = (Math.random() - 0.5) * w;
        const q = proj(x + D * 1.45 - D * s, y + D * 1.45 + D * s, zbot + 0.15);
        this.fx.spawn("fx-soft", q.x, q.y, { vx: (Math.random() - 0.5) * 14, vy: -16 - Math.random() * 14, life: 1.5, a: 0.4, s0: 0.35, s1: 1.0, tint: 0xeaf8ff, depth: q.y + 8 });
        if (Math.random() < 0.5) this.fx.spawn("fx-spark", q.x, q.y - 4, { vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 40, g: 120, life: 0.5, a: 0.8, s0: 0.12, s1: 0.05, tint: 0xffffff, depth: q.y + 9, blend: Phaser.BlendModes.ADD });
      }
    }
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
    for (const f of this.falls) for (const st of f.streaks) st.img.destroy();
    this.falls = [];
    for (const b of this.birds) b.destroy();
    this.birds = [];
  }
}
