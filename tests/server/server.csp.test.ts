import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';

// Mock dependencies
vi.mock('../../src/core/database', () => ({
  initDatabase: vi.fn(),
  getAlbumsWithViewCounts: vi.fn(),
  getAlbumsWithViewCountsAfterScan: vi.fn(),
}));
vi.mock('../../src/main/drive-cache-manager', () => ({
  initializeDriveCacheManager: vi.fn(),
}));
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(),
    readFile: vi.fn(),
    access: vi.fn(),
    writeFile: vi.fn(),
  },
}));

describe('Server CSP', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset env to verify production behavior if needed, though vite handles envs differently.
    // The server.ts reads process.env.NODE_ENV.
    // We can try to mock it but ESM imports make it hard to change after load.
    // However, the test runner sets NODE_ENV=test usually.
    app = await createApp();
  });

  it('should have Content-Security-Policy header with nonce', async () => {
    const apiResponse = await request(app).get('/api/config/extensions');

    expect(apiResponse.headers['content-security-policy']).toBeDefined();

    const csp = apiResponse.headers['content-security-policy'];

    // Check specific directives
    expect(csp).toContain("default-src 'self'");

    // Verify script-src has a nonce
    // It should look like: script-src 'self' 'nonce-...'
    expect(csp).toMatch(/script-src 'self' 'nonce-[a-zA-Z0-9+/=]+'/);

    // Verify unsafe-inline behavior:
    // In test environment (NODE_ENV=test), isDev is true (usually, unless configured otherwise).
    // isDev = process.env.NODE_ENV !== 'production'.
    // So 'unsafe-inline' MIGHT be present if isDev is true.
    // Let's check the logic: `...(isDev ? ["'unsafe-inline'"] : [])`
    if (process.env.NODE_ENV !== 'production') {
      expect(csp).toContain("'unsafe-inline'");
    } else {
      expect(csp).not.toContain("'unsafe-inline'");
    }

    expect(csp).toContain(
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    );
  });

  it('should serve auth callback with nonce in script tag', async () => {
    const response = await request(app).get('/auth/google/callback?code=abc');
    expect(response.status).toBe(200);

    // Extract nonce from CSP header
    const csp = response.headers['content-security-policy'];
    const nonceMatch = csp.match(/'nonce-([a-zA-Z0-9+/=]+)'/);
    expect(nonceMatch).toBeTruthy();
    const nonce = nonceMatch![1];

    // Check if the nonce is injected into the script tag
    expect(response.text).toContain(`<script nonce="${nonce}">`);

    // Check that we removed inline event handlers
    expect(response.text).not.toContain('onclick=');
    expect(response.text).toContain('document.getElementById');
  });
});
