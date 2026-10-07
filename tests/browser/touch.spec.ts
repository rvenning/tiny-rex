import { test, expect } from "@playwright/test";
test("a second finger cannot steal movement and cancellation releases ownership", async ({
  page,
}) => {
  await page.route(/googleapis|firebaseapp|gstatic/, (r) => r.abort());
  await page.goto("./");
  await page.getByRole("button", { name: "Start hatching" }).click();
  await page.getByRole("button", { name: "New hatchling" }).click();
  await page.getByLabel("Your name").fill("Touch Rex");
  await page.getByRole("button", { name: "Start my adventure" }).click();
  await page.getByRole("button", { name: "Start Endless Feast" }).click();
  await expect(page.locator("#stage")).toHaveAttribute("data-state", "playing");
  const dispatch = async (
    type: string,
    changed: { id: number; x: number; y: number }[],
    active: { id: number; x: number; y: number }[],
  ) => {
    await page.locator("#stage canvas").evaluate(
      (canvas, { type, changed, active }) => {
        const box = canvas.getBoundingClientRect();
        const point = (p: { id: number; x: number; y: number }) => ({
          identifier: p.id,
          target: canvas,
          clientX: box.x + ((p.x + 30) / 420) * box.width,
          clientY: box.y + ((p.y + 125) / 740) * box.height,
          pageX: box.x + ((p.x + 30) / 420) * box.width,
          pageY: box.y + ((p.y + 125) / 740) * box.height,
        });
        // DOM events travel through Phaser's real TouchManager, not through game state.
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperties(event, {
          changedTouches: { value: changed.map(point) },
          touches: { value: active.map(point) },
        });
        canvas.dispatchEvent(event);
      },
      { type, changed, active },
    );
  };
  const first = { id: 7, x: 60, y: 100 },
    second = { id: 8, x: 300, y: 450 };
  await dispatch("touchstart", [first], [first]);
  await expect
    .poll(() => page.evaluate(() => (window as any).rexDiagnostics().target.x))
    .toBeCloseTo(60, 0);
  await dispatch("touchstart", [second], [first, second]);
  await expect
    .poll(() => page.evaluate(() => (window as any).rexDiagnostics().target.x))
    .toBeCloseTo(60, 0);
  const moved = { ...first, x: 90, y: 130 };
  await dispatch("touchmove", [moved], [moved, second]);
  await expect
    .poll(() => page.evaluate(() => (window as any).rexDiagnostics().target.x))
    .toBeCloseTo(90, 0);
  await dispatch("touchcancel", [moved], [second]);
  await dispatch("touchend", [second], []);
  const next = { id: 9, x: 200, y: 300 };
  await dispatch("touchstart", [next], [next]);
  await expect
    .poll(() => page.evaluate(() => (window as any).rexDiagnostics().target.x))
    .toBeCloseTo(200, 0);
  await dispatch("touchend", [next], []);
});
