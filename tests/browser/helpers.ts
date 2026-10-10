import { expect, type Page } from "@playwright/test";
export const reviewProfile = {
  id: "adventure-review",
  name: "Adventure Rex",
  avatar: "🦖",
  pin: null,
  created: 1,
  updated: 1,
};
/** seed one ready-made character (named like the profile so "Continue as Adventure Rex" finds it) unless the test needs a fresh profile */
export async function isolate(page: Page, pin: string | null = null, seedCharacter = true) {
  // Keep each checkpoint stable while the art pipeline publishes files into public/.
  await page.routeWebSocket("**", (socket) => socket.close());
  await page.route(/googleapis|firebaseapp|gstatic/, (route) => route.abort());
  await page.addInitScript(
    ({ profile, pin, seedCharacter }) => {
      if (sessionStorage.getItem("rebuild-review")) return;
      sessionStorage.setItem("rebuild-review", "yes");
      localStorage.clear();
      localStorage.setItem(
        "trex_profiles",
        JSON.stringify([{ ...profile, pin }]),
      );
      localStorage.setItem(
        "trex_settings",
        JSON.stringify({ sound: false, lastProfile: profile.id }),
      );
      if (seedCharacter) {
        const c = { version: 2, id: "c-review", name: "Adventure Rex", species: "rex", created: 1, updated: 1, rev: 1 };
        localStorage.setItem("trex_chars_v2_" + profile.id, JSON.stringify({ version: 2, active: c.id, characters: { [c.id]: c }, trash: [], updated: 1 }));
      }
      localStorage.setItem(
        "trex_progress_" + profile.id,
        JSON.stringify({
          levels: { 0: { stars: 3, best: 900 } },
          feastBest: 500,
          updated: 1,
        }),
      );
    },
    { profile: reviewProfile, pin, seedCharacter },
  );
}
export async function start(page: Page) {
  await page.goto("./");
  await page.getByRole("button", { name: /Continue as Adventure Rex/ }).click();
  await expect(page.locator(".hud")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).adventureDiagnostics()?.ready ?? false,
      ),
    )
    .toBe(true);
}
export const position = (page: Page) =>
  page.evaluate(
    () =>
      (window as any).adventureDiagnostics().position as {
        x: number;
        y: number;
      },
  );

export async function terrainVisible(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = (window as any).__rex.game.scene.getScene("Adventure");
        const view = scene.cameras.main.worldView;
        let area = 0;
        for (const image of scene.children.list) {
          if (!image.texture?.key?.startsWith("ground-") || !image.visible) continue;
          const r = image.getBounds();
          area +=
            Math.max(0, Math.min(view.right, r.right) - Math.max(view.x, r.x)) *
            Math.max(
              0,
              Math.min(view.bottom, r.bottom) - Math.max(view.y, r.y),
            );
        }
        return area / (view.width * view.height);
      }),
    )
    .toBeGreaterThan(0.98);
  await expect
    .poll(() =>
      page.evaluate(() => new Promise<number>((resolve, reject) => {
        const game = (window as any).__rex.game;
        const timer = setTimeout(() => {
          game.events.off("postrender", read);
          reject(new Error("No rendered frame arrived for terrain pixel verification"));
        }, 4000);
        function read() {
          clearTimeout(timer);
          try {
            const canvas = game.canvas as HTMLCanvasElement;
            const gl = game.renderer.gl as WebGLRenderingContext | undefined;
            const pixels = new Uint8Array(canvas.width * canvas.height * 4);
            // WebGL may discard its buffer after presenting. Sample the actual
            // normal renderer synchronously before the postrender event returns.
            if (gl) gl.readPixels(0, 0, canvas.width, canvas.height,
              gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            else pixels.set(canvas.getContext("2d")!
              .getImageData(0, 0, canvas.width, canvas.height).data);
            let sampled = 0, background = 0, painted = 0;
            for (let x = 0.15; x < 0.85; x += 0.08)
              for (let y = 0.15; y < 0.85; y += 0.08) {
                const i = (Math.floor(y * canvas.height) * canvas.width +
                  Math.floor(x * canvas.width)) * 4;
                sampled++;
                if (pixels[i + 3]) painted++;
                if (pixels[i] === 27 && pixels[i + 1] === 51 && pixels[i + 2] === 34)
                  background++;
              }
            resolve(painted === sampled ? background / sampled : 1);
          } catch (error) { reject(error); }
        }
        game.events.once("postrender", read);
      })),
    )
    .toBeLessThan(0.05);
}
