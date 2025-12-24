import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';

// Mock dependencies
vi.mock('../../src/core/database');
vi.mock('../../src/core/media-service');
vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
    mkdir: vi.fn(),
  },
}));
vi.mock('../../src/core/media-handler');
vi.mock('../../src/main/google-auth');

describe('Server CSP', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  it('should have Content-Security-Policy header', async () => {
    const response = await request(app).get('/');
    expect(response.headers['content-security-policy']).toBeDefined();

    const csp = response.headers['content-security-policy'];
    // We expect at least default-src 'self'
    expect(csp).toContain("default-src 'self'");
    // We expect font-src to allow google fonts
    expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
    // We expect style-src to allow google fonts and unsafe-inline (needed for some libraries/fonts)
    expect(csp).toContain("style-src 'self' https://fonts.googleapis.com 'unsafe-inline'");
  });
});
