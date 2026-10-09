// node tools/qa/splash.mjs out.png [W H]  -- title screen with a throwaway profile (no cloud)
import { chromium } from "@playwright/test";
const [out = ".scratch/splash.png", W = "1366", H = "1024"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=d3d11"] });
try {
  const page = await browser.newPage({ viewport: { width: +W, height: +H } });
  await page.routeWebSocket("**", (s) => s.close());
  await page.route(/googleapis|firebaseapp|gstatic/, (r) => r.abort());
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("trex_profiles", JSON.stringify([{ id: "qa", name: "QA Rex", avatar: "🦖", pin: null, created: 1, updated: 1 }]));
    localStorage.setItem("trex_settings", JSON.stringify({ sound: false, lastProfile: "qa" }));
  });
  await page.goto("http://127.0.0.1:8125/tiny-rex/");
  await page.getByRole("button", { name: /Continue as QA Rex/ }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: out });
} finally { await browser.close(); }
