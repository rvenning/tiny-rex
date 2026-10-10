import * as Phaser from "phaser";
import { proj } from "../../world/projection";
import { atlasKey, creatureInfo, hasCreature } from "./assets";

/** When an atlas has no clip for a pose, the nearest one stands in so every creature animates every action. */
const FALLBACK: Record<string, string[]> = {
  dodge: ["dodge", "run", "idle"],
  skill: ["skill", "bite", "idle"],
  hurt: ["hurt", "idle"],
  recover: ["recover", "idle"],
  windup: ["windup", "idle"],
  hover: ["hover", "idle"],
  bite: ["bite", "windup", "idle"],
};

/** One creature on screen: atlas sprite (or a labelled placeholder until its art ships), a soft ground shadow and an optional
 *  additive glow (mutation rarity / boss aura) that follows the same frame. */
export class ActorView {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  glow?: Phaser.GameObjects.Image;
  clock = Math.random() * 3;
  glowColor: number | null = null;
  glowAlpha = 0.2;
  /** hide the sprite entirely (dormant ambushers) */
  hidden = false;
  private lastKey = "";
  private lastPose = "";
  constructor(
    private scene: Phaser.Scene,
    public atlasId: string,
    public scale: number,
    public radius: number,
    private tint = 0xffffff,
  ) {
    this.shadow = scene.add.image(0, 0, "fx-shadow").setAlpha(0.9);
    this.sprite = scene.add.image(0, 0, hasCreature(scene, atlasId) ? atlasKey(atlasId) : "fx-soft");
  }
  get ready() {
    return hasCreature(this.scene, this.atlasId);
  }
  /** pose: 'idle' | 'run' | ...; progress (0..1) drives one-shot poses; dir from heading in radians */
  update(dt: number, x: number, y: number, z: number, face: number, pose: string, progress?: number, flash = 0, alpha = 1) {
    if (pose !== this.lastPose) {
      this.clock = 0;
      this.lastPose = pose;
    }
    this.clock += dt;
    const p = proj(x, y, z);
    const vis = !this.hidden;
    this.sprite.setPosition(p.x, p.y).setDepth(p.y).setAlpha(alpha).setVisible(vis);
    this.shadow
      .setPosition(p.x + this.radius * 14, p.y + this.radius * 3)
      .setDepth(p.y - 0.5)
      .setScale(((this.radius * 2.6 * 80) / 128) * 1.1, ((this.radius * 2.6 * 80) / 128) * 1.1)
      .setAlpha(0.75 * alpha)
      .setVisible(vis);
    if (!this.ready) {
      this.sprite.setTexture("fx-soft").setOrigin(0.5, 0.8).setScale(this.radius * 1.2).setTint(flash > 0 ? 0xffffff : this.tint);
      return;
    }
    const info = creatureInfo(this.atlasId)!;
    const wanted = FALLBACK[pose] ?? [pose, "idle"];
    const name = wanted.find((n) => info.poses[n]) ?? (info.poses.idle ? "idle" : info.poses.hover ? "hover" : Object.keys(info.poses)[0]);
    const pi = info.poses[name];
    if (!pi) return;
    let f: number;
    if (progress !== undefined) f = Math.min(pi.frames - 1, Math.floor(progress * pi.frames));
    else if (pi.loop) f = Math.floor(this.clock * pi.fps) % pi.frames;
    else f = Math.min(pi.frames - 1, Math.floor(this.clock * pi.fps));
    const k = ((Math.round(face / (Math.PI / 4)) % 8) + 8) % 8;
    const key = `${this.atlasId}/${name}/${k}/${f}`;
    const tex = this.scene.textures.get(atlasKey(this.atlasId));
    if (key !== this.lastKey) {
      const frame = tex.has(key) ? tex.get(key) : undefined;
      if (frame) {
        this.sprite.setTexture(atlasKey(this.atlasId), key);
        this.sprite.setOrigin(frame.pivotX ?? 0.5, frame.pivotY ?? 0.8);
        this.lastKey = key;
        if (this.glow) {
          this.glow.setTexture(atlasKey(this.atlasId), key);
          this.glow.setOrigin(frame.pivotX ?? 0.5, frame.pivotY ?? 0.8);
        }
      }
    }
    const sc = this.scale / Math.max(0.1, info.renderScale ?? 1);
    this.sprite.setScale(sc);
    if (flash > 0) this.sprite.setTint(0xfff4d8).setTintMode(Phaser.TintModes.FILL);
    else if (this.tint !== 0xffffff) this.sprite.setTint(this.tint).setTintMode(Phaser.TintModes.MULTIPLY);
    else this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    // additive aura
    if (this.glowColor !== null && vis) {
      if (!this.glow) {
        this.glow = this.scene.add.image(0, 0, atlasKey(this.atlasId), this.lastKey || undefined).setBlendMode(Phaser.BlendModes.ADD);
        const frame = tex.has(this.lastKey) ? tex.get(this.lastKey) : undefined;
        if (frame) this.glow.setOrigin(frame.pivotX ?? 0.5, frame.pivotY ?? 0.8);
      }
      const pulse = 0.82 + 0.18 * Math.sin(this.clock * 3.2);
      this.glow.setVisible(true).setPosition(p.x, p.y).setDepth(p.y + 0.2).setScale(sc * 1.015).setTint(this.glowColor).setAlpha(this.glowAlpha * pulse * alpha);

    } else this.glow?.setVisible(false);
  }
  restart() {
    this.clock = 0;
  }
  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
    this.glow?.destroy();
  }
}
