import * as Phaser from "phaser";
import { proj } from "../../world/projection";
import type { World } from "../../world/world";
import { PROPS_KEY, propMeta, propVariants } from "./assets";

const BASE = import.meta.env.BASE_URL + "world/ground/";

/** Streams the baked ground tiles around the camera and drops the ones that fall far behind. */
export class GroundLayer {
  private tiles = new Map<string, Phaser.GameObjects.Image | "loading">();
  private index = new Map<string, string>();
  private tileSize: number;
  private ox: number;
  private oy: number;
  constructor(
    private scene: Phaser.Scene,
    world: World,
  ) {
    const c = world.meta.canvas;
    this.tileSize = world.meta.tileSize ?? c?.tile ?? 512;
    this.ox = c?.ox ?? 0;
    this.oy = c?.oy ?? 0;
    for (const t of world.meta.tiles ?? []) this.index.set(`${t.tx}_${t.ty}`, t.file);
  }
  get available() {
    return this.index.size > 0;
  }
  update(view: Phaser.Geom.Rectangle, urgent = false) {
    const T = this.tileSize,
      m = T * (urgent ? 1.0 : 1.2);
    const x0 = Math.floor((view.x - m - this.ox) / T),
      x1 = Math.floor((view.right + m - this.ox) / T),
      y0 = Math.floor((view.y - m - this.oy) / T),
      y1 = Math.floor((view.bottom + m - this.oy) / T);
    let started = 0;
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        const id = `${tx}_${ty}`,
          file = this.index.get(id);
        if (!file || this.tiles.has(id)) continue;
        if (started >= 6) continue;
        started++;
        this.tiles.set(id, "loading");
        const key = "g" + id;
        this.scene.load.image(key, BASE + file);
        this.scene.load.once(`filecomplete-image-${key}`, () => {
          if (!this.scene.sys.isActive() && !this.scene.sys.isPaused()) return;
          const img = this.scene.add.image(this.ox + tx * T, this.oy + ty * T, key).setOrigin(0, 0).setDepth(-1e6);
          this.tiles.set(id, img);
        });
        this.scene.load.once(`loaderror`, () => this.tiles.delete(id));
      }
    if (started && !this.scene.load.isLoading()) this.scene.load.start();
    // drop tiles that are far outside the view (keep memory bounded)
    const drop = T * 2.4;
    for (const [id, t] of this.tiles) {
      if (t === "loading") continue;
      if (t.x + T < view.x - drop || t.x > view.right + drop || t.y + T < view.y - drop || t.y > view.bottom + drop) {
        t.destroy();
        this.scene.textures.remove("g" + id);
        this.tiles.delete(id);
      }
    }
  }
  /** how many tiles currently cover the view (used by tests / diagnostics) */
  get loaded() {
    return [...this.tiles.values()].filter((t) => t !== "loading").length;
  }
  destroy() {
    for (const [id, t] of this.tiles) {
      if (t !== "loading") t.destroy();
      if (this.scene.textures.exists("g" + id)) this.scene.textures.remove("g" + id);
    }
    this.tiles.clear();
  }
}

interface PropRec {
  name: string;
  frame: string;
  sx: number;
  sy: number;
  scale: number;
  kind: "solid" | "soft" | "deco";
  img?: Phaser.GameObjects.Image;
}

/** Depth-sorted prop sprites, created only near the camera. A prop's depth is its foot y. */
export class PropLayer {
  private recs: PropRec[] = [];
  private cells = new Map<string, PropRec[]>();
  private live = new Set<PropRec>();
  private cell = 512;
  constructor(
    private scene: Phaser.Scene,
    world: World,
  ) {
    for (const [name, v, x, y, z, s] of world.meta.props) {
      const nv = propVariants.get(name);
      if (!nv) continue;
      const frame = `${name}/${v % nv}`;
      const p = proj(x, y, z);
      const kind = propMeta.get(frame)?.kind ?? "deco";
      const rec: PropRec = { name, frame, sx: p.x, sy: p.y, scale: s, kind };
      this.recs.push(rec);
      const k = `${Math.floor(p.x / this.cell)},${Math.floor(p.y / this.cell)}`;
      (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(rec);
    }
  }
  get count() {
    return this.recs.length;
  }
  get active() {
    return this.live.size;
  }
  update(view: Phaser.Geom.Rectangle) {
    const m = 320; // props can be tall: keep a generous margin above/below
    const want = new Set<PropRec>();
    const cx0 = Math.floor((view.x - m) / this.cell),
      cx1 = Math.floor((view.right + m) / this.cell),
      cy0 = Math.floor((view.y - m) / this.cell),
      cy1 = Math.floor((view.bottom + m * 2) / this.cell);
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++)
        for (const r of this.cells.get(`${cx},${cy}`) ?? []) want.add(r);
    for (const r of want)
      if (!r.img) {
        const img = this.scene.add.image(r.sx, r.sy, PROPS_KEY, r.frame);
        const f = img.frame;
        img.setOrigin(f.pivotX ?? 0.5, f.pivotY ?? 0.8).setScale(r.scale).setDepth(r.sy);
        r.img = img;
        this.live.add(r);
      }
    for (const r of this.live)
      if (!want.has(r)) {
        r.img?.destroy();
        r.img = undefined;
        this.live.delete(r);
      }
  }
  /** soft foliage in front of the player fades so the hunt stays readable */
  fade(player: { x: number; y: number }, extra: { x: number; y: number }[], dt: number) {
    for (const r of this.live) {
      const img = r.img!;
      let target = 1;
      if (r.kind !== "solid" || r.name.startsWith("palm") || r.name.startsWith("tree")) {
        const b = img.getBounds();
        const hides = (p: { x: number; y: number }) => p.y < r.sy && b.contains(p.x, p.y - 40);
        if (hides(player) || extra.some(hides)) target = r.kind === "soft" ? 0.28 : 0.45;
      }
      img.alpha += (target - img.alpha) * Math.min(1, dt * 8);
    }
  }
  destroy() {
    for (const r of this.live) r.img?.destroy();
    this.live.clear();
  }
}
