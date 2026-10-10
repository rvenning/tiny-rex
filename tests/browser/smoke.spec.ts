import { test, expect } from "@playwright/test";
import { isolate, reviewProfile } from "./helpers";
test("a new player hatches a named dinosaur of a permanent species and starts the adventure", async ({
  page,
}) => {
  await isolate(page);
  await page.goto("./");
  await page.getByRole("button", { name: "Choose a player" }).click();
  await page.getByRole("button", { name: /New player/ }).click();
  await page.getByLabel("Your name").fill("New explorer");
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Hatch a dinosaur" })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Zippy");
  await page.locator("input[value=raptor]").check({ force: true });
  await page.getByRole("button", { name: "Hatch →" }).click();
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
  const made = profiles.find((p: any) => p.name === "New explorer");
  const book = await page.evaluate((id) => JSON.parse(localStorage.getItem("trex_chars_v2_" + id)!), made.id);
  const chars = Object.values(book.characters) as any[];
  expect(chars).toHaveLength(1);
  expect(chars[0].name).toBe("Zippy");
  expect(chars[0].species).toBe("raptor");
  await expect(page.locator(".hud-card .name")).toContainText("Hatchling");
  await expect(
    page.getByRole("button", { name: /Endless Feast|Classic/ }),
  ).toHaveCount(0);
});
