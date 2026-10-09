import * as Phaser from "phaser";
import { proj } from "../world/projection";
import type { World } from "../world/world";
import { ActorView } from "./adventure/actor-view";
import { loadCreature, loadProps } from "./adventure/assets";
import { GroundLayer, PropLayer } from "./adventure/world-view";

/** Title backdrop: the real Fern Hollow, a hatchling idling in the clearing, a slow drifting camera. */
export class MenuScene extends Phaser.Scene {
  private ground?: GroundLayer;
  private props?: PropLayer;
  private rex?: ActorView;
  private t = 0;
  private alive = false;
  constructor() {
    super("Menu");
  }
  create() {
    this.alive = true;
    const world = this.registry.get("world") as World | undefined;
    this.cameras.main.setBackgroundColor("#1b3322");
    if (!world) return;
    void Promise.all([loadProps(this), loadCreature(this, "rex_0")]).then(() => {
      if (!this.alive || !this.sys.isActive()) return;
      this.ground = new GroundLayer(this, world);
      this.props = new PropLayer(this, world);
      const n = world.meta.pois.start_nest;
      this.rex = new ActorView(this, "rex_0", 1, 0.45, 0xcfe7b0);
      this.rex.update(0, n[0] + 2.2, n[1] + 1.2, world.grid.height(n[0] + 2.2, n[1] + 1.2), Math.PI / 4, "idle");
    });
    this.events.once("shutdown", () => {
      this.alive = false;
      this.ground?.destroy();
      this.props?.destroy();
      this.rex?.destroy();
      this.ground = this.props = this.rex = undefined;
    });
  }
  update(_t: number, delta: number) {
    const world = this.registry.get("world") as World | undefined;
    if (!world || !this.ground || !this.props) return;
    const dt = delta / 1000;
    this.t += dt;
    const cam = this.cameras.main;
    const n = world.meta.pois.start_nest;
    const reduced = !!this.registry.get("reducedMotion");
    const dpr = Math.max(1, this.scale.width / innerWidth);
    const zoom = Math.max(0.6, Math.min(1.5, Math.min(innerWidth / 1100, innerHeight / 800))) * dpr;
    cam.setZoom(zoom);
    const c = proj(n[0] + 3, n[1] + 0.5, 0);
    const sway = reduced ? 0 : Math.sin(this.t * 0.2) * 40;
    cam.centerOn(c.x + sway, c.y - 60);
    this.ground.update(cam.worldView, true);
    this.props.update(cam.worldView);
    this.rex?.update(dt, n[0] + 2.2, n[1] + 1.2, world.grid.height(n[0] + 2.2, n[1] + 1.2), Math.PI / 4, "idle");
  }
}
