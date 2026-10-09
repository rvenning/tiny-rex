// node tools/qa/resize.mjs : resize back and forth, report canvas vs window size and save screenshots
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
    const save = { version: 1, world: 2, xp: { rex: 0, raptor: 0, trike: 0 }, species: ["rex", "raptor", "trike"], discoveries: [], regions: ["hollow"], nests: ["hollow"], rivals: [], studied: [], challenges: [], gates: [], snapshot: { dino: "trike", position: { x: 29, y: 35 }, nest: "hollow", at: 1 }, updated: 1, assist: false };
    localStorage.setItem("trex_adventure_v1_qa", JSON.stringify(save));
  });
  await page.goto("http://127.0.0.1:8125/tiny-rex/");
  await page.getByRole("button", { name: /Continue as QA Rex/ }).click({ timeout: 60000 });
  await page.waitForFunction(() => window.adventureDiagnostics?.()?.ready, undefined, { timeout: 60000 });
  const info = () => page.evaluate(() => { const c = document.querySelector("canvas"); const r = c.getBoundingClientRect(); return { win: [innerWidth, innerHeight], canvasCss: [Math.round(r.width), Math.round(r.height)], canvasPx: [c.width, c.height], dino: window.adventureDiagnostics().dino }; });
  await page.waitForTimeout(2500);
  console.log("start", JSON.stringify(await info()));
  await page.screenshot({ path: ".scratch/rs0.png" });
  for (const [w, h, n] of [[1900, 1000, 1], [900, 1000, 2], [1200, 800, 3]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(1200);
    console.log(n, JSON.stringify(await info()));
    await page.screenshot({ path: `.scratch/rs${n}.png` });
  }
} finally { await browser.close(); }
