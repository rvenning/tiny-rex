import * as Phaser from "phaser";
import { bakeTextures } from "../art/textures";
import sourceUrl from "../art/assets/dinosaurs-storybook.webp";
import { prepareStorybook } from "../art/storybook";
import propsUrl from "../art/assets/valley-props-storybook.webp";
import bugsUrl from "../art/assets/bugs-storybook.webp";
import biteUrl from "../art/assets/rex-bite-storybook.webp";
import { prepareLandscape } from "../art/landscape";
export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }
  preload() {
    this.load.image("storybook-source", sourceUrl);
    this.load.image("bite-source", biteUrl);
    this.load.image("bugs-source", bugsUrl);
    this.load.image("props-source", propsUrl);
  }
  create() {
    prepareStorybook(this);
    prepareLandscape(this);
    bakeTextures(this);
    this.registry.set("ready", true);
    this.scene.start("Menu");
    window.dispatchEvent(new Event("rex-ready"));
  }
}
