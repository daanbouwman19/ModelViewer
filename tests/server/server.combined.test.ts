import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
  Mock,
} from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';
import * as database from '../../src/core/database';
import * as mediaService from '../../src/core/media-service';
import * as fileSystem from '../../src/core/file-system';
import * as mediaHandler from '../../src/core/media-handler';
import * as security from '../../src/core/security';
import * as googleAuth from '../../src/main/google-auth';
import * as googleDriveService from '../../src/main/google-drive-service';
import * as driveCacheManager from '../../src/main/drive-cache-manager';
import * as mediaUtils from '../../src/core/media-utils';
import * as mimeTypes from '../../src/core/utils/mime-types';
import { MAX_API_BATCH_SIZE, MAX_PATH_LENGTH } from '../../src/core/constants';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';

// --- Global Mocks ---

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
    mkdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
    realpath: vi.fn((p) => Promise.resolve(p)),
  },
  stat: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
  realpath: vi.fn((p) => Promise.resolve(p)),
}));

// Mock fs (sync)
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    createReadStream: vi.fn(() => {
        const stream = new (require('events').EventEmitter)();
        stream.pipe = (dest: any) => { dest.end(); return dest; };
        return stream;
    }),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  createReadStream: vi.fn(() => {
        const stream = new (require('events').EventEmitter)();
        stream.pipe = (dest: any) => { dest.end(); return dest; };
        return stream;
  }),
}));

// Mock core modules
vi.mock('../../src/core/database');
vi.mock('../../src/core/media-service');
vi.mock('../../src/core/file-system');
vi.mock('../../src/main/drive-cache-manager');
vi.mock('../../src/core/utils/mime-types');

// Mock security
vi.mock('../../src/core/security', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/security')>();
  return {
    ...actual,
    authorizeFilePath: vi.fn(),
    filterAuthorizedPaths: vi.fn(async (paths) => paths),
    isRestrictedPath: vi.fn().mockReturnValue(false),
    isSensitiveDirectory: vi.fn().mockReturnValue(false),
  };
});

