import { test, expect } from '@playwright/test';

test('app sanity check', async ({ page }) => {
  // Navigate to the home page
  await page.goto('/');

  // Verify the title is visible
  await expect(page.getByRole('heading', { name: 'MediaPlayer' })).toBeVisible();

  // Verify the Sidebar toggle button is visible
  const toggleButton = page.getByRole('button', { name: /Hide Albums|Show Albums/i });
  await expect(toggleButton).toBeVisible();

  // Check initial state (Sidebar visible -> button says "Hide Albums")
  // Note: Depending on initial state (which might depend on screen size or defaults)
  // We handle both, but assuming desktop size default is visible.
  if (await toggleButton.textContent() === '← Hide Albums') {
      // Click to hide
      await toggleButton.click();
      await expect(page.getByRole('button', { name: '→ Show Albums' })).toBeVisible();

      // Click to show
      await toggleButton.click();
      await expect(page.getByRole('button', { name: '← Hide Albums' })).toBeVisible();
  } else {
      // It started hidden
      await toggleButton.click();
      await expect(page.getByRole('button', { name: '← Hide Albums' })).toBeVisible();
  }
});
