import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';
import * as security from '../../src/core/security';

// Mock dependencies
vi.mock('../../src/core/database');
vi.mock('../../src/core/media-service');
vi.mock('../../src/core/file-system');
vi.mock('../../src/core/security');
vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
  },
}));

vi.mock('../../src/core/media-handler', () => ({
  serveMetadata: vi.fn((req, res) => res.end()),
  serveTranscode: vi.fn((req, res) => res.end()),
  serveThumbnail: vi.fn((req, res) => res.end()),
  serveStaticFile: vi.fn((req, res) => res.end()),
}));

describe('Server CORS', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: true,
      realPath: '/resolved/path',
    });
    // createApp is called in each test.
    // Since isDev is module-level const, we can't easily change it between tests without resetting modules.
    // In 'test' env, isDev is true.
  });

  it('should block evil.com origin', async () => {
    app = await createApp();
    const response = await request(app)
      .get('/api/extensions')
      .set('Origin', 'http://evil.com');

    // Should NOT be *
    // It returns the configured origin. The browser will block this because 'http://evil.com' != 'http://localhost:5173'
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
  });

  it('should allow localhost:5173 in dev/test mode', async () => {
    app = await createApp();
    const response = await request(app)
      .get('/api/extensions')
      .set('Origin', 'http://localhost:5173');

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
  });
});