// Mock rate-limiter (pass-through by default)
vi.mock('../../src/core/rate-limiter', () => ({
  createRateLimiter: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));

// Mock media-utils
vi.mock('../../src/core/media-utils', () => ({
  getThumbnailCachePath: vi.fn(),
  checkThumbnailCache: vi.fn(),
  isDrivePath: vi.fn().mockReturnValue(false),
  normalizeFilePath: vi.fn((p) => p),
  getVlcPath: vi.fn(),
  getQueryParam: vi.fn((q, k) => q[k]),
}));

// Mock media-handler
const { MockMediaHandler, getLastMediaHandler } = vi.hoisted(() => {
  class MockMediaHandler {
    static lastInstance: MockMediaHandler | undefined;
    constructor() {
      MockMediaHandler.lastInstance = this;
    }
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
  const getLastMediaHandler = () => MockMediaHandler.lastInstance;
  return { MockMediaHandler, getLastMediaHandler };
});

vi.mock('../../src/core/media-handler', () => ({
  MediaHandler: MockMediaHandler,
  serveMetadata: vi.fn((_req, res) => res.end()),
  serveTranscodedStream: vi.fn((_req, res) => res.end()),
  serveRawStream: vi.fn((_req, res) => res.end()),
  serveThumbnail: vi.fn((_req, res) => res.end()),
  serveStaticFile: vi.fn((_req, res) => res.end()),
  validateFileAccess: vi.fn().mockResolvedValue({ success: true, path: '/resolved/path' }),
  generateFileUrl: vi.fn(),
  createMediaApp: vi.fn(),
  getVideoDuration: vi.fn(),
}));

// Mock google-auth
vi.mock('../../src/main/google-auth', () => ({
  generateAuthUrl: vi.fn(),
  authenticateWithCode: vi.fn(),
}));

// Mock google-drive-service
vi.mock('../../src/main/google-drive-service', () => ({
  getDriveClient: vi.fn(),
}));

// Mock media-source (for Transcode Concurrency test mainly)
vi.mock('../../src/core/media-source', async () => {
  const { EventEmitter } = await import('events');
  return {
    createMediaSource: vi.fn().mockReturnValue({
      getSize: vi.fn().mockResolvedValue(1000),
      getMimeType: vi.fn().mockResolvedValue('video/mp4'),
      getStream: vi.fn().mockResolvedValue({
        stream: Object.assign(new EventEmitter(), {
          pipe: vi.fn((dest) => {
            dest.write('raw data');
            dest.end();
            return dest;
          }),
          destroy: vi.fn(),
        }),
        length: 1000,
      }),
      getFFmpegInput: vi.fn().mockResolvedValue('test.mp4'),
    }),
  };
});

describe('Server Combined Tests', () => {
  let app: any;

  beforeAll(async () => {
    app = await createApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Security Defaults
    vi.mocked(security.authorizeFilePath).mockResolvedValue({ isAllowed: true, realPath: '/resolved/path' });
    vi.mocked(security.filterAuthorizedPaths).mockImplementation(async (paths) => paths);
    vi.mocked(security.isRestrictedPath).mockReturnValue(false);
    vi.mocked(security.isSensitiveDirectory).mockReturnValue(false);

    // DB Defaults
    vi.mocked(database.getMediaViewCounts).mockResolvedValue({});
    vi.mocked(database.getMetadata).mockResolvedValue({});
    vi.mocked(database.getRecentlyPlayed).mockResolvedValue([]);
    vi.mocked(database.getMediaDirectories).mockResolvedValue([]);
    vi.mocked(database.addMediaDirectory).mockResolvedValue(undefined);

    // FS Defaults
    vi.mocked(fs.realpath).mockImplementation((p) => Promise.resolve(p));

    // Media Utils Defaults
    vi.mocked(mediaUtils.checkThumbnailCache).mockResolvedValue(false);
    vi.mocked(mediaUtils.getThumbnailCachePath).mockReturnValue('/tmp/thumb.jpg');
    vi.mocked(mediaUtils.isDrivePath).mockReturnValue(false);
    vi.mocked(mimeTypes.getMimeType).mockReturnValue('image/jpeg');
  });

  // --- Core Server Routes ---
  describe('Core Server Routes', () => {
    describe('GET /api/albums', () => {
      it('should return albums', async () => {
        const mockAlbums = [{ id: 1, name: 'Album 1' }];
        vi.mocked(mediaService.getAlbumsWithViewCounts).mockResolvedValue(mockAlbums as any);
        const response = await request(app).get('/api/albums');
        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockAlbums);
      });

      it('should handle errors', async () => {
        vi.mocked(mediaService.getAlbumsWithViewCounts).mockRejectedValue(new Error('Test error'));
        const response = await request(app).get('/api/albums');
        expect(response.status).toBe(500);
      });
    });

    describe('POST /api/albums/reindex', () => {
      it('should reindex and return albums', async () => {
        const mockAlbums = [{ id: 1, name: 'Album 1' }];
        vi.mocked(mediaService.getAlbumsWithViewCountsAfterScan).mockResolvedValue(mockAlbums as any);
        const response = await request(app).post('/api/albums/reindex');
        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockAlbums);
      });
    });

    describe('POST /api/media/view', () => {
      it('should record media view', async () => {
        const filePath = '/path/to/file.jpg';
        const response = await request(app).post('/api/media/view').send({ filePath });
        expect(response.status).toBe(200);
        expect(database.recordMediaView).toHaveBeenCalledWith(filePath);
      });

      it('should return 400 if filePath is missing', async () => {
        const response = await request(app).post('/api/media/view').send({});
        expect(response.status).toBe(400);
      });

      it('should return 403 if access is denied', async () => {
        vi.mocked(security.authorizeFilePath).mockResolvedValue({ isAllowed: false, message: 'Denied' });
        const response = await request(app).post('/api/media/view').send({ filePath: '/secret' });
        expect(response.status).toBe(403);
      });
    });

    describe('POST /api/media/views', () => {
      it('should return media view counts', async () => {
        const filePaths = ['/path/to/file.jpg'];
        const mockCounts = { '/path/to/file.jpg': 5 };
        vi.mocked(database.getMediaViewCounts).mockResolvedValue(mockCounts);
        const response = await request(app).post('/api/media/views').send({ filePaths });
        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockCounts);
      });
    });

    describe('GET /api/directories', () => {
      it('should return directories', async () => {
        const mockDirs = ['/dir1', '/dir2'];
        vi.mocked(database.getMediaDirectories).mockResolvedValue(mockDirs as any);
        const response = await request(app).get('/api/directories');
        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockDirs);
      });
    });

    describe('POST /api/directories', () => {
      it('should add a directory', async () => {
        const dirPath = '/new/dir';
        vi.mocked(fs.realpath).mockResolvedValue(dirPath);
        const response = await request(app).post('/api/directories').send({ path: dirPath });
        expect(response.status).toBe(200);
        expect(database.addMediaDirectory).toHaveBeenCalledWith(dirPath);
      });
    });

    describe('DELETE /api/directories', () => {
      it('should remove a directory', async () => {
        const dirPath = '/dir/to/remove';
        const response = await request(app).delete('/api/directories').send({ path: dirPath });
        expect(response.status).toBe(200);
        expect(database.removeMediaDirectory).toHaveBeenCalledWith(dirPath);
      });
    });

    describe('PUT /api/directories/active', () => {
      it('should set directory active state', async () => {
        const dirPath = '/dir';
        const isActive = false;
        const response = await request(app).put('/api/directories/active').send({ path: dirPath, isActive });
        expect(response.status).toBe(200);
        expect(database.setDirectoryActiveState).toHaveBeenCalledWith(dirPath, isActive);
      });
    });

    describe('Media Handler Routes', () => {
      it('GET /api/metadata should call serveMetadata', async () => {
        await request(app).get('/api/metadata').query({ file: 'test.mp4' });
        const handler = getLastMediaHandler();
        expect(handler).toBeTruthy();
        expect(handler!.serveMetadata).toHaveBeenCalled();
      });

      it('GET /api/thumbnail should call serveThumbnail', async () => {
        await request(app).get('/api/thumbnail').query({ file: 'test.jpg' });
        const handler = getLastMediaHandler();
        expect(handler).toBeTruthy();
        expect(handler!.serveThumbnail).toHaveBeenCalled();
      });
    });
  });

  // --- Transcode Concurrency (from server.transcode-limit.test.ts) ---
  describe('Server Transcode Concurrency', () => {
    let transcodeBarrier: Promise<void>;
    let releaseTranscode: () => void;
    let transcodeStartedCount = 0;

    beforeEach(async () => {
        transcodeStartedCount = 0;
        transcodeBarrier = new Promise((resolve) => {
            releaseTranscode = resolve;
        });

        // Override mock implementation for this test suite
        vi.mocked(mediaHandler.serveTranscodedStream).mockImplementation(async (_req, res) => {
            transcodeStartedCount++;
            res.write('chunk');
            await transcodeBarrier;
            res.end();
        });

        // Ensure validation passes
        vi.mocked(mediaHandler.validateFileAccess).mockResolvedValue({ success: true, path: 'test.mp4' });
    });

    it('should limit concurrent transcoding requests', async () => {
        const LIMIT = 3;
        const pendingRequests: Promise<any>[] = [];

        for (let i = 0; i < LIMIT; i++) {
            const p = request(app).get('/api/stream?file=test.mp4&transcode=true').then(r => r);
            pendingRequests.push(p);
        }

        await vi.waitUntil(() => transcodeStartedCount === LIMIT);

        const blockedRes = await request(app).get('/api/stream?file=test.mp4&transcode=true');
        expect(blockedRes.status).toBe(503);
        expect(blockedRes.text).toMatch(/server too busy/i);

        releaseTranscode();

        const results = await Promise.all(pendingRequests);
        results.forEach(res => expect(res.status).toBe(200));

        const successRes = await request(app).get('/api/stream?file=test.mp4&transcode=true');
        expect(successRes.status).toBe(200);
    });
  });

  // --- Input Validation (from server.validation.test.ts) ---
  describe('Server Input Validation', () => {
      beforeEach(() => {
          // Validation middleware uses authorizeFilePath internally which does type checking sometimes
          // but mainly we want the schema validation middleware to fail before that.
          // The combined file already has authorizeFilePath mocked.

          // Re-mock authorizeFilePath to throw if not string, matching validation test expectation if applicable
          vi.mocked(security.authorizeFilePath).mockImplementation(async (p: any) => {
              if (typeof p !== 'string') throw new TypeError('Path must be a string');
              return { isAllowed: true, realPath: p };
          });
      });

      const testCases = [
        { method: 'post', path: '/api/media/view', payload: {}, description: 'fails when filePath is missing' },
        { method: 'post', path: '/api/media/view', payload: { filePath: 123 }, description: 'fails when filePath is not a string' },
        { method: 'post', path: '/api/media/views', payload: {}, description: 'fails when filePaths is missing' },
        { method: 'post', path: '/api/media/views', payload: { filePaths: 'string' }, description: 'fails when filePaths is not an array' },
        { method: 'post', path: '/api/media/views', payload: { filePaths: Array(MAX_API_BATCH_SIZE + 1).fill('/path') }, description: 'fails when batch size exceeds limit' },
        { method: 'post', path: '/api/media/rate', payload: {}, description: 'fails when body is empty' },
        { method: 'post', path: '/api/media/rate', payload: { filePath: '/path' }, description: 'fails when rating is missing' },
        { method: 'post', path: '/api/media/rate', payload: { rating: 5 }, description: 'fails when filePath is missing' },
        { method: 'post', path: '/api/media/metadata', payload: {}, description: 'fails when body is empty' },
        { method: 'get', path: '/api/stream', query: {}, description: 'fails when file param is missing' },
        { method: 'get', path: '/api/metadata', query: {}, description: 'fails when file param is missing' },
        { method: 'get', path: '/api/thumbnail', query: {}, description: 'fails when file param is missing' },
      ];

      it.each(testCases)('$method $path $description', async ({ method, path, payload, query }) => {
          let req = (request(app) as any)[method](path);
          if (payload) req = req.send(payload);
          if (query) req = req.query(query);
          const response = await req;
          expect(response.status).toBe(400);
      });
  });

  // --- IDOR (from server.idor.test.ts) ---
  describe('Server Security: Metadata & Rating Protection (IDOR)', () => {
      it('should allow rating media if file is authorized', async () => {
          vi.mocked(security.authorizeFilePath).mockResolvedValue({ isAllowed: true, realPath: '/allowed/file.mp4' });
          const response = await request(app).post('/api/media/rate').send({ filePath: '/allowed/file.mp4', rating: 5 });
          expect(response.status).toBe(200);
          expect(database.setRating).toHaveBeenCalledWith('/allowed/file.mp4', 5);
      });

      it('should BLOCK rating media if file is unauthorized', async () => {
          vi.mocked(security.authorizeFilePath).mockResolvedValue({ isAllowed: false, message: 'Access denied' });
          const response = await request(app).post('/api/media/rate').send({ filePath: '/secret.mp4', rating: 5 });
          expect(response.status).toBe(403);
          expect(database.setRating).not.toHaveBeenCalled();
      });
  });

  // --- Batch Limit (from server.batch-limit.test.ts) ---
  describe('Server Batch Limit', () => {
      it('should reject /api/media/views requests with more than limit', async () => {
          const hugeArray = new Array(MAX_API_BATCH_SIZE + 1).fill('/path');
          const res = await request(app).post('/api/media/views').send({ filePaths: hugeArray });
          expect(res.status).toBe(400);
      });
  });

  // --- Path Length (from path_length.test.ts) ---
  describe('Path Length Validation', () => {
      const longPath = '/' + 'a'.repeat(MAX_PATH_LENGTH + 100);
      const testCases = [
          { method: 'post', url: '/api/directories', payload: { path: longPath } },
          { method: 'get', url: '/api/fs/ls', query: { path: longPath } },
      ];

      it.each(testCases)('should reject long paths for $url', async ({ method, url, payload, query }) => {
          const req = (request(app) as any)[method](url);
          if (payload) req.send(payload);
          if (query) req.query(query);
          const response = await req;
          expect(response.status).toBe(400);
      });
  });

  // --- CSP ---
  describe('Server CSP', () => {
      it('should have Content-Security-Policy header', async () => {
          const response = await request(app).get('/api/config/extensions');
          expect(response.headers['content-security-policy']).toBeDefined();
      });
  });
});
