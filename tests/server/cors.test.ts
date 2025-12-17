import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import * as security from '../../src/core/security';

// Mock dependencies
vi.mock('../../src/core/database');
vi.mock('../../src/core/media-service');
vi.mock('../../src/core/file-system');
vi.mock('../../src/core/security');
vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
    mkdir: vi.fn(),
  },
}));

vi.mock('../../src/core/media-handler', () => ({
  serveMetadata: vi.fn((req, res) => res.end()),
  serveTranscodedStream: vi.fn((req, res) => res.end()),
  serveRawStream: vi.fn((req, res) => res.end()),
  serveThumbnail: vi.fn((req, res) => res.end()),
  serveStaticFile: vi.fn((req, res) => res.end()),
}));

describe('Server CORS', () => {
  let app: any;
  let createApp: any;

  // Save original env
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.resetModules();
  });

  describe('Development Environment', () => {
    beforeEach(async () => {
      process.env.NODE_ENV = 'test'; // isDev = true
      vi.resetModules();

      // Re-import to pick up env change
      const serverModule = await import('../../src/server/server');
      createApp = serverModule.createApp;

      vi.mocked(security.authorizeFilePath).mockResolvedValue({
        isAllowed: true,
        realPath: '/resolved/path',
      });
    });

    it('should block evil.com origin (by returning mismatched allowed origin)', async () => {
      app = await createApp();
      const response = await request(app)
        .get('/api/extensions')
        .set('Origin', 'http://evil.com');

      // Should NOT be *
      expect(response.headers['access-control-allow-origin']).not.toBe('*');
      // It returns the configured dev origin
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://localhost:5173',
      );
    });

    it('should allow localhost:5173', async () => {
      app = await createApp();
      const response = await request(app)
        .get('/api/extensions')
        .set('Origin', 'http://localhost:5173');

      expect(response.headers['access-control-allow-origin']).toBe(
        'http://localhost:5173',
      );
    });
  });

  describe('Production Environment', () => {
    beforeEach(async () => {
      process.env.NODE_ENV = 'production'; // isDev = false
      vi.resetModules();

      // Re-import to pick up env change
      const serverModule = await import('../../src/server/server');
      createApp = serverModule.createApp;

      vi.mocked(security.authorizeFilePath).mockResolvedValue({
        isAllowed: true,
        realPath: '/resolved/path',
      });
    });

    it('should disable CORS (Same-Origin enforced) by not sending headers', async () => {
      app = await createApp();
      const response = await request(app)
        .get('/api/extensions')
        .set('Origin', 'http://evil.com');

      // In production, we pass origin: false to cors().
      // This means no Access-Control-Allow-Origin header should be present.
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
