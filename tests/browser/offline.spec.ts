import { test, expect } from '@playwright/test';
import { isolate, start, terrainVisible } from './helpers';

test('first-install cache can reopen a fully rendered adventure offline', async ({ page, context, browserName }) => {
  test.setTimeout(120000);
  test.skip(browserName === 'webkit',
    'Playwright WebKit cannot emulate service-worker offline navigation; see microsoft/playwright#42775. Physical Safari offline reopening remains unverified.');
  await isolate(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await start(page);
  await page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready.then(() => true),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Opening cache did not finish installing')), 60000)),
  ]));
  // A first registration controls the next navigation; prove the installed
  // worker owns this page before cutting every network request.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await start(page);
  await terrainVisible(page);
  await expect(page.locator('.hud-card .stage')).toContainText('Hatchling');
  await page.screenshot({ path: test.info().outputPath('offline-gameplay.png') });
});
