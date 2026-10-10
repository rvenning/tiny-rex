import { test, expect } from "@playwright/test";
import { isolate, start } from "./helpers";
test("action pointer cancellation releases a held bite and Escape pauses", async ({
  page,
}) => {
  await isolate(page);
  await start(page);
  const bite = page.getByRole("button", { name: "Attack", exact: true });
  // Use the real pointer lifecycle; cancellation must clear the held state.
  const box = (await bite.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await bite.dispatchEvent("pointercancel", {
    pointerId: 1,
    pointerType: "mouse",
    bubbles: true,
  });
  await page.mouse.up();
  await expect(bite).not.toHaveClass(/down/);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Take a breather." }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".modal-backdrop")).toHaveCount(0);
  // ScenePlugin.resume queues until the next frame, after the dialog closes.
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__rex.game.scene.isActive("Adventure"),
      ),
    )
    .toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(
    page.getByRole("heading", { name: "Take a breather." }),
  ).toBeVisible();
});

test("touch movement retains its finger while actions and a second finger are used", async ({
  page,
}) => {
  await isolate(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await start(page);
  const dispatch = async (
    type: string,
    changed: { id: number; x: number; y: number }[],
    active: { id: number; x: number; y: number }[],
  ) => {
    await page.locator("#stage canvas").evaluate(
      (canvas, { type, changed, active }) => {
        const point = (p: { id: number; x: number; y: number }) => ({
          identifier: p.id,
          target: canvas,
          clientX: p.x,
          clientY: p.y,
          pageX: p.x + scrollX,
          pageY: p.y + scrollY,
          screenX: p.x,
          screenY: p.y,
        });
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperties(event, {
          changedTouches: { value: changed.map(point) },
          touches: { value: active.map(point) },
          targetTouches: { value: active.map(point) },
        });
        canvas.dispatchEvent(event);
      },
      { type, changed, active },
    );
  };
  const before = await page.evaluate(
    () => (window as any).adventureDiagnostics().position,
  );
  const first = { id: 7, x: 80, y: 520 },
    moved = { id: 7, x: 140, y: 520 };
  await dispatch("touchstart", [first], [first]);
  await dispatch("touchmove", [moved], [moved]);
  await expect
    .poll(async () => {
      const p = await page.evaluate(
        () => (window as any).adventureDiagnostics().position,
      );
      return Math.hypot(p.x - before.x, p.y - before.y);
    })
    .toBeGreaterThan(0.25);
  // Action controls keep working while the movement finger remains down.
  const bite = page.getByRole("button", { name: "Attack", exact: true });
  const box = (await bite.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(bite).toHaveClass(/down/);
  await page.mouse.up();
  const second = { id: 8, x: 800, y: 520 },
    secondMoved = { id: 8, x: 700, y: 520 };
  await dispatch("touchstart", [second], [moved, second]);
  await dispatch("touchmove", [secondMoved], [moved, secondMoved]);
  await dispatch("touchend", [secondMoved], [moved]);
  // Reverse the original finger along the route it just travelled. Keeping
  // its first direction indefinitely can run into a tree during slow CI runs.
  const reversed = { id: 7, x: 20, y: 520 };
  await dispatch("touchmove", [reversed], [reversed]);
  const p = await page.evaluate(
    () => (window as any).adventureDiagnostics().position,
  );
  await expect
    .poll(async () => {
      const q = await page.evaluate(
        () => (window as any).adventureDiagnostics().position,
      );
      return p.x - q.x;
    })
    .toBeGreaterThan(0.2);
  await dispatch("touchend", [reversed], []);
  const stopped = await page.evaluate(
    () => (window as any).adventureDiagnostics().position,
  );
  await page.waitForTimeout(250);
  const after = await page.evaluate(
    () => (window as any).adventureDiagnostics().position,
  );
  expect(after.x).toBeCloseTo(stopped.x, 2);
  expect(after.y).toBeCloseTo(stopped.y, 2);
});
