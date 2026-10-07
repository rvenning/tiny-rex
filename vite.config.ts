import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  base: "/tiny-rex/",
  plugins: [
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/*.png", "version.json"],
      manifest: {
        id: "/tiny-rex/",
        name: "Tiny Rex · Endless Feast",
        short_name: "Tiny Rex",
        description:
          "Eat small. Grow mighty. Explore four prehistoric valleys.",
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
        globPatterns: ["**/*.{js,css,html,png,webp,woff2}"],
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
