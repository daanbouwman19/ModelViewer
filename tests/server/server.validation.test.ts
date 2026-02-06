import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';
import * as security from '../../src/core/security';
import { MAX_API_BATCH_SIZE } from '../../src/core/constants';

// Mock dependencies
vi.mock('../../src/core/database');
vi.mock('../../src/core/media-service');
vi.mock('../../src/core/file-system');
const { MockMediaHandler } = vi.hoisted(() => {
  class MockMediaHandler {
    serveMetadata = vi.fn((_req, res) => res.end());
    serveTranscodedStream = vi.fn((_req, res) => res.end());
    serveRawStream = vi.fn((_req, res) => res.end());
    serveThumbnail = vi.fn((_req, res) => res.end());
    serveStaticFile = vi.fn((_req, res) => res.end());
    serveHeatmap = vi.fn((_req, res) => res.end());
    serveHeatmapProgress = vi.fn((_req, res) => res.end());
    serveHlsMaster = vi.fn((_req, res) => res.end());
    serveHlsPlaylist = vi.fn((_req, res) => res.end());
    serveHlsSegment = vi.fn((_req, res) => res.end());
  }

  return { MockMediaHandler };
});

vi.mock('../../src/core/media-handler', () => ({
  MediaHandler: MockMediaHandler,
  serveMetadata: vi.fn((_req, res) => res.end()),
  serveTranscodedStream: vi.fn((_req, res) => res.end()),
  serveRawStream: vi.fn((_req, res) => res.end()),
  serveThumbnail: vi.fn((_req, res) => res.end()),
  serveStaticFile: vi.fn((_req, res) => res.end()),
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

  const testCases = [
    // POST /api/media/view
    {
      method: 'post',
      path: '/api/media/view',
      payload: {},
      description: 'fails when filePath is missing',
    },
    {
      method: 'post',
      path: '/api/media/view',
      payload: { filePath: 123 },
      description: 'fails when filePath is not a string',
    },

    // POST /api/media/views
    {
      method: 'post',
      path: '/api/media/views',
      payload: {},
      description: 'fails when filePaths is missing',
    },
    {
      method: 'post',
      path: '/api/media/views',
      payload: { filePaths: 'string' },
      description: 'fails when filePaths is not an array',
    },
    {
      method: 'post',
      path: '/api/media/views',
      payload: { filePaths: ['/valid', 123] },
      description: 'fails when filePaths contains non-string elements',
    },
    {
      method: 'post',
      path: '/api/media/views',
      payload: { filePaths: Array(MAX_API_BATCH_SIZE + 1).fill('/path') },
      description: 'fails when batch size exceeds limit',
    },

    // POST /api/media/rate
    {
      method: 'post',
      path: '/api/media/rate',
      payload: {},
      description: 'fails when body is empty',
    },
    {
      method: 'post',
      path: '/api/media/rate',
      payload: { filePath: '/path' },
      description: 'fails when rating is missing',
    },
    {
      method: 'post',
      path: '/api/media/rate',
      payload: { rating: 5 },
      description: 'fails when filePath is missing',
    },
    {
      method: 'post',
      path: '/api/media/rate',
      payload: { filePath: 123, rating: 5 },
      description: 'fails when filePath is not a string',
    },
    {
      method: 'post',
      path: '/api/media/rate',
      payload: { filePath: '/path', rating: '5' },
      description: 'fails when rating is not a number',
    },

    // POST /api/media/metadata
    {
      method: 'post',
      path: '/api/media/metadata',
      payload: {},
      description: 'fails when body is empty',
    },
    {
      method: 'post',
      path: '/api/media/metadata',
      payload: { filePath: 123, metadata: {} },
      description: 'fails when filePath is not a string',
    },
    {
      method: 'post',
      path: '/api/media/metadata',
      payload: { filePath: '/path' },
      description: 'fails when metadata is missing',
    },

    // POST /api/media/metadata/batch
    {
      method: 'post',
      path: '/api/media/metadata/batch',
      payload: { filePaths: ['/valid/path', { bad: 'object' }] },
      description: 'fails when filePaths contains non-string elements',
    },
    {
      method: 'post',
      path: '/api/media/metadata/batch',
      payload: { filePaths: Array(MAX_API_BATCH_SIZE + 1).fill('/path') },
      description: 'fails when batch size exceeds limit',
    },

    // GET /api/stream
    {
      method: 'get',
      path: '/api/stream',
      query: {},
      description: 'fails when file param is missing',
    },

    // GET /api/metadata
    {
      method: 'get',
      path: '/api/metadata',
      query: {},
      description: 'fails when file param is missing',
    },

    // GET /api/thumbnail
    {
      method: 'get',
      path: '/api/thumbnail',
      query: {},
      description: 'fails when file param is missing',
    },

    // GET /api/video/heatmap
    {
      method: 'get',
      path: '/api/video/heatmap',
      query: {},
      description: 'fails when file param is missing',
    },
  ];

  it.each(testCases)(
    '$method $path $description',
    async ({ method, path, payload, query }) => {
      let req = request(app)[method as 'get' | 'post'](path);

      if (payload) {
        req = req.send(payload);
      }
      if (query) {
        req = req.query(query);
      }

      const response = await req;
      expect(response.status).toBe(400);
    },
  );
});
