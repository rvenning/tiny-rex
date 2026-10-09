import { test, expect } from "@playwright/test";
import {
  isolate,
  start,
  position,
  reviewProfile,
  terrainVisible,
} from "./helpers";
test.beforeEach(async ({ page }) => isolate(page));
test("keyboard movement, pause, journal and reload preserve adventure and old saves", async ({
  page,
}) => {
  await start(page);
  const before = await position(page);
  await page.keyboard.down("d");
  await expect
    .poll(async () => {
      const p = await position(page);
      return Math.hypot(p.x - before.x, p.y - before.y);
    })
    .toBeGreaterThan(0.3);
  await page.keyboard.up("d");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await position(page);
  await page.keyboard.press("d");
  await page.waitForTimeout(200);
  expect(await position(page)).toEqual(paused);
  await page.getByRole("button", { name: "Map & creature book" }).click();
  await expect(page.getByRole("img", { name: /World map/ })).toBeVisible();
  await expect(page.getByText(/Triceratops: find Ancient ribs/)).toBeVisible();
  await page.getByRole("button", { name: /Continue exploring/ }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Save & return home" }).click();
  const saved = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem("trex_adventure_v1_" + id)!),
    reviewProfile.id,
  );
  expect(saved.snapshot.position.x).toBeCloseTo(paused.x, 2);
  const old = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem("trex_progress_" + id)!),
    reviewProfile.id,
  );
  expect(old.feastBest).toBe(500);
  expect(old.levels[0].stars).toBe(3);
  await start(page);
  const restored = await position(page);
  expect(restored.x).toBeCloseTo(saved.snapshot.position.x, 2);
  expect(restored.y).toBeCloseTo(saved.snapshot.position.y, 2);
  await expect(
    page.getByRole("button", { name: /Endless Feast|Classic/ }),
  ).toHaveCount(0);
});
for (const v of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
]) {
  test(`HUD and journal fit ${v.width} x ${v.height}`, async ({ page }) => {
    await page.setViewportSize(v);
    await start(page);
    await terrainVisible(page);
    const rectangles = await page
      .locator(".hud button:visible:not(:disabled)")
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const r = button.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
      );
    for (const r of rectangles) {
      expect(r.width).toBeGreaterThanOrEqual(48);
      expect(r.height).toBeGreaterThanOrEqual(48);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(v.width + 1);
      expect(r.y + r.height).toBeLessThanOrEqual(v.height + 1);
    }
    await page.screenshot({ path: test.info().outputPath("gameplay.png") });
    await page.getByRole("button", { name: "Map and creature book" }).click();
    await expect(page.locator(".modal")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: test.info().outputPath("journal.png") });
  });
}
