import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';

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
    validateFileAccess: vi.fn().mockResolvedValue({ success: true, path: 'test.mp4' }),
    serveTranscodedStream: vi.fn(async (req, res) => {
      // Simulate delay
      res.write('chunk');
      await new Promise((resolve) => setTimeout(resolve, 500));
      res.end();
    }),
    // serveRawStream uses real impl but with mocked source
  };
});

describe('Server Transcode Concurrency', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
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

    // Give them a moment to hit the server
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Launch one more, which should be blocked
    const blockedRes = await request(app).get(
      '/api/stream?file=test.mp4&transcode=true',
    );
    expect(blockedRes.status).toBe(503);
    expect(blockedRes.text).toMatch(/server too busy/i);

    // Wait for others to finish
    const results = await Promise.all(pendingRequests);
    results.forEach((res) => {
      expect(res.status).toBe(200);
    });

    // After they finish, we should be able to request again
    await new Promise((resolve) => setTimeout(resolve, 100));

    const successRes = await request(app).get(
      '/api/stream?file=test.mp4&transcode=true',
    );
    expect(successRes.status).toBe(200);
  });
});
