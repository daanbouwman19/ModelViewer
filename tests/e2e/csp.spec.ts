import { test, expect } from '@playwright/test';

test.describe('Content Security Policy', () => {
  test('has CSP meta tag with correct directives', async ({ page }) => {
    await page.goto('/');

    const meta = page.locator('meta[http-equiv="Content-Security-Policy"]');
    await expect(meta).toHaveCount(1);

    const content = await meta.getAttribute('content');
    expect(content).toBeDefined();

    if (!content) throw new Error('CSP content is empty');

    // Parse CSP string into an object for robust testing
    const directives = content.split(';').reduce(
      (acc, directive) => {
        const parts = directive.trim().split(/\s+/);
        const key = parts.shift();
        if (key) {
          acc[key] = new Set(parts);
        }
        return acc;
      },
      {} as Record<string, Set<string>>,
    );

    // Verify key directives exist
    expect(directives['default-src']).toBeDefined();
    expect(directives['script-src']).toBeDefined();
    expect(directives['style-src']).toBeDefined();
    expect(directives['object-src']).toBeDefined();
    expect(directives['base-uri']).toBeDefined();

    // Verify specific sources
    expect(directives['default-src']).toContain("'self'");
    expect(directives['script-src']).toContain("'self'");
    expect(directives['script-src']).toContain("'unsafe-inline'");
    expect(directives['script-src']).toContain("'unsafe-eval'");
    expect(directives['object-src']).toContain("'none'");
    expect(directives['base-uri']).toContain("'self'");

    // Verify connect-src includes localhost for Electron/dev
    expect(directives['connect-src']).toBeDefined();
    expect(directives['connect-src']).toContain("'self'");
    expect(directives['connect-src']).toContain('ws:');
    // Check for the wildcard port on localhost
    const hasLocalhost = Array.from(directives['connect-src']).some((src) =>
      src.startsWith('http://127.0.0.1:'),
    );
    expect(hasLocalhost).toBe(true);
  });
});
