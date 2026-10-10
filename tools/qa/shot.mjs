// Isolated gameplay screenshot: node tools/qa/shot.mjs out.png [W H] [x,y]   env: SPECIES, LEVEL, WAIT, SCRIPT(js run with (sim, scene))
import { openGame, sim } from "./lib.mjs";
const [out = ".scratch/shot.png", W = "1448", H = "1086", at = ""] = process.argv.slice(2);
const pos = at ? at.split(",").map(Number) : undefined;
const { browser, page } = await openGame({ w: +W, h: +H, species: process.env.SPECIES || "rex", level: +(process.env.LEVEL || 1), at: pos });
try {
  if (process.env.SCRIPT) await page.evaluate(`(() => { const scene = window.__rex.game.scene.getScene("Adventure"); const sim = scene.sim; ${process.env.SCRIPT} })()`);
  await page.waitForTimeout(+(process.env.WAIT || 3000));
  await page.screenshot({ path: out });
  console.log(JSON.stringify(await page.evaluate(() => { const d = window.adventureDiagnostics(); delete d.save; return d; })).slice(0, 420));
} finally { await browser.close(); }
void sim;
