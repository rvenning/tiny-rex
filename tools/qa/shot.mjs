// Isolated gameplay screenshot: node tools/qa/shot.mjs out.png [W H] [x,y] [url]
// Firebase/websocket traffic is blocked and storage is a throwaway profile: nothing touches the family account.
import { chromium } from "@playwright/test";
const [out = ".scratch/shot.png", W = "1448", H = "1086", at = "", url = "http://127.0.0.1:8125/tiny-rex/"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=d3d11"] });
try {
  const page = await browser.newPage({ viewport: { width: +W, height: +H } });
  await page.routeWebSocket("**", (s) => s.close());
  await page.route(/googleapis|firebaseapp|gstatic/, (r) => r.abort());
  await page.addInitScript(() => {
    if (sessionStorage.getItem("shot")) return;
    sessionStorage.setItem("shot", "1");
    localStorage.clear();
    localStorage.setItem("trex_profiles", JSON.stringify([{ id: "qa", name: "QA Rex", avatar: "🦖", pin: null, created: 1, updated: 1 }]));
    localStorage.setItem("trex_settings", JSON.stringify({ sound: false, lastProfile: "qa" }));
  });
  page.on("console", (m) => m.type() === "error" && console.log("console error:", m.text().slice(0, 200)));
  await page.goto(url);
  await page.getByRole("button", { name: /Continue as QA Rex/ }).click({ timeout: 60000 });
  await page.waitForFunction(() => window.adventureDiagnostics?.()?.ready, undefined, { timeout: 60000 });
  if (at) {
    const [x, y] = at.split(",").map(Number);
    await page.evaluate(([x, y]) => { const s = window.__rex.game.scene.getScene("Adventure"); s.sim.player.x = x; s.sim.player.y = y; s.snapCamera?.(); }, [x, y]);
  }
  if (process.env.XP) await page.evaluate((xp) => { const s = window.__rex.game.scene.getScene('Adventure'); s.sim.save.xp.rex = +xp; }, process.env.XP);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: out });
  console.log(JSON.stringify(await page.evaluate(() => window.adventureDiagnostics())).slice(0, 400));
} finally { await browser.close(); }
