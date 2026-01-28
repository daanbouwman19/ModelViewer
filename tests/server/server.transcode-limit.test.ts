import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';
import { serveTranscodedStream } from '../../src/core/media-handler';

// Mock dependencies to isolate server logic
vi.mock('../../src/core/database', () => ({
  initDatabase: vi.fn(),
  addMediaDirectory: vi.fn().mockResolvedValue(undefined),
  getMediaDirectories: vi.fn().mockResolvedValue([]),
  removeMediaDirectory: vi.fn(),
  setDirectoryActiveState: vi.fn(),
  recordMediaView: vi.fn(),
  getMediaViewCounts: vi.fn(),
  upsertMetadata: vi.fn(),
  getMetadata: vi.fn(),
  createSmartPlaylist: vi.fn(),
  getSmartPlaylists: vi.fn(),
  deleteSmartPlaylist: vi.fn(),
  updateSmartPlaylist: vi.fn(),
  setRating: vi.fn(),
  getAllMetadataAndStats: vi.fn(),
  getRecentlyPlayed: vi.fn(),
}));
vi.mock('../../src/core/media-service', () => ({
  getAlbumsWithViewCounts: vi.fn(),
  getAlbumsWithViewCountsAfterScan: vi.fn(),
}));
vi.mock('../../src/main/google-auth', () => ({
  generateAuthUrl: vi.fn(),
  authenticateWithCode: vi.fn(),
}));
vi.mock('../../src/main/drive-cache-manager', () => ({
  initializeDriveCacheManager: vi.fn(),
}));
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({}),
    realpath: vi.fn((p) => Promise.resolve(p)),
    access: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../../src/core/security', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/core/security')>();
  return {
    ...actual,
    authorizeFilePath: vi.fn().mockResolvedValue({ isAllowed: true }),
    isSensitiveDirectory: vi.fn().mockReturnValue(false),
  };
});

// Mock media-source with necessary methods
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

// Mock media-handler to simulate slow transcoding
vi.mock('../../src/core/media-handler', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/core/media-handler')>();
  return {
    ...actual,
    validateFileAccess: vi
      .fn()
      .mockResolvedValue({ success: true, path: 'test.mp4' }),
    serveTranscodedStream: vi.fn(),
    // serveRawStream uses real impl but with mocked source
  };
});

describe('Server Transcode Concurrency', () => {
  let app: any;
  let transcodeBarrier: Promise<void>;
  let releaseTranscode: () => void;
  let transcodeStartedCount = 0;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
    transcodeStartedCount = 0;
    transcodeBarrier = new Promise((resolve) => {
      releaseTranscode = resolve;
    });

    (serveTranscodedStream as Mock).mockImplementation(async (_req, res) => {
      transcodeStartedCount++;
      res.write('chunk');
      await transcodeBarrier;
      res.end();
    });
  });

  it('should limit concurrent transcoding requests', async () => {
    const LIMIT = 3;
    const pendingRequests: Promise<any>[] = [];

    // Launch LIMIT requests and ensure they START
    for (let i = 0; i < LIMIT; i++) {
      // Explicitly call then() to start the request immediately
      const p = request(app)
        .get('/api/stream?file=test.mp4&transcode=true')
        .then((r) => r);
      pendingRequests.push(p);
    }

    // Wait until all LIMIT requests have started processing
    await vi.waitUntil(() => transcodeStartedCount === LIMIT);

    // Launch one more, which should be blocked
    const blockedRes = await request(app).get(
      '/api/stream?file=test.mp4&transcode=true',
    );
    expect(blockedRes.status).toBe(503);
    expect(blockedRes.text).toMatch(/server too busy/i);

    // Release the blocked requests so they can finish
    releaseTranscode();

    // Wait for others to finish
    const results = await Promise.all(pendingRequests);
    results.forEach((res) => {
      expect(res.status).toBe(200);
    });

    // After they finish, we should be able to request again
    const successRes = await request(app).get(
      '/api/stream?file=test.mp4&transcode=true',
    );
    expect(successRes.status).toBe(200);
  });
});
