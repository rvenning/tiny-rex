import { test, expect } from "@playwright/test";
import { isolate, reviewProfile } from "./helpers";
test("a new profile starts the adventure directly without a classic mode", async ({
  page,
}) => {
  await isolate(page);
  await page.goto("./");
  await page.getByRole("button", { name: "Choose a player" }).click();
  await page.getByRole("button", { name: /New hatchling/ }).click();
  await page.getByLabel("Your name").fill("New explorer");
  await page.getByRole("button", { name: /Start my adventure/ }).click();
  await expect(page.locator(".hud")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).adventureDiagnostics()?.ready ?? false,
      ),
    )
    .toBe(true);
  const profiles = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("trex_profiles")!),
  );
  expect(profiles.map((p: any) => p.name)).toContain("New explorer");
  expect(profiles.map((p: any) => p.id)).toContain(reviewProfile.id);
  await expect(
    page.getByRole("button", { name: /Endless Feast|Classic/ }),
  ).toHaveCount(0);
});
