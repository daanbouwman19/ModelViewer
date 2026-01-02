import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';
import { authenticateWithCode } from '../../src/main/google-auth';

vi.mock('../../src/core/database', () => ({
  initDatabase: vi.fn(),
  addMediaDirectory: vi.fn(),
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
    realpath: vi.fn((p) => Promise.resolve(p)),
  },
}));

describe('Server DoS Protection', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  it('should reject large JSON bodies', async () => {
    // Create a large object string > 10MB
    const largeString = 'a'.repeat(11 * 1024 * 1024);

    const response = await request(app)
      .post('/api/media/views') // Any POST endpoint
      .set('Content-Type', 'application/json')
      .send({ filePaths: [largeString] });

    // Express default is 100kb, but we expect to set it to 10mb.
    // If we send 11MB, it should fail with 413 Payload Too Large.
    expect(response.status).toBe(413);
  });

  it('should rate limit the Google Auth endpoint', async () => {
    // Mock successful auth to avoid other errors
    vi.mocked(authenticateWithCode).mockResolvedValue(undefined as any);

    const LIMIT = 20; // Matches our planned limit
    const code = 'test-code';

    // Send requests up to the limit
    for (let i = 0; i < LIMIT; i++) {
      const res = await request(app)
        .post('/api/auth/google-drive/code')
        .send({ code });
      if (res.status !== 200) {
        console.log(
          `Failed at ${i}: ${res.status} ${JSON.stringify(res.body)}`,
        );
      }
      expect(res.status).toBe(200);
    }

    // Next one should fail
    const blockedRes = await request(app)
      .post('/api/auth/google-drive/code')
      .send({ code });

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.error).toMatch(/too many requests/i);
  });

  it('should NOT rate limit other endpoints', async () => {
    // Send 25 requests to a different endpoint
    for (let i = 0; i < 25; i++) {
      // Just verify it doesn't 429. It might 400 or 404 but not 429.
      const res = await request(app).get('/api/albums');
      expect(res.status).not.toBe(429);
    }
  });
});
