import * as Phaser from "phaser";
import { loadWorld } from "../world/world";
import { makeTextures } from "./adventure/fx";

/** Boots the engine, decodes the shared world data, then hands over to the menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }
  create() {
    makeTextures(this);
    loadWorld()
      .then((world) => {
        this.registry.set("world", world);
        this.registry.set("ready", true);
        this.scene.start("Menu");
        window.dispatchEvent(new Event("rex-ready"));
      })
      .catch((err) => {
        console.error("world failed to load", err);
        window.dispatchEvent(new CustomEvent("rex-failed", { detail: String(err) }));
      });
  }
}
