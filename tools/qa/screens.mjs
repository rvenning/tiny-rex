// node tools/qa/screens.mjs : character select / create / delete / HUD at phone, iPad portrait and iPad landscape sizes
import { chromium } from "@playwright/test";
const sizes = [["phone", 390, 844], ["ipad-p", 768, 1024], ["ipad-l", 1024, 768]];
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=d3d11"] });
try {
  for (const [name, w, h] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.routeWebSocket("**", (s) => s.close());
    await page.route(/googleapis|firebaseapp|gstatic/, (r) => r.abort());
    await page.addInitScript(() => {
      if (sessionStorage.getItem("s")) return; sessionStorage.setItem("s", "1"); localStorage.clear();
      localStorage.setItem("trex_profiles", JSON.stringify([{ id: "qa", name: "QA", avatar: "🦖", pin: null, created: 1, updated: 1 }]));
      localStorage.setItem("trex_settings", JSON.stringify({ sound: false, lastProfile: "qa" }));
      const mk = (id, name, species, xp) => ({ version: 2, id, name, species, created: 1, updated: 1 + xp, rev: 1, xp, elapsed: 5400 * (xp / 1000 + 1) });
      const chars = { a: mk("a", "Rexy", "rex", 2400), b: mk("b", "Zippy", "raptor", 300), c: mk("c", "Tops", "trike", 12000) };
      localStorage.setItem("trex_chars_v2_qa", JSON.stringify({ version: 2, active: "a", characters: chars, trash: [], updated: 1 }));
    });
    await page.goto("http://127.0.0.1:8125/tiny-rex/");
    await page.getByRole("button", { name: "Choose a player" }).click({ timeout: 60000 });
    await page.getByRole("button", { name: /QA/ }).click();
    await page.waitForSelector(".char-card");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `.scratch/screens-${name}-characters.png` });
    await page.getByRole("button", { name: /Hatch a new/ }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `.scratch/screens-${name}-create.png` });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Play →" }).first().click();
    await page.waitForFunction(() => window.adventureDiagnostics?.()?.ready, undefined, { timeout: 90000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `.scratch/screens-${name}-hud.png` });
    await ctx.close();
  }
} finally { await browser.close(); }
