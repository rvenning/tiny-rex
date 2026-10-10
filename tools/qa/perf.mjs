// node tools/qa/perf.mjs [W H] : desktop frame-time sample (headless Chrome; NOT an iPad result). env: FIGHT=1 spawns a brawl.
import { openGame } from "./lib.mjs";
const [W = "1366", H = "1024"] = process.argv.slice(2);
const { browser, page } = await openGame({ w: +W, h: +H, level: +(process.env.LEVEL || 6) });
try {
  if (process.env.FIGHT) await page.evaluate(() => { const s = window.__rex.game.scene.getScene("Adventure").sim; const p = s.player; for (let i = 0; i < 10; i++) { const a = s.addActor(i % 3 === 0 ? "dilo" : "compy-raider", { x: p.x + 6 + (i % 5), y: p.y + (i - 5) * 0.8 }, { exact: true, level: 5 }); if (a) { a.state = "stalk"; a.provoked = 30; } } });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => new Promise((res) => { const f = []; let last = performance.now(); const t0 = last; const loop = (t) => { f.push(t - last); last = t; if (t - t0 < 4000) requestAnimationFrame(loop); else { f.shift(); f.sort((a, b) => a - b); res({ frames: f.length, medianMs: +f[f.length >> 1].toFixed(1), p95Ms: +f[Math.floor(f.length * 0.95)].toFixed(1), maxMs: +f[f.length - 1].toFixed(1) }); } }; requestAnimationFrame(loop); }));
  console.log(JSON.stringify(r), JSON.stringify(await page.evaluate(() => { const d = window.adventureDiagnostics(); return { actors: d.actors, views: d.views, propsLive: d.propsLive, fx: d.fx }; })));
} finally { await browser.close(); }
