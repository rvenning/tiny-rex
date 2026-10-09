import { test, expect } from "@playwright/test";
import { isolate, reviewProfile } from "./helpers";
test("legacy adventure migrates earned growth, species and fossils to a safe new-world refuge", async ({
  page,
}) => {
  await isolate(page);
  await page.goto("./");
  await page.evaluate(
    (id) =>
      localStorage.setItem(
        "trex_adventure_v1_" + id,
        JSON.stringify({
          version: 1,
          xp: { rex: 100, raptor: 15, trike: 0 },
          species: ["rex", "raptor"],
          discoveries: ["fossil-hollow-0"],
          regions: ["hollow"],
          nests: ["hollow"],
          rivals: [],
          studied: ["beetle"],
          snapshot: {
            dino: "rex",
            position: { x: 220, y: 480 },
            nest: "hollow",
            at: 1791530000000,
          },
          updated: 1791530000000,
        }),
      ),
    reviewProfile.id,
  );
  await page.getByRole("button", { name: /Continue as Adventure Rex/ }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).adventureDiagnostics()?.ready ?? false,
      ),
    )
    .toBe(true);
  await expect(page.locator(".hud-card .stage")).toContainText("Juvenile");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const save = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem("trex_adventure_v1_" + id)!),
    reviewProfile.id,
  );
  expect(save.world).toBe(2);
  expect(save.xp.rex).toBe(100);
  expect(save.xp.raptor).toBe(15);
  expect(save.species).toContain("raptor");
  expect(save.discoveries).toContain("fossil-hollow-0");
  expect(save.snapshot.position.x).toBeLessThan(66);
  expect(save.snapshot.position.y).toBeLessThan(66);
});
