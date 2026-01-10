import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';
import * as security from '../../src/core/security';

// Mock dependencies
vi.mock('../../src/core/database');
vi.mock('../../src/core/media-service');
vi.mock('../../src/core/file-system');
vi.mock('../../src/core/media-handler', () => ({
  serveMetadata: vi.fn((req, res) => res.end()),
  serveTranscodedStream: vi.fn((req, res) => res.end()),
  serveRawStream: vi.fn((req, res) => res.end()),
  serveThumbnail: vi.fn((req, res) => res.end()),
  serveStaticFile: vi.fn((req, res) => res.end()),
  validateFileAccess: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../src/main/google-auth');
vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
    mkdir: vi.fn(),
    realpath: vi.fn((p) => Promise.resolve(p)),
  },
}));

vi.mock('../../src/core/security', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/core/security')>();
  return {
    ...actual,
    authorizeFilePath: vi.fn(),
  };
});

describe('Server Input Validation', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(security.authorizeFilePath).mockImplementation(
      async (p: string) => {
        if (typeof p !== 'string') {
          throw new TypeError('Path must be a string');
        }
        return { isAllowed: true, realPath: p };
      },
    );
    app = await createApp();
  });

  describe('POST /api/media/views', () => {
    it('should handle array with non-string elements gracefully', async () => {
      // This payload contains an integer, which should be rejected
      const payload = { filePaths: ['/valid/path', 123] };

      const response = await request(app)
        .post('/api/media/views')
        .send(payload);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/media/metadata/batch', () => {
    it('should handle array with non-string elements gracefully', async () => {
      const payload = { filePaths: ['/valid/path', { bad: 'object' }] };

      const response = await request(app)
        .post('/api/media/metadata/batch')
        .send(payload);

      expect(response.status).toBe(400);
    });
  });
});
