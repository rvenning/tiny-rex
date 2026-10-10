// node tools/qa/fight.mjs : stage a brawl and capture telegraphs, damage numbers, bars, loot. env SPECIES LEVEL
import { openGame } from "./lib.mjs";
const species = process.env.SPECIES || "rex";
const { browser, page } = await openGame({ w: 1448, h: 1086, species, level: +(process.env.LEVEL || 6), at: [27, 35] });
try {
  await page.evaluate(() => {
    const scene = window.__rex.game.scene.getScene("Adventure"), s = scene.sim, p = s.player;
    s.actors = s.actors.filter((a) => a.npc);
    const mk = (id, dx, dy, lvl) => { const a = s.addActor(id, { x: p.x + dx, y: p.y + dy }, { exact: true, level: lvl }); a.state = "stalk"; a.provoked = 60; a.t = 0; a.cooldown = 0.2; return a; };
    mk("raptor", 4, 1, 5); mk("dilo", 8, -2, 6); mk("compy-raider", 5, 3, 3); mk("compy-raider", 6, -3, 3); mk("kentro", -5, 4, 6);
    s.save.worn = {};
  });
  await page.locator("#stage").focus();
  const shot = async (n) => { await page.screenshot({ path: `.scratch/fight-${n}.png` }); };
  await page.keyboard.down("j");
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(700); if (i % 2 === 1) await page.keyboard.press("Space"); if (i === 2) await shot("1"); if (i === 4) await shot("2"); }
  await page.keyboard.up("j");
  console.log(JSON.stringify(await page.evaluate(() => { const s = window.__rex.game.scene.getScene("Adventure").sim; return { hp: Math.round(s.player.hp), max: s.d.maxHp, xp: s.save.xp, kills: s.save.stats.kills, drops: s.drops.length, alive: s.actors.filter((a) => a.state !== "dead" && !a.npc).length, ev: s.save.stats }; })));
  await page.waitForTimeout(500); await shot("3");
} finally { await browser.close(); }
