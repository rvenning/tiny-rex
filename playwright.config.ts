import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://127.0.0.1:4173/tiny-rex/",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
        hasTouch: true,
      },
    },
    {
      name: "webkit-ipad",
      use: { ...devices["iPad (gen 7)"], browserName: "webkit" },
    },
  ],
  webServer: {
    command: "npm run preview -- --port 4173",
    url: "http://127.0.0.1:4173/tiny-rex/",
    reuseExistingServer: !process.env.CI,
  },
});
