import { test, expect } from "@playwright/test";
import { freshAdventure } from "../../src/adventure/save";
import { writeFile } from "node:fs/promises";
const profile = {
  id: "adventure-review",
  name: "Adventure Rex",
  avatar: "🦖",
  pin: null,
  created: 1,
  updated: 1,
};

test("world produces real rendered pixels after changing canvas size", async ({
  page,
}) => {
  // Test-only readback. Windows WebKit's composited screenshots can omit a
  // resized WebGL canvas: https://github.com/microsoft/playwright/issues/42885
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      options?: any,
    ) {
      return (original as any).call(
        this,
        type,
        type.startsWith("webgl")
          ? { ...options, preserveDrawingBuffer: true }
          : options,
      );
    } as any;
  });
  await start(page);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas =
          document.querySelector<HTMLCanvasElement>("#stage canvas")!;
        const gl = (canvas.getContext("webgl2") ||
          canvas.getContext("webgl")) as WebGLRenderingContext;
        const colors = new Set<string>();
        const pixel = new Uint8Array(4);
        for (let x = 0.2; x < 0.8; x += 0.1)
          for (let y = 0.2; y < 0.8; y += 0.1) {
            gl.readPixels(
              Math.floor(canvas.width * x),
              Math.floor(canvas.height * y),
              1,
              1,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              pixel,
            );
            if (pixel[3] > 0) colors.add(`${pixel[0]},${pixel[1]},${pixel[2]}`);
          }
        return colors.size;
      }),
    )
    .toBeGreaterThan(8);
  const png = await page.evaluate(
    () =>
      document
        .querySelector<HTMLCanvasElement>("#stage canvas")!
        .toDataURL()
        .split(",")[1],
  );
  await writeFile(
    test.info().outputPath("gpu-buffer.png"),
    Buffer.from(png, "base64"),
  );
});
test.beforeEach(async ({ page }) => {
  await page.route(/googleapis|firebaseapp|gstatic/, (r) => r.abort());
  await page.addInitScript((p) => {
    if (!sessionStorage.getItem("adventure-test")) {
      localStorage.clear();
      sessionStorage.setItem("adventure-test", "yes");
      localStorage.setItem("trex_profiles", JSON.stringify([p]));
      localStorage.setItem(
        "trex_settings",
        JSON.stringify({ sound: false, lastProfile: p.id }),
      );
      localStorage.setItem(
        "trex_progress_" + p.id,
        JSON.stringify({
          levels: { 0: { stars: 3, best: 900 } },
          met: { compy: 1 },
          feastBest: 500,
          feastTier: 3,
          catches: 12,
          updated: 1,
        }),
      );
    }
  }, profile);
});
async function start(page: any) {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Keep going as Adventure Rex" })
    .click();
  await page
    .getByRole("button", { name: /Begin the adventure|Continue adventure/ })
    .click();
  await expect(page.locator(".adventure-overlay")).toBeVisible();
}
test("real keyboard movement, dodge, journal, save/reload and classic mode coexist", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    // WebKit surfaces our deliberately blocked Firebase request as a page error.
    if (!e.message.includes("firestore.googleapis.com")) errors.push(e.message);
  });
  await start(page);
  const before = await page.evaluate(() =>
    (window as any).adventureDiagnostics(),
  );
  await page.keyboard.down("d");
  await expect
    .poll(
      async () => {
        const p = await page.evaluate(
          () => (window as any).adventureDiagnostics().position,
        );
        return Math.hypot(p.x - before.position.x, p.y - before.position.y);
      },
      { timeout: 10000 },
    )
    .toBeGreaterThan(40);
  await page.keyboard.up("d");
  const moved = await page.evaluate(() =>
    (window as any).adventureDiagnostics(),
  );
  expect(
    Math.hypot(
      moved.position.x - before.position.x,
      moved.position.y - before.position.y,
    ),
  ).toBeGreaterThan(15);
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Open adventure map" }).click();
  await expect(page.locator(".adventure-world-map")).toBeVisible();
  await page.getByRole("button", { name: "Continue exploring" }).click();
  await page
    .getByRole("button", { name: "Pause adventure", exact: true })
    .click();
  await page.getByRole("button", { name: "Save & return home" }).click();
  await expect(
    page.getByRole("button", { name: "Continue adventure" }),
  ).toBeVisible();
  const saved = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem("trex_adventure_v1_" + id)!),
    profile.id,
  );
  const legacy = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem("trex_progress_" + id)!),
    profile.id,
  );
  expect(legacy.feastBest).toBe(500);
  expect(legacy.levels[0].stars).toBe(3);
  await page.reload();
  await page
    .getByRole("button", { name: "Keep going as Adventure Rex" })
    .click();
  await page.getByRole("button", { name: "Continue adventure" }).click();
  const restored = await page.evaluate(() =>
    (window as any).adventureDiagnostics(),
  );
  // The dodge after the movement sample changes position before saving.
  expect(restored.position.x).toBeCloseTo(saved.snapshot.position.x, 3);
  expect(restored.position.y).toBeCloseTo(saved.snapshot.position.y, 3);
  await page
    .getByRole("button", { name: "Pause adventure", exact: true })
    .click();
  await page.getByRole("button", { name: "Save & return home" }).click();
  await page.getByRole("button", { name: "Start Endless Feast" }).click();
  await expect(page.locator("#stage")).toHaveAttribute("data-state", "playing");
  expect(errors).toEqual([]);
});
for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
])
  test(`adventure fits ${viewport.width} x ${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await start(page);
    const canvas = await page.locator("#stage canvas").boundingBox();
    expect(canvas!.width).toBeGreaterThan(viewport.width * 0.95);
    expect(canvas!.height).toBeGreaterThan(viewport.height * 0.95);
    const b = await page
      .getByRole("button", { name: "Bite", exact: true })
      .boundingBox();
    expect(b!.width).toBeGreaterThanOrEqual(56);
    expect(b!.height).toBeGreaterThanOrEqual(56);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/adventure-${test.info().project.name}-${viewport.width}x${viewport.height}.png`,
    });
  });
test("mid and late saves open their regions and unlocked species without cheats", async ({
  page,
}) => {
  await page.goto("./");
  const s = freshAdventure();
  s.xp.rex = 1100;
  s.rivals = ["river-hunter", "marsh-pack"];
  s.species = ["rex", "raptor", "trike"];
  s.regions = ["hollow", "river", "marsh", "dunes", "ember"];
  s.nests = ["hollow", "ember"];
  s.snapshot = {
    dino: "rex",
    position: { x: 1350, y: 1350 },
    nest: "ember",
    at: 1,
  };
  s.updated = 1;
  await page.evaluate(
    ({ id, data }) =>
      localStorage.setItem("trex_adventure_v1_" + id, JSON.stringify(data)),
    { id: profile.id, data: s },
  );
  await page
    .getByRole("button", { name: "Keep going as Adventure Rex" })
    .click();
  await page.getByRole("button", { name: "Continue adventure" }).click();
  await expect(page.locator("[data-region]")).toHaveText("Ember Basin");
  await expect(page.locator("[data-growth-title]")).toContainText("Apex");
  await page.screenshot({
    path: `test-results/adventure-${test.info().project.name}-apex.png`,
  });
});
