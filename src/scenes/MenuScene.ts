import * as Phaser from "phaser";
import { presentation } from "../game/config";
export class MenuScene extends Phaser.Scene {
  constructor() {
    super("Menu");
  }
  create() {
    this.cameras.main.setOrigin(0, 0).setZoom(presentation.renderScale);
    this.add
      .image(210, 370, "hollow-floor")
      .setDisplaySize(420, 740)
      .setAlpha(0.4);
    this.add.image(210, 370, "hollow-fringe").setDisplaySize(420, 740);
    const glow = this.add.circle(210, 330, 96, 0xffdca0, 0.1);
    const hero = this.add.sprite(210, 320, "rex-5", "bite-0").setScale(1.125);
    if (!this.registry.get("reducedMotion")) {
      hero.setFrame("bite-0");
      this.tweens.add({
        targets: hero,
        scaleX: 1.14,
        scaleY: 1.1,
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.tweens.add({
        targets: hero,
        y: 313,
        duration: 1900,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.tweens.add({
        targets: glow,
        alpha: 0.2,
        scale: 1.15,
        duration: 2400,
        yoyo: true,
        repeat: -1,
      });
    }
  }
}
