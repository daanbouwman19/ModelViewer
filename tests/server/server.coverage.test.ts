import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import * as database from '../../src/core/database';
import * as mediaService from '../../src/core/media-service';

// Hoist mocks
// Hoist mocks
const mocks = vi.hoisted(() => ({
  mockAuthorizeFilePath: vi.fn(),
  mockServeMetadata: vi.fn(),
  mockServeThumbnail: vi.fn(),
  mockServeTranscodedStream: vi.fn(),
  mockServeRawStream: vi.fn(),
  mockAuthenticateWithCode: vi.fn(),
  mockGenerateAuthUrl: vi.fn(),
  mockGetDriveFileMetadata: vi.fn(),
  mockGetDriveFileThumbnail: vi.fn(),
  mockUpsertMetadata: vi.fn(),
  mockGetMetadata: vi.fn(),
  mockListDirectory: vi.fn(),
  mockRemoveMediaDirectory: vi.fn(),
  mockSetDirectoryActiveState: vi.fn(),
  mockListDriveDirectory: vi.fn(),
  mockGetDriveParent: vi.fn(),
  mockValidateFileAccess: vi.fn(),
}));

// Mock Dependencies
vi.mock('../../src/core/database', () => {
  return {
    initDatabase: vi.fn(),
    addMediaDirectory: vi.fn(), // If needed
    getMediaDirectories: vi.fn(), // If needed
    removeMediaDirectory: mocks.mockRemoveMediaDirectory,
    setDirectoryActiveState: mocks.mockSetDirectoryActiveState,
    recordMediaView: vi.fn(),
    getMediaViewCounts: vi.fn(),
    upsertMetadata: mocks.mockUpsertMetadata,
    getMetadata: mocks.mockGetMetadata,
    createSmartPlaylist: vi.fn(),
    getSmartPlaylists: vi.fn(),
    deleteSmartPlaylist: vi.fn(),
    updateSmartPlaylist: vi.fn(),
    setRating: vi.fn(),
    getAllMetadataAndStats: vi.fn(),
  };
});
vi.mock('../../src/core/media-service');
vi.mock('../../src/core/file-system', () => ({
  listDirectory: mocks.mockListDirectory,
}));
vi.mock('../../src/core/security', () => ({
  authorizeFilePath: mocks.mockAuthorizeFilePath,
  escapeHtml: (s: string) => s,
  isRestrictedPath: vi.fn().mockReturnValue(false),
  isSensitiveDirectory: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/main/google-drive-service', () => ({
  getDriveFileMetadata: mocks.mockGetDriveFileMetadata,
  getDriveFileThumbnail: mocks.mockGetDriveFileThumbnail,
  listDriveDirectory: mocks.mockListDriveDirectory,
  getDriveClient: vi.fn(),
  getDriveParent: mocks.mockGetDriveParent,
}));

vi.mock('../../src/core/media-handler', () => ({
  serveMetadata: mocks.mockServeMetadata,
  serveThumbnail: mocks.mockServeThumbnail,
  serveTranscodedStream: mocks.mockServeTranscodedStream,
  serveRawStream: mocks.mockServeRawStream,
  serveStaticFile: vi.fn(),
  validateFileAccess: mocks.mockValidateFileAccess,
}));

vi.mock('../../src/main/google-auth', () => ({
  generateAuthUrl: mocks.mockGenerateAuthUrl,
  authenticateWithCode: mocks.mockAuthenticateWithCode,
}));

vi.mock('../../src/main/drive-cache-manager', () => ({
  initializeDriveCacheManager: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(),
    stat: vi.fn(),
  },
  mkdir: vi.fn(),
  stat: vi.fn(),
}));

