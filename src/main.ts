import * as Phaser from "phaser";
import { registerSW } from "virtual:pwa-register";
import { BootScene } from "./scenes/BootScene";
import { MenuScene } from "./scenes/MenuScene";
import { PlayScene } from "./scenes/PlayScene";
import { presentation } from "./game/config";
import { App } from "./ui/app";
import "./ui/style.css";

document.getElementById("stage")!.tabIndex = 0;
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "stage",
  width: presentation.width * presentation.renderScale,
  height: presentation.height * presentation.renderScale,
  backgroundColor: "#152820",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 },
  render: { antialias: true, roundPixels: false },
  fps: { target: 60 },
  scene: [BootScene, MenuScene, PlayScene],
});
const app = new App(game);
// Updates are offered between hunts; no automatic reload mid-run.
const update = registerSW({
  onNeedRefresh() {
    const el = document.createElement("button");
    el.className = "update-button";
    el.textContent = "A fresh adventure is ready · update";
    el.onclick = () => {
      if (document.body.dataset.screen !== "playing") void update(true);
      else el.textContent = "Finish this feast, then tap to update";
    };
    document.body.append(el);
  },
});
// Read-only diagnostics support smoke tests without cheating controls in production.
Object.assign(window, {
  rexDiagnostics: () => {
    const play = game.scene.getScene("Play") as PlayScene;
    const sim = play.sim;
    return {
      phaser: Phaser.VERSION,
      scene: game.scene.isActive("Play") ? "Play" : "Menu",
      paused: game.scene.isPaused("Play"),
      textures: game.textures.getTextureKeys().length,
      fps: game.loop.actualFps,
      pointers: game.input.pointers.length,
      displayObjects: play.children?.list.length ?? 0,
      textureBytes: game.textures.getTextureKeys().reduce((bytes, key) => {
        const image = game.textures
          .get(key)
          .getSourceImage() as HTMLCanvasElement;
        return bytes + image.width * image.height * 4;
      }, 0),
      savesAvailable: app.store.available,
      animation: play.animationState,
      player: sim
        ? { x: sim.player.x, y: sim.player.y, tier: sim.player.tier }
        : null,
      target: sim ? { ...sim.target } : null,
      entities:
        sim?.entities.map((e) => ({
          id: e.id,
          x: e.x,
          y: e.y,
          plant: e.sp.kind === "plant",
          tier: e.sp.tier,
          spiky: e.sp.spiky,
        })) ?? [],
    };
  },
});
