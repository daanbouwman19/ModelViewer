import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMediaRoutes } from '../../src/server/routes/media.routes';
import { errorHandler } from '../../src/server/middleware/error-handler';
import * as database from '../../src/core/database';
import * as security from '../../src/core/security';
import * as mediaHandler from '../../src/core/media-handler';
import * as mediaSource from '../../src/core/media-source';

type TestAppResult = {
  app: express.Express;
  mediaHandler: {
    serveMetadata: ReturnType<typeof vi.fn>;
    serveThumbnail: ReturnType<typeof vi.fn>;
    serveHeatmap: ReturnType<typeof vi.fn>;
    serveHeatmapProgress: ReturnType<typeof vi.fn>;
    serveHlsMaster: ReturnType<typeof vi.fn>;
    serveHlsPlaylist: ReturnType<typeof vi.fn>;
    serveHlsSegment: ReturnType<typeof vi.fn>;
    serveStaticFile: ReturnType<typeof vi.fn>;
  };
  transcodeState: { current: number };
};

const { MockMediaHandler } = vi.hoisted(() => {
  class MockMediaHandler {
    serveMetadata = vi.fn((_req, res) => res.status(200).send('ok'));
    serveThumbnail = vi.fn((_req, res) => res.status(200).send('ok'));
    serveHeatmap = vi.fn((_req, res) => res.status(200).send('ok'));
    serveHeatmapProgress = vi.fn((_req, res) => res.status(200).send('ok'));
    serveHlsMaster = vi.fn((_req, res) => res.status(200).send('ok'));
    serveHlsPlaylist = vi.fn((_req, res) => res.status(200).send('ok'));
    serveHlsSegment = vi.fn((_req, res) => res.status(200).send('ok'));
    serveStaticFile = vi.fn((_req, res) => res.status(200).send('ok'));
  }

  return { MockMediaHandler };
});

vi.mock('../../src/core/database', () => ({
  getAllMetadataAndStats: vi.fn(),
  getMediaViewCounts: vi.fn(),
  getMetadata: vi.fn(),
  getRecentlyPlayed: vi.fn(),
  recordMediaView: vi.fn(),
  setRating: vi.fn(),
  upsertMetadata: vi.fn(),
}));

vi.mock('../../src/core/security', () => ({
  authorizeFilePath: vi.fn(),
}));

vi.mock('../../src/core/media-handler', () => ({
  MediaHandler: MockMediaHandler,
  serveRawStream: vi.fn(),
  serveTranscodedStream: vi.fn(),
  validateFileAccess: vi.fn(),
}));

vi.mock('../../src/core/media-source', () => ({
  createMediaSource: vi.fn(),
}));

const createLimiter =
  () =>
  (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next();

const createTestApp = (ffmpegPath: string | null): TestAppResult => {
  const app = express();
  app.use(express.json());

  const handler = new (mediaHandler.MediaHandler as any)();

  const transcodeState = { current: 0 };

  app.use(
    createMediaRoutes({
      limiters: {
        readLimiter: createLimiter(),
        writeLimiter: createLimiter(),
        fileLimiter: createLimiter(),
        authLimiter: createLimiter(),
        streamLimiter: createLimiter(),
      },
      mediaHandler: handler as any,
      transcodeState,
      ffmpegPath,
    }),
  );
  app.use(errorHandler);

  return { app, mediaHandler: handler, transcodeState };
};

describe('Media routes additional coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: true,
      realPath: '/file.mp4',
    });
    vi.mocked(mediaHandler.validateFileAccess).mockResolvedValue({
      success: true,
      path: '/file.mp4',
    });
    vi.mocked(mediaSource.createMediaSource).mockReturnValue({
      filePath: '/file.mp4',
    } as any);
  });

  it('GET /api/media/all returns metadata', async () => {
    vi.mocked(database.getAllMetadataAndStats).mockResolvedValue([] as any);
    const { app } = createTestApp('ffmpeg');

    const res = await request(app).get('/api/media/all');

    expect(res.status).toBe(200);
    expect(database.getAllMetadataAndStats).toHaveBeenCalled();
  });

  it('GET /api/stream returns 500 when ffmpeg is missing', async () => {
    const { app } = createTestApp(null);

    const res = await request(app)
      .get('/api/stream')
      .query({ file: '/file.mp4', transcode: 'true' });

    expect(res.status).toBe(500);
    expect(res.text).toBe('FFmpeg not found');
  });

  it('GET /api/stream cleans up on transcode errors', async () => {
    vi.mocked(mediaHandler.serveTranscodedStream).mockRejectedValue(
      new Error('Transcode failed'),
    );
    const { app, transcodeState } = createTestApp('ffmpeg');

    const res = await request(app)
      .get('/api/stream')
      .query({ file: '/file.mp4', transcode: 'true' });

    expect(res.status).toBe(500);
    expect(transcodeState.current).toBe(0);
  });

  it('GET /api/video/heatmap/status returns 400 without file', async () => {
    const { app } = createTestApp('ffmpeg');

    const res = await request(app).get('/api/video/heatmap/status');

    expect(res.status).toBe(400);
  });

  it('GET /api/hls/master.m3u8 returns 400 without file', async () => {
    const { app } = createTestApp('ffmpeg');

    const res = await request(app).get('/api/hls/master.m3u8');

    expect(res.status).toBe(400);
  });

  it('GET /api/hls/playlist.m3u8 returns 400 without file', async () => {
    const { app } = createTestApp('ffmpeg');

    const res = await request(app).get('/api/hls/playlist.m3u8');

    expect(res.status).toBe(400);
  });

  it('GET /api/hls/:segment calls handler with segment name', async () => {
    const { app, mediaHandler: handler } = createTestApp('ffmpeg');

    const res = await request(app)
      .get('/api/hls/segment-1.ts')
      .query({ file: '/file.mp4' });

    expect(res.status).toBe(200);
    expect(handler.serveHlsSegment).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      '/file.mp4',
      'segment-1.ts',
    );
  });
});
