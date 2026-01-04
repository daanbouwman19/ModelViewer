import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';
import { validateFileAccess, serveRawStream } from '../../src/core/media-handler';
import { createMediaSource } from '../../src/core/media-source';

// Mock dependencies
vi.mock('../../src/core/database', () => ({
  initDatabase: vi.fn(),
  getMediaDirectories: vi.fn().mockResolvedValue([]),
  getAlbumsWithViewCounts: vi.fn(),
  getAlbumsWithViewCountsAfterScan: vi.fn(),
  recordMediaView: vi.fn(),
  getMediaViewCounts: vi.fn(),
  getRecentlyPlayed: vi.fn(),
  addMediaDirectory: vi.fn(),
  removeMediaDirectory: vi.fn(),
  setDirectoryActiveState: vi.fn(),
}));
vi.mock('../../src/core/media-service', () => ({}));
vi.mock('../../src/core/media-handler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/media-handler')>();
  return {
    ...actual,
    validateFileAccess: vi.fn(),
    serveRawStream: vi.fn((req, res) => res.end()), // Fix: Ensure response is ended
  };
});
vi.mock('../../src/core/media-source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/media-source')>();
  return {
    ...actual,
    createMediaSource: vi.fn(),
  };
});
vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
    mkdir: vi.fn(),
    realpath: vi.fn(),
  },
}));

// Mock drive-cache-manager to avoid init issues
vi.mock('../../src/main/drive-cache-manager', () => ({
  initializeDriveCacheManager: vi.fn(),
}));

vi.mock('../../src/main/google-auth', () => ({
  generateAuthUrl: vi.fn(),
  authenticateWithCode: vi.fn(),
}));

vi.mock('../../src/main/google-drive-service', () => ({
  getDriveClient: vi.fn(),
  listDriveDirectory: vi.fn(),
  getDriveParent: vi.fn(),
}));

// Mock process.cwd to something stable
vi.spyOn(process, 'cwd').mockReturnValue('/app');

describe('Server Endpoint Security', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  describe('GET /api/serve', () => {
    it('should explicitly validate file access before serving', async () => {
      const filePath = '/unauthorized/file.mp4';

      // Mock validation to fail AND send response (simulating real behavior)
      vi.mocked(validateFileAccess).mockImplementation(async (res) => {
        // Just send a status code so supertest doesn't hang
        // The real function sends 403, but here we just need to ensure 'res' is used
        // so the request completes.
        res.status(403).end();
        return false;
      });

      const response = await request(app)
        .get('/api/serve')
        .query({ path: filePath });

      expect(response.status).toBe(403);
      // Should verify that validateFileAccess was called
      expect(validateFileAccess).toHaveBeenCalledWith(expect.anything(), filePath);

      // Should verify that createMediaSource was NOT called (short-circuit)
      expect(createMediaSource).not.toHaveBeenCalled();
      expect(serveRawStream).not.toHaveBeenCalled();
    });

    it('should proceed if validation passes', async () => {
      const filePath = '/authorized/file.mp4';

      // Mock validation to pass
      vi.mocked(validateFileAccess).mockResolvedValue(true);

      await request(app)
        .get('/api/serve')
        .query({ path: filePath });

      expect(validateFileAccess).toHaveBeenCalledWith(expect.anything(), filePath);
      expect(createMediaSource).toHaveBeenCalledWith(filePath);
      expect(serveRawStream).toHaveBeenCalled();
    });
  });
});
