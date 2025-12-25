import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';

// Mock dependencies
vi.mock('../../src/core/database', () => ({
  initDatabase: vi.fn(),
}));
vi.mock('../../src/main/drive-cache-manager', () => ({
  initializeDriveCacheManager: vi.fn(),
}));
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(),
  },
}));

describe('Server CSP', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  it('should have Content-Security-Policy header', async () => {
    // In dev, the server might not serve static files on /, but let's check headers on an API endpoint too
    // But Helmet middleware runs globally.
    // However, createApp serves static files only if !isDev.
    // But middleware is added at top.

    // We can check OPTIONS or just an API endpoint
    const apiResponse = await request(app).get('/api/config/extensions');

    expect(apiResponse.headers['content-security-policy']).toBeDefined();

    const csp = apiResponse.headers['content-security-policy'];

    // Check specific directives
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain(
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    );
    expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("media-src 'self' blob:");
    expect(csp).toContain("connect-src 'self'");
  });
});
