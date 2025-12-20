import { test, expect } from '@playwright/test';

test('verify media grid virtual scrolling', async ({ page }) => {
  await page.route('**/api/media', async (route) => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      path: '/path/img' + i + '.jpg',
      name: 'img' + i + '.jpg',
      type: 'image'
    }));
    await route.fulfill({ json: items });
  });

  await page.goto('/');
  await expect(page.locator('.media-grid-container')).toBeVisible();
  await page.screenshot({ path: 'tests/e2e/temp/media-grid-virtual.png' });
});
