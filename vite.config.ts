import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";
// Install a complete opening area; the rest of the adventure caches as it is explored.
const openingWorld = JSON.parse(readFileSync(new URL("./public/world/world.json", import.meta.url), "utf8"));
const release = JSON.parse(readFileSync(new URL("./public/version.json", import.meta.url), "utf8"));
const openingX = (27 - 35) * Math.SQRT1_2 * 80;
const openingY = (27 + 35) * Math.SQRT1_2 * 80 * Math.sin(35.264 * Math.PI / 180);
const openingTiles = (openingWorld.tiles ?? []).filter((t: { tx: number; ty: number }) =>
  Math.abs(openingWorld.canvas.ox + (t.tx + .5) * openingWorld.tileSize - openingX) < 2500 &&
  Math.abs(openingWorld.canvas.oy + (t.ty + .5) * openingWorld.tileSize - openingY) < 2500
).map((t: { file: string }) => `world/ground/${t.file}`);
export default defineConfig({
  base: "/tiny-rex/",
  server: {
    watch: { ignored: ["**/art-build/**", "**/public/world/**", "**/public/art/**"] },
  },
  plugins: [
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/*.png", "version.json"],
      manifest: {
        id: "/tiny-rex/",
        name: "Tiny Rex · A Prehistoric Adventure",
        short_name: "Tiny Rex",
        description:
          "Stalk, dodge and discover a living prehistoric valley. Grow from hatchling to apex.",
        start_url: "/tiny-rex/",
        scope: "/tiny-rex/",
        display: "standalone",
        orientation: "any",
        background_color: "#152820",
        theme_color: "#152820",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2}", "icons/*.png", "art/portraits/*.webp", "art/props/*.{json,webp}", "art/creatures/{rex_0,beetle,dragonfly,compy,raptor}*.{json,webp}", "world/world.json", "world/world.bin.gz", ...openingTiles],
        runtimeCaching: [{
          urlPattern: /\/tiny-rex\/(?:art|world)\//,
          handler: "CacheFirst",
          options: {
            cacheName: `tiny-rex-adventure-art-v${release.version}`,
            expiration: { maxEntries: 512, maxAgeSeconds: 30 * 24 * 60 * 60 },
            cacheableResponse: { statuses: [200] },
          },
        }],
        maximumFileSizeToCacheInBytes: 4000000,
        // Workbox cleans only obsolete precaches within this registration scope.
        cleanupOutdatedCaches: true,
        // Retire only this game's old cache; other family games share the origin.
        inlineWorkboxRuntime: true,
        importScripts: ["retire-legacy-cache.js"],
        navigateFallback: "/tiny-rex/index.html",
        navigateFallbackAllowlist: [/^\/tiny-rex\//],
      },
    }),
  ],
  build: {
    rollupOptions: { output: { manualChunks: { phaser: ["phaser"] } } },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
