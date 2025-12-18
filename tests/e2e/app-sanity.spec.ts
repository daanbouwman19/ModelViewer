import { test, expect, type Locator } from '@playwright/test';

test('app sanity check', async ({ page, isMobile }) => {
  // Navigate to the home page
  await page.goto('/');

  // Verify the title is visible
  await expect(
    page.getByRole('heading', { name: 'MediaPlayer' }),
  ).toBeVisible();

  const testSidebarToggle = async (openBtn: Locator, closeBtn: Locator) => {
    // Handle either initial state
    if (await closeBtn.isVisible()) {
      // Starts open: close it, then open it again.
      await closeBtn.click();
      await expect(openBtn).toBeVisible();
      await openBtn.click();
      await expect(closeBtn).toBeVisible();
    } else {
      // Starts closed: open it.
      await expect(openBtn).toBeVisible();
      await openBtn.click();
      await expect(closeBtn).toBeVisible();
    }
  };

  if (isMobile) {
    // On mobile, the sidebar is an overlay.
    // Assuming default state is Open (showSidebar = true), the sidebar covers the top bar.
    // So the top bar toggle is NOT visible/accessible initially.
    // Instead, we look for the "Close Sidebar" button inside the sidebar.

    // Use .first() to handle potential duplicates during transitions or if multiple exist in DOM
    const closeSidebarBtn = page
      .getByRole('button', { name: 'Close Sidebar' })
      .first();
    const showAlbumsBtn = page.getByRole('button', { name: 'Show Albums' });

    await testSidebarToggle(showAlbumsBtn, closeSidebarBtn);
  } else {
    // Desktop: Sidebar is static (side-by-side). The top bar toggle is always visible.
    // Its label changes between "Hide Albums" and "Show Albums".

    const hideAlbumsBtn = page.getByRole('button', { name: 'Hide Albums' });
    const showAlbumsBtn = page.getByRole('button', { name: 'Show Albums' });

    await testSidebarToggle(showAlbumsBtn, hideAlbumsBtn);
  }
});
