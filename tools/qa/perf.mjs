// node tools/qa/perf.mjs [W H] : desktop frame-time sample (headless Chrome; NOT an iPad result)
import { chromium } from "@playwright/test";
const [W = "1366", H = "1024"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=d3d11"] });
try {
  const page = await browser.newPage({ viewport: { width: +W, height: +H } });
  await page.routeWebSocket("**", (s) => s.close());
  await page.route(/googleapis|firebaseapp|gstatic/, (r) => r.abort());
  await page.addInitScript(() => { if (sessionStorage.getItem("s")) return; sessionStorage.setItem("s", "1"); localStorage.clear();
    localStorage.setItem("trex_profiles", JSON.stringify([{ id: "qa", name: "QA", avatar: "x", pin: null, created: 1, updated: 1 }]));
    localStorage.setItem("trex_settings", JSON.stringify({ sound: false, lastProfile: "qa" })); });
  await page.goto("http://127.0.0.1:8125/tiny-rex/");
  await page.getByRole("button", { name: /Continue as QA/ }).click({ timeout: 60000 });
  await page.waitForFunction(() => window.adventureDiagnostics?.()?.ready, undefined, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => new Promise((res) => { const f = []; let last = performance.now(); const t0 = last; const loop = (t) => { f.push(t - last); last = t; if (t - t0 < 4000) requestAnimationFrame(loop); else { f.shift(); f.sort((a, b) => a - b); res({ frames: f.length, medianMs: +f[f.length >> 1].toFixed(1), p95Ms: +f[Math.floor(f.length * 0.95)].toFixed(1), maxMs: +f[f.length - 1].toFixed(1) }); } }; requestAnimationFrame(loop); }));
  console.log(JSON.stringify(r), JSON.stringify(await page.evaluate(() => { const d = window.adventureDiagnostics(); return { propsLive: d.propsLive, fx: d.fx, tiles: d.tiles }; })));
} finally { await browser.close(); }
