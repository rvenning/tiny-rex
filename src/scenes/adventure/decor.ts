import * as Phaser from "phaser";
import { DECOR, type DecorRule } from "../../adventure/content/decor";
import { Random } from "../../game/random";
import { proj } from "../../world/projection";
import type { World } from "../../world/world";
import type { PropLayer } from "./world-view";

/** Landmarks and flag-driven world change: props are added/removed through the PropLayer, amber seeps are additive glows. */
export class WorldDecor {
  private built = new Map<string, { glows: { img: Phaser.GameObjects.Image; base: Phaser.GameObjects.Image; x: number; y: number; a: number; phase: number }[] }>();
  constructor(
    private scene: Phaser.Scene,
    private props: PropLayer,
    private world: World,
  ) {}
  private visible(r: DecorRule, flags: ReadonlySet<string>) {
    return (!r.when || flags.has(r.when)) && !(r.unless ?? []).some((f) => flags.has(f));
  }
  private build(r: DecorRule) {
    const rng = new Random(r.seed * 7919);
    const g = this.world.grid;
    const pick = (): { x: number; y: number } | null => {
      for (let t = 0; t < 30; t++) {
        const a = rng.range(0, Math.PI * 2),
          d = Math.sqrt(rng.next()) * r.radius;
        const x = r.anchor.x + Math.cos(a) * d,
          y = r.anchor.y + Math.sin(a) * d;
        if (g.fits(x, y, 0.25)) return { x, y };
      }
      return null;
    };
    const total = r.props.reduce((n, p) => n + (p.weight ?? 1), 0);
    for (let i = 0; i < r.count && total > 0; i++) {
      const at = pick();
      if (!at) continue;
      let roll = rng.next() * total;
      const prop = r.props.find((p) => (roll -= p.weight ?? 1) <= 0) ?? r.props[0];
      const [lo, hi] = prop.scale ?? [0.85, 1.15];
      this.props.add(prop.name, Math.floor(rng.next() * 4), at.x, at.y, g.height(at.x, at.y), rng.range(lo, hi), r.id);
    }
    const glows: { img: Phaser.GameObjects.Image; base: Phaser.GameObjects.Image; x: number; y: number; a: number; phase: number }[] = [];
    if (r.glow) {
      for (let i = 0; i < r.glow.count; i++) {
        const at = pick();
        if (!at) continue;
        const q = proj(at.x, at.y, g.height(at.x, at.y));
        const img = this.scene.add.image(q.x, q.y, "fx-soft").setBlendMode(Phaser.BlendModes.ADD).setTint(r.glow.color).setDepth(q.y - 3).setScale(r.glow.size * 1.4, r.glow.size * 0.8).setAlpha(r.glow.alpha);
        const base = this.scene.add.image(q.x, q.y, "fx-soft").setTint(r.glow.color).setDepth(q.y - 3.5).setScale(r.glow.size * 1.7, r.glow.size * 0.95).setAlpha(Math.min(0.7, r.glow.alpha * 1.3));
        glows.push({ img, base, x: at.x, y: at.y, a: r.glow.alpha, phase: rng.range(0, 6) });
      }
    }
    this.built.set(r.id, { glows });
  }
  /** call after a flag changes (and once at boot) */
  refresh(flags: ReadonlySet<string>) {
    for (const r of DECOR) {
      const on = this.visible(r, flags);
      const has = this.built.has(r.id);
      if (on && !has) this.build(r);
      else if (!on && has) {
        this.props.removeTag(r.id);
        for (const gl of this.built.get(r.id)!.glows) {
          gl.img.destroy();
          gl.base.destroy();
        }
        this.built.delete(r.id);
      }
    }
  }
  update(time: number, view: Phaser.Geom.Rectangle, calm: boolean) {
    for (const b of this.built.values())
      for (const g of b.glows) {
        const near = view.contains(g.img.x, g.img.y);
        g.img.setVisible(near);
        g.base.setVisible(near);
        if (near) g.img.setAlpha(g.a * (calm ? 0.85 : 0.75 + 0.25 * Math.sin(time * 1.6 + g.phase)));
      }
  }
  destroy() {
    for (const b of this.built.values())
      for (const g of b.glows) {
        g.img.destroy();
        g.base.destroy();
      }
    this.built.clear();
  }
}
