import { test, expect } from '@playwright/test';

test.describe('Content Security Policy', () => {
  test('has CSP meta tag with correct directives', async ({ page }) => {
    await page.goto('/');

    const meta = page.locator('meta[http-equiv="Content-Security-Policy"]');
    await expect(meta).toHaveCount(1);

    const content = await meta.getAttribute('content');
    expect(content).toBeDefined();

    // Verify key directives
    expect(content).toContain("default-src 'self'");
    expect(content).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    );
    expect(content).toContain("object-src 'none'");
    expect(content).toContain("base-uri 'self'");

    // Verify connect-src includes localhost for Electron/dev
    expect(content).toContain(
      "connect-src 'self' ws: http: https: http://127.0.0.1:*",
    );
  });
});
