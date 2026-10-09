// node tools/qa/species.mjs : switch Rex -> Triceratops at the nest while playing; reports the player's sprite atlas
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=d3d11"] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.routeWebSocket("**", (s) => s.close());
  await page.route(/googleapis|firebaseapp|gstatic/, (r) => r.abort());
  await page.addInitScript(() => {
    if (sessionStorage.getItem("s")) return; sessionStorage.setItem("s", "1"); localStorage.clear();
    localStorage.setItem("trex_profiles", JSON.stringify([{ id: "qa", name: "QA Rex", avatar: "🦖", pin: null, created: 1, updated: 1 }]));
    localStorage.setItem("trex_settings", JSON.stringify({ sound: false, lastProfile: "qa" }));
    localStorage.setItem("trex_adventure_v1_qa", JSON.stringify({ version: 1, world: 2, xp: { rex: 0, raptor: 0, trike: 0 }, species: ["rex", "raptor", "trike"], discoveries: [], regions: ["hollow"], nests: ["hollow"], rivals: [], studied: [], challenges: [], gates: [], snapshot: { dino: "rex", position: { x: 29, y: 35 }, nest: "hollow", at: 1 }, updated: 1, assist: false }));
  });
  await page.goto("http://127.0.0.1:8125/tiny-rex/");
  await page.getByRole("button", { name: /Continue as QA Rex/ }).click({ timeout: 60000 });
  await page.waitForFunction(() => window.adventureDiagnostics?.()?.ready, undefined, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const atlas = () => page.evaluate(() => { const s = window.__rex.game.scene.getScene("Adventure"); return { dino: s.sim.dino, atlas: s.playerAtlas, view: s.player?.atlasId }; });
  console.log("before", JSON.stringify(await atlas()));
  await page.evaluate(() => { const s = window.__rex.game.scene.getScene("Adventure"); console.log("near", s.sim.nearNest, s.sim.switchSpecies("trike")); });
  await page.waitForTimeout(2500);
  console.log("after", JSON.stringify(await atlas()));
  await page.screenshot({ path: ".scratch/species.png" });
} finally { await browser.close(); }
