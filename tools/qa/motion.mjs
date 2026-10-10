// node tools/qa/motion.mjs [x,y] : two frames 700ms apart + pixel-difference, proves the world is moving
import { chromium } from "@playwright/test";
const at = process.argv[2] || "";
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=d3d11"] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 1024 } });
  await page.routeWebSocket("**", (s) => s.close());
  await page.route(/googleapis|firebaseapp|gstatic/, (r) => r.abort());
  await page.addInitScript(() => { if (sessionStorage.getItem("s")) return; sessionStorage.setItem("s", "1"); localStorage.clear();
    localStorage.setItem("trex_profiles", JSON.stringify([{ id: "qa", name: "QA Rex", avatar: "x", pin: null, created: 1, updated: 1 }]));
    localStorage.setItem("trex_settings", JSON.stringify({ sound: false, lastProfile: "qa" })); });
  await page.goto("http://127.0.0.1:8125/tiny-rex/");
  await page.getByRole("button", { name: /Continue as QA Rex/ }).click({ timeout: 60000 });
  await page.waitForFunction(() => window.adventureDiagnostics?.()?.ready, undefined, { timeout: 60000 });
  if (at) { const [x, y] = at.split(",").map(Number); await page.evaluate(([x, y]) => { const s = window.__rex.game.scene.getScene("Adventure"); s.sim.player.x = x; s.sim.player.y = y; s.snapCamera(); }, [x, y]); }
  await page.waitForTimeout(3000);
  const a = await page.screenshot({ path: ".scratch/m1.png" });
  await page.waitForTimeout(700);
  const b = await page.screenshot({ path: ".scratch/m2.png" });
  const diff = await page.evaluate(async ([a, b]) => {
    const load = (d) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + d; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const c = document.createElement("canvas"); c.width = ia.width; c.height = ia.height; const x = c.getContext("2d");
    x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data; x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i+1] - db[i+1]) > 24) n++;
    return { changedPixels: n, pct: +(100 * n / (da.length / 4)).toFixed(2) };
  }, [a.toString("base64"), b.toString("base64")]);
  console.log(JSON.stringify(diff), JSON.stringify(await page.evaluate(() => ({ props: window.adventureDiagnostics().propsLive, fx: window.adventureDiagnostics().fx }))));
} finally { await browser.close(); }
