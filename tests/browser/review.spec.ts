import { test, expect } from "@playwright/test";
import { isolate, position } from "./helpers";
test("PIN protection survives the rebuild and movement releases on pause", async ({
  page,
}) => {
  await isolate(page, "1234");
  await page.goto("./");
  await page.getByRole("button", { name: /Continue as Adventure Rex/ }).click();
  await page.getByLabel("PIN", { exact: true }).fill("0000");
  await page.getByRole("button", { name: /Let’s go/ }).click();
  await expect(page.getByRole("alert")).toContainText("doesn’t match");
  await page.getByLabel("PIN", { exact: true }).fill("1234");
  await page.getByRole("button", { name: /Let’s go/ }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).adventureDiagnostics()?.ready ?? false,
      ),
    )
    .toBe(true);
  await page.keyboard.down("d");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const p = await position(page);
  await page.keyboard.up("d");
  await page.getByRole("button", { name: /Continue exploring/ }).click();
  await page.waitForTimeout(200);
  expect(await position(page)).toEqual(p);
});
