import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route(/googleapis|firebaseapp|gstatic/, (r) => r.abort());
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem(
      "trex_profiles",
      JSON.stringify([
        {
          id: "review",
          name: "Review Rex",
          avatar: "🦖",
          pin: "1234",
          created: 1,
          updated: 1,
        },
      ]),
    );
    localStorage.setItem(
      "trex_settings",
      JSON.stringify({ sound: false, lastProfile: "review" }),
    );
  });
});
test("parent PIN restores access and keyboard release stops movement", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Keep going as Review Rex" }).click();
  await page.getByLabel("PIN", { exact: true }).fill("0000");
  await page.getByRole("button", { name: "Let’s go" }).click();
  await expect(page.getByRole("alert")).toContainText("doesn’t match");
  await page.getByLabel("PIN", { exact: true }).fill("7777");
  await page.getByRole("button", { name: "Let’s go" }).click();
  await page.getByRole("button", { name: "Start Endless Feast" }).click();
  await expect(page.locator("#stage")).toHaveAttribute("data-state", "playing");
  await page.locator("#stage").focus();
  await page.keyboard.down("a");
  await page.waitForTimeout(300);
  await page.keyboard.up("a");
  await page.waitForTimeout(100);
  const stopped = await page.evaluate(() => (window as any).rexDiagnostics());
  expect(
    Math.hypot(
      stopped.player.x - stopped.target.x,
      stopped.player.y - stopped.target.y,
    ),
  ).toBeLessThan(1);
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => (window as any).rexDiagnostics());
  expect(
    Math.hypot(
      stopped.player.x - after.player.x,
      stopped.player.y - after.player.y,
    ),
  ).toBeLessThan(1);
});
test("version endpoint remains JSON at the original public route", async ({
  request,
}) => {
  const response = await request.get("version.json");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ game: "tiny-rex", version: 6 });
});
test("offline navigation fallback covers the replacement root", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName === "webkit",
    "Playwright WebKit offline SW fetch limitation #42775; Chromium verifies production fallback.",
  );
  await page.goto("./");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.goto("./review-offline-route/");
  await expect(
    page.getByRole("button", { name: "Keep going as Review Rex" }),
  ).toBeVisible();
});
