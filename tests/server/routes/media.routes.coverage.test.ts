import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import * as mediaRoutes from '../../../src/server/routes/media.routes';
import * as security from '../../../src/core/security';
import * as mediaHandler from '../../../src/core/media-handler';
import { MAX_API_BATCH_SIZE } from '../../../src/core/constants';

// Mocks
vi.mock('../../../src/core/database');
vi.mock('../../../src/core/security');
vi.mock('../../../src/core/media-handler', () => ({
  MediaHandler: vi.fn(),
  serveRawStream: vi.fn(),
  serveTranscodedStream: vi.fn((_req, res) => {
    res.end('done');
    return Promise.resolve();
  }),
  validateFileAccess: vi.fn(),
}));
vi.mock('../../../src/core/media-source');

// Mock Limiters
const mockLimiters = {
  readLimiter: (_req: any, _res: any, next: any) => next(),
  writeLimiter: (_req: any, _res: any, next: any) => next(),
  fileLimiter: (_req: any, _res: any, next: any) => next(),
  streamLimiter: (_req: any, _res: any, next: any) => next(),
};

describe('Media Routes Coverage', () => {
  let app: express.Express;
  let mockMediaHandler: any;
  let transcodeState: { current: number };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMediaHandler = {
      serveMetadata: vi.fn(),
      serveThumbnail: vi.fn(),
      serveHeatmap: vi.fn(),
      serveHeatmapProgress: vi.fn(),
      serveHlsMaster: vi.fn(),
      serveHlsPlaylist: vi.fn(),
      serveHlsSegment: vi.fn(),
    };
    transcodeState = { current: 0 };

    app = express();
    app.use(bodyParser.json());
    app.use(
      mediaRoutes.createMediaRoutes({
        limiters: mockLimiters as any,
        mediaHandler: mockMediaHandler,
        transcodeState,
        ffmpegPath: '/usr/bin/ffmpeg',
      }),
    );

    // Error handler
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.statusCode || 500).json({ error: err.message });
    });

    // Default Security
    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: true,
    } as any);
    vi.mocked(security.filterAuthorizedPaths).mockImplementation(
      async (paths) => paths,
    );
    vi.mocked(mediaHandler.validateFileAccess).mockResolvedValue({
      success: true,
      path: '/file.mp4',
    });
  });

  describe('Validation & Errors', () => {
    it('POST /api/media/view missing filePath', async () => {
      const res = await request(app).post('/api/media/view').send({});
      expect(res.status).toBe(400);
    });

    it('POST /api/media/view access denied', async () => {
      vi.mocked(security.authorizeFilePath).mockResolvedValue({
        isAllowed: false,
        message: 'Denied',
      } as any);
      const res = await request(app)
        .post('/api/media/view')
        .send({ filePath: '/secret.mp4' });
      expect(res.status).toBe(403);
      expect(res.text).toBe('Denied');
    });

    it('POST /api/media/views invalid body', async () => {
      const res = await request(app)
        .post('/api/media/views')
        .send({ filePaths: 'not-array' });
      expect(res.status).toBe(400);
    });

    it('POST /api/media/views exceeds batch limit', async () => {
      const paths = Array(MAX_API_BATCH_SIZE + 1).fill('/path.mp4');
      const res = await request(app)
        .post('/api/media/views')
        .send({ filePaths: paths });
      expect(res.status).toBe(400);
      expect(res.text).toContain('Batch size exceeds limit');
    });

    it('POST /api/media/rate missing arguments', async () => {
      const res = await request(app)
        .post('/api/media/rate')
        .send({ filePath: '/f.mp4' }); // missing rating
      expect(res.status).toBe(400);
    });

    it('POST /api/media/metadata missing arguments', async () => {
      const res = await request(app)
        .post('/api/media/metadata')
        .send({ filePath: '/f.mp4' }); // missing metadata
      expect(res.status).toBe(400);
    });

    it('POST /api/media/metadata/batch invalid body', async () => {
      const res = await request(app).post('/api/media/metadata/batch').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('Streaming Logic', () => {
    it('GET /api/stream missing file', async () => {
      const res = await request(app).get('/api/stream');
      expect(res.status).toBe(400);
    });

    it('GET /api/stream access denied', async () => {
      vi.mocked(mediaHandler.validateFileAccess).mockResolvedValue({
        success: false,
        statusCode: 403,
        error: 'Denied',
      });
      const res = await request(app).get('/api/stream?file=/denied.mp4');
      expect(res.status).toBe(403);
      expect(res.text).toBe('Denied');
    });

    it('GET /api/stream transcode limit reached', async () => {
      transcodeState.current = 1000; // Force limit
      const res = await request(app).get(
        '/api/stream?file=/v.mp4&transcode=true',
      );
      expect(res.status).toBe(503);
    });

    it('GET /api/stream transcode ffmpeg missing', async () => {
      // Recreate app with null ffmpegPath
      const appNoFfmpeg = express();
      appNoFfmpeg.use(
        mediaRoutes.createMediaRoutes({
          limiters: mockLimiters as any,
          mediaHandler: mockMediaHandler,
          transcodeState: { current: 0 },
          ffmpegPath: null,
        }),
      );

      const res = await request(appNoFfmpeg).get(
        '/api/stream?file=/v.mp4&transcode=true',
      );
      expect(res.status).toBe(500);
      expect(res.text).toBe('FFmpeg not found');
    });

    it('GET /api/stream transcode success updates state', async () => {
      await request(app).get('/api/stream?file=/v.mp4&transcode=true');
      expect(vi.mocked(mediaHandler.serveTranscodedStream)).toHaveBeenCalled();
    });
  });

  describe('Serve Route Errors', () => {
    it('GET /api/serve missing path', async () => {
      const res = await request(app).get('/api/serve');
      expect(res.status).toBe(400);
    });

    it('GET /api/serve access denied', async () => {
      vi.mocked(mediaHandler.validateFileAccess).mockResolvedValue({
        success: false,
        statusCode: 403,
        error: 'Denied',
      });
      const res = await request(app).get('/api/serve?path=/denied');
      expect(res.status).toBe(403);
    });

    it('GET /api/serve generic error', async () => {
      vi.mocked(mediaHandler.validateFileAccess).mockRejectedValue(
        new Error('Random Error'),
      );
      const res = await request(app).get('/api/serve?path=/err');
      expect(res.status).toBe(500);
    });
  });
});
