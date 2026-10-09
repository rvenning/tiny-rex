import * as Phaser from "phaser";
import { proj } from "../../world/projection";
import type { World } from "../../world/world";
import { PROPS_KEY, propMeta, propVariants } from "./assets";

const BASE = import.meta.env.BASE_URL + "world/ground/";
let groundSerial = 0;

/** Streams the baked ground tiles around the camera and drops the ones that fall far behind. */
export class GroundLayer {
  private prefix = `ground-${++groundSerial}-`;
  private destroyed = false;
  private tiles = new Map<string, Phaser.GameObjects.Image | "loading">();
  private index = new Map<string, string>();
  private tileSize: number;
  private ox: number;
  private oy: number;
  private gutter: number;
  constructor(
    private scene: Phaser.Scene,
    world: World,
  ) {
    const c = world.meta.canvas;
    this.tileSize = world.meta.tileSize ?? c?.tile ?? 512;
    this.ox = c?.ox ?? 0;
    this.oy = c?.oy ?? 0;
    this.gutter = world.meta.tileGutter ?? 0;
    for (const t of world.meta.tiles ?? []) this.index.set(`${t.tx}_${t.ty}`, t.file);
  }
  get available() {
    return this.index.size > 0;
  }
  update(view: Phaser.Geom.Rectangle, urgent = false) {
    const T = this.tileSize,
      m = T * 0.35;
    const x0 = Math.floor((view.x - m - this.ox) / T),
      x1 = Math.floor((view.right + m - this.ox) / T),
      y0 = Math.floor((view.y - m - this.oy) / T),
      y1 = Math.floor((view.bottom + m - this.oy) / T);
    let started = 0;
    const needed: { tx: number; ty: number; id: string; file: string }[] = [];
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        const id = `${tx}_${ty}`,
          file = this.index.get(id);
        if (!file || this.tiles.has(id)) continue;
        needed.push({ tx, ty, id, file });
      }
    const score = (t: { tx: number; ty: number }) => Math.hypot(this.ox + (t.tx + 0.5) * T - view.centerX, this.oy + (t.ty + 0.5) * T - view.centerY);
    needed.sort((a, b) => score(a) - score(b));
    for (const { tx, ty, id, file } of needed) {
        if (started >= 6) continue;
        started++;
        this.tiles.set(id, "loading");
        const key = this.prefix + id;
        this.scene.load.image(key, BASE + file);
        this.scene.load.once(`filecomplete-image-${key}`, () => {
          if (this.destroyed) {
            if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
            return;
          }
          const texture = this.scene.textures.get(key);
          const g = this.gutter;
          if (g) {
            const source = texture.source[0];
            texture.add("core", 0, g, g, source.width - g * 2, source.height - g * 2);
          }
          const img = this.scene.add.image(this.ox + tx * T, this.oy + ty * T, key, g ? "core" : undefined).setOrigin(0, 0).setDisplaySize(T, T).setDepth(-1e6);
          this.tiles.set(id, img);
        });
        this.scene.load.once(`loaderror`, () => this.tiles.delete(id));
      }
    if (started && !this.scene.load.isLoading()) this.scene.load.start();
    // drop tiles that are far outside the view (keep memory bounded)
    const drop = T * 0.8;
    for (const [id, t] of this.tiles) {
      if (t === "loading") continue;
      if (t.x + T < view.x - drop || t.x > view.right + drop || t.y + T < view.y - drop || t.y > view.bottom + drop) {
        t.destroy();
        this.scene.textures.remove(this.prefix + id);
        this.tiles.delete(id);
      }
    }
  }
  /** how many tiles currently cover the view (used by tests / diagnostics) */
  get loaded() {
    return [...this.tiles.values()].filter((t) => t !== "loading").length;
  }
  destroy() {
    this.destroyed = true;
    for (const [id, t] of this.tiles) {
      if (t !== "loading") t.destroy();
      if (this.scene.textures.exists(this.prefix + id)) this.scene.textures.remove(this.prefix + id);
    }
    this.tiles.clear();
  }
}

interface PropRec {
  name: string;
  frame: string;
  sx: number;
  sy: number;
  x: number;
  y: number;
  removed?: boolean;
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
      const rec: PropRec = { name, frame, sx: p.x, sy: p.y, x, y, scale: s, kind };
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
  clearObstruction(name: string, x: number, y: number) {
    const rec = this.recs.filter(r => r.name === name && Math.hypot(r.x - x, r.y - y) < 3)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    if (!rec) return;
    rec.removed = true;
    rec.img?.destroy();
    rec.img = undefined;
    this.live.delete(rec);
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
        for (const r of this.cells.get(`${cx},${cy}`) ?? []) if (!r.removed) want.add(r);
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
