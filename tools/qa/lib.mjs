// Shared isolated-browser helper: throwaway profile + seeded character, Firebase and websockets blocked.
import { chromium } from "@playwright/test";
export const xpForLevel = (L) => { let t = 0; for (let l = 1; l < L; l++) t += Math.round(24 + 16 * l + 1.6 * l * l); return t; };
/** opts: { w, h, species, level, rivals, at:[x,y], char:{...extra character fields}, url, touch } */
export async function openGame(opts = {}) {
  const { w = 1448, h = 1086, species = "rex", level = 1, rivals = [], at, char = {}, url = "http://127.0.0.1:8125/tiny-rex/", touch = false } = opts;
  const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=d3d11"] });
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  const page = await context.newPage();
  await page.routeWebSocket("**", (s) => s.close());
  await page.route(/googleapis|firebaseapp|gstatic/, (r) => r.abort());
  const seed = { species, xp: xpForLevel(level), rivals, at, char };
  await page.addInitScript((seed) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.clear();
    localStorage.setItem("trex_profiles", JSON.stringify([{ id: "qa", name: "QA", avatar: "🦖", pin: null, created: 1, updated: 1 }]));
    localStorage.setItem("trex_settings", JSON.stringify({ sound: false, lastProfile: "qa" }));
    const c = { version: 2, id: "cqa", name: "Tester", species: seed.species, created: 1, updated: 1, rev: 1, xp: seed.xp, rivals: seed.rivals, ...seed.char };
    if (seed.at) c.snapshot = { position: { x: seed.at[0], y: seed.at[1] }, nest: "hollow", at: 1 };
    localStorage.setItem("trex_chars_v2_qa", JSON.stringify({ version: 2, active: "cqa", characters: { cqa: c }, trash: [], updated: 1 }));
  }, seed);
  page.on("console", (m) => m.type() === "error" && console.log("console error:", m.text().slice(0, 240)));
  page.on("pageerror", (e) => console.log("page error:", String(e).slice(0, 300)));
  await page.goto(url);
  await page.getByRole("button", { name: /Continue as Tester/ }).click({ timeout: 60000 });
  await page.waitForFunction(() => window.adventureDiagnostics?.()?.ready, undefined, { timeout: 90000 });
  return { browser, page, scene: () => page.evaluate(() => window.adventureDiagnostics()) };
}
export const sim = (page, fn, arg) => page.evaluate(`(() => { const s = window.__rex.game.scene.getScene("Adventure"); return (${fn.toString()})(s.sim, s, ${JSON.stringify(arg ?? null)}); })()`);
