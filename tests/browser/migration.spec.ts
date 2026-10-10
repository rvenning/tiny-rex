import { test, expect } from "@playwright/test";
import { isolate, reviewProfile } from "./helpers";
test("a legacy single-save adventure becomes characters without losing growth, discoveries or the old record", async ({
  page,
}) => {
  await isolate(page, null, false);
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
  await page.getByRole("button", { name: /Continue as/ }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).adventureDiagnostics()?.ready ?? false,
      ),
    )
    .toBe(true);
  await expect(page.locator(".hud-card .name")).toContainText("Juvenile");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const book = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem("trex_chars_v2_" + id)!),
    reviewProfile.id,
  );
  const rex = book.characters["c_legacy_rex"], raptor = book.characters["c_legacy_raptor"];
  expect(rex.species).toBe("rex");
  expect(rex.xp).toBeGreaterThan(300);
  expect(raptor.species).toBe("raptor");
  expect(rex.discoveries).toContain("fossil-hollow-0");
  expect(rex.snapshot.position.x).toBeLessThan(66);
  expect(rex.snapshot.position.y).toBeLessThan(66);
  // the original record is never rewritten or deleted
  const legacy = await page.evaluate((id) => JSON.parse(localStorage.getItem("trex_adventure_v1_" + id)!), reviewProfile.id);
  expect(legacy.xp.rex).toBe(100);
});
