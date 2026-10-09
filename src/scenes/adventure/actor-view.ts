import * as Phaser from "phaser";
import { proj } from "../../world/projection";
import { atlasKey, creatureInfo, hasCreature } from "./assets";

/** One creature on screen: atlas sprite (or a labelled placeholder until its art ships) plus a soft ground shadow. */
export class ActorView {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  clock = Math.random() * 3;
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
    const ground = proj(x, y, z);
    this.sprite.setPosition(p.x, p.y).setDepth(p.y).setAlpha(alpha);
    const sx = proj(x, y, z);
    this.shadow
      .setPosition(sx.x + this.radius * 14, sx.y + this.radius * 3)
      .setDepth(sx.y - 0.5)
      .setScale((this.radius * 2.6 * 80) / 128 * 1.1, (this.radius * 2.6 * 80) / 128 * 1.1)
      .setAlpha(0.75 * alpha);
    void ground;
    if (!this.ready) {
      this.sprite.setTexture("fx-soft").setOrigin(0.5, 0.8).setScale(this.radius * 1.2).setTint(flash > 0 ? 0xffffff : this.tint);
      return;
    }
    const info = creatureInfo(this.atlasId)!;
    const pi = info.poses[pose] ?? info.poses.idle ?? info.poses.hover ?? Object.values(info.poses)[0];
    const name = info.poses[pose] ? pose : info.poses.idle ? "idle" : info.poses.hover ? "hover" : Object.keys(info.poses)[0];
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
      }
    }
    this.sprite.setScale(this.scale / Math.max(0.1, info.renderScale ?? 1));
    if (flash > 0) this.sprite.setTint(0xfff4d8).setTintFill();
    else if (this.tint !== 0xffffff) this.sprite.setTint(this.tint);
    else this.sprite.clearTint();
  }
  restart() {
    this.clock = 0;
  }
  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
