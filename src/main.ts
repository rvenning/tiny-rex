import * as Phaser from "phaser";
import { registerSW } from "virtual:pwa-register";
import { BootScene } from "./scenes/BootScene";
import { AdventureScene } from "./scenes/AdventureScene";
import { MenuScene } from "./scenes/MenuScene";
import { App } from "./ui/app";
import "./ui/style.css";
import "./ui/hud.css";
import "./ui/rpg.css";

/** Render resolution: crisp on retina, capped so older iPads keep a steady frame rate. */
export function renderScale() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const budget = Number(localStorage.getItem("trex_pixel_budget")) || 3_300_000;
  const px = innerWidth * innerHeight * dpr * dpr;
  return px > budget ? Math.max(1, Math.sqrt(budget / (innerWidth * innerHeight))) : dpr;
}
document.getElementById("stage")!.tabIndex = 0;
const s0 = renderScale();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "stage",
  width: Math.round(innerWidth * s0),
  height: Math.round(innerHeight * s0),
  backgroundColor: "#152820",
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / s0, autoCenter: Phaser.Scale.NO_CENTER },
  input: { activePointers: 4 },
  render: { antialias: true, roundPixels: false, powerPreference: "high-performance" },
  fps: { target: 60 },
  scene: [BootScene, MenuScene, AdventureScene],
});
let fitFrame = 0;
/** Keep the canvas exactly as large as the window. Phaser's own zoom bookkeeping can lag one resize behind, so the
 *  CSS box is set explicitly and the scale manager is told to re-measure it (input coordinates depend on that). */
function fit() {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => {
    const s = renderScale();
    game.scale.resize(Math.round(innerWidth * s), Math.round(innerHeight * s));
    game.scale.setZoom(1 / s);
    const c = game.canvas;
    c.style.width = innerWidth + "px";
    c.style.height = innerHeight + "px";
    game.scale.refresh();
  });
}
addEventListener("resize", fit);
addEventListener("orientationchange", () => setTimeout(fit, 120));
const app = new App(game);
// Updates are offered between hunts; no automatic reload mid-run.
const update = registerSW({
  onNeedRefresh() {
    const el = document.createElement("button");
    el.className = "update-button";
    el.textContent = "A fresh adventure is ready · update";
    el.onclick = () => {
      if (document.body.dataset.screen !== "adventure") void update(true);
      else el.textContent = "Rest at a nest, then tap to update";
    };
    document.body.append(el);
  },
});
// Read-only diagnostics for browser tests; nothing here can change the game.
Object.assign(window, {
  adventureDiagnostics: () => {
    const adventure = game.scene.getScene("Adventure") as AdventureScene;
    return adventure.sim ? adventure.diagnostics() : null;
  },
  __rex: { game, app },
});