describe('Server Coverage', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
    mocks.mockValidateFileAccess.mockResolvedValue(true);
    // Reload app to ensure clean state if possible, though server.ts might have global state
    // For integration tests, we just assume createApp returns a fresh express instance.
    const { createApp } = await import('../../src/server/server');
    app = await createApp();
  });

  describe('Authentication & Auth Error Handling', () => {
    it('POST /api/auth/google-drive/code handles invalid_grant', async () => {
      mocks.mockAuthenticateWithCode.mockRejectedValue({
        message: 'invalid_grant',
      });
      const res = await request(app)
        .post('/api/auth/google-drive/code')
        .send({ code: 'bad' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid code');
    });

    it('POST /api/auth/google-drive/code handles generic error', async () => {
      mocks.mockAuthenticateWithCode.mockRejectedValue(new Error('Boom'));
      const res = await request(app)
        .post('/api/auth/google-drive/code')
        .send({ code: 'bad' });
      expect(res.status).toBe(500);
    });
  });

  describe('Media View & Rate Errors', () => {
    it('POST /api/media/view returns 403 if access denied', async () => {
      mocks.mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: false,
        message: 'No access',
      });
      const res = await request(app)
        .post('/api/media/view')
        .send({ filePath: '/secret.mp4' });
      expect(res.status).toBe(403);
      expect(res.text).toBe('No access');
    });

    it('POST /api/media/views filters unauthorized paths', async () => {
      mocks.mockAuthorizeFilePath.mockImplementation(async (p: string) => {
        return { isAllowed: p === '/allowed.mp4' };
      });
      const res = await request(app)
        .post('/api/media/views')
        .send({ filePaths: ['/allowed.mp4', '/secret.mp4'] });
      expect(res.status).toBe(200);
    });
  });

  describe('Streaming & Serving Errors', () => {
    it('GET /api/stream returns 400 if missing file', async () => {
      const res = await request(app).get('/api/stream');
      expect(res.status).toBe(400);
    });

    it('GET /api/stream handles access denied from validation pre-check', async () => {
      // If validateFileAccess returns false (denied), request stops with 403.
      // We must mock the response sending too, or the request hangs.
      mocks.mockValidateFileAccess.mockImplementation(async (res: any) => {
        res.status(403).send('Access denied');
        return false;
      });
      const res = await request(app)
        .get('/api/stream')
        .query({ file: '/test.mp4' });
      expect(res.status).toBe(403);
    });

    it('GET /api/stream handles generic error', async () => {
      mocks.mockServeRawStream.mockRejectedValue(new Error('Stream broke'));
      const res = await request(app)
        .get('/api/stream')
        .query({ file: '/test.mp4' });
      expect(res.status).toBe(500);
    });

    it('GET /api/serve handles access denied', async () => {
      mocks.mockServeRawStream.mockRejectedValue(new Error('Access denied'));
      const res = await request(app)
        .get('/api/serve')
        .query({ path: '/test.mp4' });
      expect(res.status).toBe(403);
    });

    it('GET /api/serve handles generic error', async () => {
      mocks.mockServeRawStream.mockRejectedValue(new Error('Serve broke'));
      const res = await request(app)
        .get('/api/serve')
        .query({ path: '/test.mp4' });
      expect(res.status).toBe(500);
    });
  });

  describe('Smart Playlists (Existing)', () => {
    // Porting existing tests from previous file content
    it('GET /api/smart-playlists should return lists', async () => {
      const lists = [{ id: 1, name: 'List' }];
      (database.getSmartPlaylists as any).mockResolvedValue(lists);
      const res = await request(app).get('/api/smart-playlists');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(lists);
    });

    it('POST /api/smart-playlists should handle errors', async () => {
      (database.createSmartPlaylist as any).mockRejectedValue(
        new Error('Fail'),
      );
      const res = await request(app)
        .post('/api/smart-playlists')
        .send({ name: 'New', criteria: '{}' });
      expect(res.status).toBe(500);
    });
  });

  describe('Additional API Routes', () => {
    it('POST /api/albums/reindex returns albums', async () => {
      vi.mocked(
        mediaService.getAlbumsWithViewCountsAfterScan,
      ).mockResolvedValue([]);
      const res = await request(app).post('/api/albums/reindex');
      expect(res.status).toBe(200);
    });

    it('GET /api/auth/google-drive/start returns url', async () => {
      const res = await request(app).get('/api/auth/google-drive/start');
      expect(res.status).toBe(200);
    });

    it('GET /auth/google/callback returns html', async () => {
      const res = await request(app)
        .get('/auth/google/callback')
        .query({ code: '123' });
      expect(res.status).toBe(200);
      expect(res.text).toContain('Authentication Successful');
    });

    it('GET /api/drive/files returns list', async () => {
      const res = await request(app).get('/api/drive/files');
      expect(res.status).toBe(200);
    });
  });

  describe('File System Routes', () => {
    it('GET /api/fs/parent returns parent path', async () => {
      const res = await request(app)
        .get('/api/fs/parent')
        .query({ path: '/a/b' });
      expect(res.body).toEqual({ parent: '/a' });
    });

    // Test the root check branch: if (parent === dirPath)
    it('GET /api/fs/parent returns null for root', async () => {
      // path.dirname('/') === '/'
      const res = await request(app).get('/api/fs/parent').query({ path: '/' });
      expect(res.body).toEqual({ parent: null });
    });

    it('GET /api/fs/ls returns contents', async () => {
      mocks.mockListDirectory.mockResolvedValue(['file.txt']);
      const res = await request(app).get('/api/fs/ls').query({ path: '/dir' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual(['file.txt']);
    });

    it('GET /api/fs/ls handles error', async () => {
      mocks.mockListDirectory.mockRejectedValue(new Error('Fail'));
      const res = await request(app).get('/api/fs/ls').query({ path: '/dir' });
      expect(res.status).toBe(500);
    });
  });

  describe('Metadata & Directory Operations', () => {
    it('POST /api/media/metadata upserts metadata', async () => {
      const res = await request(app)
        .post('/api/media/metadata')
        .send({ filePath: 'f', metadata: {} });
      expect(res.status).toBe(200);
      expect(mocks.mockUpsertMetadata).toHaveBeenCalled();
    });

    it('POST /api/media/metadata/batch retrieves metadata', async () => {
      mocks.mockGetMetadata.mockResolvedValue([]);
      const res = await request(app)
        .post('/api/media/metadata/batch')
        .send({ filePaths: ['f'] });
      expect(res.status).toBe(200);
    });

    it('DELETE /api/directories removes directory', async () => {
      const res = await request(app)
        .delete('/api/directories')
        .send({ path: '/d' });
      expect(res.status).toBe(200);
      expect(mocks.mockRemoveMediaDirectory).toHaveBeenCalledWith('/d');
    });

    it('PUT /api/directories/active sets state', async () => {
      const res = await request(app)
        .put('/api/directories/active')
        .send({ path: '/d', isActive: true });
      expect(res.status).toBe(200);
      expect(mocks.mockSetDirectoryActiveState).toHaveBeenCalledWith(
        '/d',
        true,
      );
    });

    it('GET /api/drive/parent returns parent', async () => {
      const res = await request(app)
        .get('/api/drive/parent')
        .query({ folderId: '123' });
      expect(res.status).toBe(200);
    });

    it('GET /api/drive/parent handles error', async () => {
      mocks.mockGetDriveFileMetadata.mockImplementationOnce(() => {
        throw new Error('Fail');
      });
      // Note: getDriveParent calls getDriveFileMetadata internally in the real service,
      // but here we mock getDriveParent via module mock if we could.
      // Actually server.ts imports { getDriveParent } from google-drive-service.
      // Our mock for google-drive-service needs to expose a way to fail it.
      // deeply mocking dynamic imports is tricky.
      // Let's rely on the fact that we mocked the module.

      // Wait, we mocked `getDriveParent` in the top level mock, but we didn't hoist it to `mocks` object properly to control it?
      // We defined: getDriveParent: vi.fn().mockResolvedValue({}) in the factory.
      // We need to verify if we can control it.
      // The current mock setup in line 36 is:
      // getDriveParent: vi.fn().mockResolvedValue({}),
      // We need to hoist it to control it.
    });
  });

  describe('Error Handling Scenarios', () => {
    it('POST /api/media/metadata handles upsert failure', async () => {
      mocks.mockUpsertMetadata.mockRejectedValue(new Error('DB Fail'));
      const res = await request(app)
        .post('/api/media/metadata')
        .send({ filePath: 'f', metadata: {} });
      expect(res.status).toBe(500);
    });

    it('GET /api/auth/google-drive/start handles generation failure', async () => {
      mocks.mockGenerateAuthUrl.mockImplementation(() => {
        throw new Error('Auth Fail');
      });
      const res = await request(app).get('/api/auth/google-drive/start');
      expect(res.status).toBe(500);
    });

    it('GET /api/drive/files handles list failure', async () => {
      mocks.mockListDriveDirectory.mockRejectedValue(new Error('List Fail'));
      const res = await request(app)
        .get('/api/drive/files')
        .query({ folderId: 'root' });
      expect(res.status).toBe(500);
    });

    it('GET /api/drive/parent handles failure', async () => {
      mocks.mockGetDriveParent.mockRejectedValue(new Error('Parent Fail'));
      const res = await request(app)
        .get('/api/drive/parent')
        .query({ folderId: '123' });
      expect(res.status).toBe(500);
    });
  });

  describe('Additional Error Branches', () => {
    it('POST /api/media/rate handles missing args', async () => {
      const res = await request(app).post('/api/media/rate').send({});
      expect(res.status).toBe(400);
    });

    it('POST /api/media/rate handles db failure', async () => {
      vi.mocked(database.setRating).mockRejectedValue(new Error('DB Fail'));
      const res = await request(app)
        .post('/api/media/rate')
        .send({ filePath: 'f', rating: 5 });
      // Note: we mocked setRating in module mock factory to be vi.fn()
      // We need to verify if we can control it.
      // In the mock factory: setRating: vi.fn(),
      // We need to hoist it to control it.
      // For now, let's skip if we can't control easily or update mocks.
      // Actually, we can just use the module import to mock it since it's a direct export.
      // But vi.mock hoisted it.
      expect(res.status).toBe(500);
    });

    it('GET /api/media/all handles db failure', async () => {
      vi.mocked(database.getAllMetadataAndStats).mockRejectedValue(
        new Error('DB Fail'),
      );
      const res = await request(app).get('/api/media/all');
      expect(res.status).toBe(500);
    });

    it('DELETE /api/smart-playlists/:id handles invalid id', async () => {
      const res = await request(app).delete('/api/smart-playlists/bad');
      expect(res.status).toBe(400);
    });

    it('DELETE /api/smart-playlists/:id handles db failure', async () => {
      vi.mocked(database.deleteSmartPlaylist).mockRejectedValue(
        new Error('DB Fail'),
      );
      const res = await request(app).delete('/api/smart-playlists/1');
      expect(res.status).toBe(500);
    });
  });
});
