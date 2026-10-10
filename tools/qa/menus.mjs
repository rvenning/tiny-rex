// node tools/qa/menus.mjs [W H] : screenshots of every menu with a stocked character (isolated profile).
import { openGame } from "./lib.mjs";
const [W = "1448", H = "1086"] = process.argv.slice(2);
const species = process.env.SPECIES || "rex";
const { browser, page } = await openGame({ w: +W, h: +H, species, level: +(process.env.LEVEL || 14), rivals: ["river-hunter"] });
const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `.scratch/menu-${name}.png` }); };
try {
  await page.evaluate(() => {
    const s = window.__rex.game.scene.getScene("Adventure"), sim = s.sim;
    const rar = ["common", "rare", "rare", "epic", "epic", "legendary", "common", "rare", "epic", "rare"];
    rar.forEach((r) => sim.giveLoot({ rarity: r }));
    for (const slot of ["jaws", "hide", "legs"]) { const m = sim.save.bag.find((x) => x.slot === slot && x.rarity !== "legendary"); if (m) sim.equip(m.id); }
    sim.save.amber = 240; sim.rank(sim.save.skills ? "rex.p.heavy" : ""); 
    sim.quests.start("missing-hatchlings");
  });
  const open = (menu) => page.evaluate((menu) => { const s = window.__rex.game.scene.getScene("Adventure"); s.requestPause(); window.dispatchEvent(new CustomEvent("rex-adventure-menu", { detail: { menu } })); }, menu);
  await open("pack"); await shot("pack");
  await page.locator(".item").first().click(); await shot("pack-detail");
  await page.evaluate(() => document.querySelector('[data-action="adventure-resume"]').click());
  await open("skills"); await shot("skills");
  await page.getByRole("tab", { name: /Active skills/ }).click(); await shot("skills-loadout");
  await page.evaluate(() => document.querySelector('[data-action="adventure-resume"]').click());
  await open("journal"); await shot("journal");
  await page.getByRole("tab", { name: /Map/ }).click(); await shot("journal-map");
  await page.evaluate(() => document.querySelector('[data-action="adventure-resume"]').click());
  await page.evaluate(() => { const s = window.__rex.game.scene.getScene("Adventure"); s.requestPause(); });
  await shot("pause");
  await page.evaluate(() => document.querySelector('[data-action="adventure-resume"]').click());
  // dialogue with Mossback
  await page.evaluate(() => { const s = window.__rex.game.scene.getScene("Adventure"), sim = s.sim; const m = sim.actors.find((a) => a.npc === "mossback"); sim.player.x = m.x - 1.7; sim.player.y = m.y; });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const s = window.__rex.game.scene.getScene("Adventure"); s.interactNow(); });
  await shot("dialogue");
  await page.getByRole("button", { name: /Next|help|Goodbye/ }).click(); await shot("dialogue2");
  console.log("ok");
} finally { await browser.close(); }
