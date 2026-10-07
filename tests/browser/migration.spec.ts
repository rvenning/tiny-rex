import { test, expect } from "@playwright/test";
test("root upgrade retires only Tiny Rex's legacy cache and preserves saves", async ({
  page,
}) => {
  await page.route(/googleapis|firebaseapp|gstatic/, (r) => r.abort());
  await page.goto("./");
  await page.evaluate(async () => {
    await caches.open("tiny-rex-v5");
    await caches.open("another-family-game-v8");
    localStorage.setItem("trex_settings", JSON.stringify({ sound: false }));
    for (const reg of await navigator.serviceWorker.getRegistrations())
      await reg.unregister();
  });
  await page.reload();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(async () => !(await caches.keys()).includes("tiny-rex-v5")),
    )
    .toBe(true);
  expect(
    await page.evaluate(async () =>
      (await caches.keys()).includes("another-family-game-v8"),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("trex_settings")!).sound,
    ),
  ).toBe(false);
});
