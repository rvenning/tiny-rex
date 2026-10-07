import { test, expect, type Page } from "@playwright/test";
async function hatch(page: Page) {
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "Start hatching" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start hatching" }).click();
  await page.getByRole("button", { name: "New hatchling" }).click();
  await page.getByLabel("Your name").fill("Test Rex");
  await page.getByRole("button", { name: "Start my adventure" }).click();
  await expect(
    page.getByRole("heading", { name: "Test Rex’s feast", exact: false }),
  ).toBeVisible();
}
async function hunt(page: Page) {
  await page.getByRole("button", { name: "Start Endless Feast" }).click();
  await expect(page.locator("#stage")).toHaveAttribute("data-state", "playing");
}

test.beforeEach(async ({ page }) => {
  await page.route(/googleapis|firebaseapp|gstatic/, (route) => route.abort());
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("test-started")) {
      localStorage.clear();
      sessionStorage.setItem("test-started", "yes");
    }
  });
});
test("loads real Phaser 4 and starts, pauses, resumes, restarts and quits", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await hatch(page);
  await hunt(page);
  await expect(page.locator("#stage canvas")).toBeVisible();
  await page.waitForTimeout(700);
  expect(
    await page.evaluate(() => (window as any).rexDiagnostics().phaser),
  ).toMatch(/^4\./);
  await page.getByRole("button", { name: "Pause", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Your valley can wait." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).rexDiagnostics().paused),
  ).toBe(true);
  await page.getByRole("button", { name: "Keep feasting" }).click();
  await expect(
    page.getByRole("heading", { name: "Your valley can wait." }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: false }).click();
  await page.getByRole("button", { name: "Start a fresh feast" }).click();
  await expect(page.locator("#stage")).toHaveAttribute("data-score", "0");
  await page.getByRole("button", { name: "Pause", exact: false }).click();
  await page
    .getByRole("button", { name: "Back to feast", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Test Rex’s feast", exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("endless feast is immediately playable and real pointer input earns food", async ({
  page,
}) => {
  await hatch(page);
  await expect(page.getByRole("button", { name: /Hunt 1/ })).toHaveCount(0);
  await hunt(page);
  const box = (await page.locator("#stage canvas").boundingBox())!;
  for (let step = 0; step < 30; step++) {
    const d = await page.evaluate(() => (window as any).rexDiagnostics());
    if (
      d.player &&
      Number(await page.locator("#stage").getAttribute("data-score")) > 0
    )
      break;
    const target = d.entities
      .filter((e: any) => e.plant)
      .sort(
        (a: any, b: any) =>
          Math.hypot(a.x - d.player.x, a.y - d.player.y) -
          Math.hypot(b.x - d.player.x, b.y - d.player.y),
      )[0];
    if (target)
      await page.mouse.click(
        box.x + ((target.x + 30) / 420) * box.width,
        box.y + ((target.y + 125) / 740) * box.height,
      );
    await page.waitForTimeout(300);
  }
  await expect
    .poll(async () =>
      Number(await page.locator("#stage").getAttribute("data-score")),
    )
    .toBeGreaterThan(0);
  const runScore = Number(
    await page.locator("#stage").getAttribute("data-score"),
  );
  await page.getByRole("button", { name: /Pause/ }).click();
  await page.getByRole("button", { name: "Start a fresh feast" }).click();
  const saved = await page.evaluate(() => {
    const profile = JSON.parse(localStorage.getItem("trex_profiles")!)[0];
    return JSON.parse(localStorage.getItem("trex_progress_" + profile.id)!);
  });
  expect(saved.feastBest).toBeGreaterThanOrEqual(runScore);
  expect(saved.catches).toBeGreaterThan(0);
  expect(Object.keys(saved.met).length).toBeGreaterThan(0);
  await page.getByRole("button", { name: /Pause/ }).click();
  await page
    .getByRole("button", { name: "Back to feast", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start Endless Feast" }),
  ).toBeEnabled();
});
test("preferences and legacy saves survive reload", async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => {
    localStorage.setItem(
      "trex_profiles",
      JSON.stringify([
        {
          id: "legacy",
          name: "Legacy Rex",
          avatar: "🦖",
          pin: null,
          created: 1,
          updated: 1,
        },
      ]),
    );
    localStorage.setItem(
      "trex_settings",
      JSON.stringify({ sound: false, lastProfile: "legacy" }),
    );
    localStorage.setItem(
      "trex_progress_legacy",
      JSON.stringify({
        levels: { 0: { stars: 3, best: 900 } },
        met: { fern: 1 },
        feastBest: 20,
        feastTier: 1,
        catches: 5,
        updated: 1,
      }),
    );
  });
  // Clear-on-new-document script is removed by using a second page in this context.
  await page.reload();
  await page.getByRole("button", { name: "Keep going as Legacy Rex" }).click();
  await expect(
    page.getByRole("heading", { name: "Legacy Rex’s feast", exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Personal best 20", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("trex_progress_legacy")!).levels[0]
          .stars,
    ),
  ).toBe(3);
  await page.getByRole("button", { name: "Sound off", exact: false }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sound on", exact: false }),
  ).toBeVisible();
});
test("book, leaderboard and immediately available feast follow saved progress", async ({
  page,
}) => {
  await hatch(page);
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("trex_profiles")!)[0];
    localStorage.setItem(
      "trex_progress_" + p.id,
      JSON.stringify({
        levels: Object.fromEntries(
          [0, 1, 2, 3, 4].map((i) => [i, { stars: 3, best: 900 }]),
        ),
        met: { fern: 1, compy: 1 },
        feastBest: 20,
        feastTier: 1,
        catches: 5,
        updated: 1,
      }),
    );
  });
  await page.getByRole("button", { name: "Dino Book", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Compsognathus" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Family", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Test Rex", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Feast", exact: true }).click();
  await page.getByRole("button", { name: "Start Endless Feast" }).click();
  await expect(page.locator("#stage")).toHaveAttribute("data-state", "playing");
});
for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
])
  test(`fits ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await hatch(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await hunt(page);
    const box = (await page.locator("#stage canvas").boundingBox())!;
    expect(box.width).toBeGreaterThan(150);
    expect(box.height).toBeLessThanOrEqual(viewport.height + 1);
    await page.screenshot({
      path: `test-results/${test.info().project.name}-${viewport.width}x${viewport.height}.png`,
    });
  });
test("production PWA controls the page and caches its shell", async ({
  page,
}) => {
  await page.goto("./");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  expect(
    await page.evaluate(async () => {
      const keys = await caches.keys();
      const cache = await caches.open(
        keys.find((k) => k.includes("workbox-precache"))!,
      );
      return (await cache.keys()).length;
    }),
  ).toBeGreaterThan(10);
});
test("production PWA reloads and plays offline", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName === "webkit",
    "Playwright WebKit offline SW navigation bug: microsoft/playwright#42775. Registration/cache checks still run in WebKit.",
  );
  await hatch(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "Keep going as Test Rex" }).click();
  await hunt(page);
  await expect(page.locator("#stage canvas")).toBeVisible();
  await context.setOffline(false);
});
