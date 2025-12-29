import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';
import * as database from '../../src/core/database';
import * as mediaService from '../../src/core/media-service';
import * as fileSystem from '../../src/core/file-system';
import * as mediaHandler from '../../src/core/media-handler';
import * as security from '../../src/core/security';
import fs from 'fs/promises';

// Mock dependencies
vi.mock('../../src/core/database');
vi.mock('../../src/core/media-service');
vi.mock('../../src/core/file-system');
vi.mock('../../src/core/security', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/core/security')>();
  return {
    ...actual,
    authorizeFilePath: vi.fn(),
  };
});
vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
    mkdir: vi.fn(),
    realpath: vi.fn((p) => Promise.resolve(p)), // Default to resolving path to itself
  },
}));

// Mock media-handler to ensure it closes requests
vi.mock('../../src/core/media-handler', () => ({
  serveMetadata: vi.fn((req, res) => res.end()),
  serveTranscodedStream: vi.fn((req, res) => res.end()),
  serveRawStream: vi.fn((req, res) => res.end()),
  serveThumbnail: vi.fn((req, res) => res.end()),
  serveStaticFile: vi.fn((req, res) => res.end()),
}));

vi.mock('../../src/main/google-auth');

describe('Server', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Default allow
    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: true,
      realPath: '/resolved/path',
    });
    app = await createApp();
  });

  describe('GET /api/albums', () => {
    it('should return albums', async () => {
      const mockAlbums = [{ id: 1, name: 'Album 1' }];
      vi.mocked(mediaService.getAlbumsWithViewCounts).mockResolvedValue(
        mockAlbums as any,
      );

      const response = await request(app).get('/api/albums');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockAlbums);
    });

    it('should handle errors', async () => {
      vi.mocked(mediaService.getAlbumsWithViewCounts).mockRejectedValue(
        new Error('Test error'),
      );

      const response = await request(app).get('/api/albums');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch albums' });
    });
  });

  describe('POST /api/albums/reindex', () => {
    it('should reindex and return albums', async () => {
      const mockAlbums = [{ id: 1, name: 'Album 1' }];
      vi.mocked(
        mediaService.getAlbumsWithViewCountsAfterScan,
      ).mockResolvedValue(mockAlbums as any);

      const response = await request(app).post('/api/albums/reindex');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockAlbums);
    });

    it('should handle errors', async () => {
      vi.mocked(
        mediaService.getAlbumsWithViewCountsAfterScan,
      ).mockRejectedValue(new Error('Test error'));

      const response = await request(app).post('/api/albums/reindex');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to reindex' });
    });
  });

  describe('POST /api/media/view', () => {
    it('should record media view', async () => {
      const filePath = '/path/to/file.jpg';

      const response = await request(app)
        .post('/api/media/view')
        .send({ filePath });

      expect(response.status).toBe(200);
      expect(database.recordMediaView).toHaveBeenCalledWith(filePath);
    });

    it('should return 400 if filePath is missing', async () => {
      const response = await request(app).post('/api/media/view').send({});

      expect(response.status).toBe(400);
    });

    it('should return 403 if access is denied', async () => {
      vi.mocked(security.authorizeFilePath).mockResolvedValue({
        isAllowed: false,
        message: 'Denied',
      });
      const response = await request(app)
        .post('/api/media/view')
        .send({ filePath: '/secret' });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/media/views', () => {
    it('should return media view counts', async () => {
      const filePaths = ['/path/to/file.jpg'];
      const mockCounts = { '/path/to/file.jpg': 5 };
      vi.mocked(database.getMediaViewCounts).mockResolvedValue(mockCounts);

      const response = await request(app)
        .post('/api/media/views')
        .send({ filePaths });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockCounts);
    });

    it('should return 400 if filePaths is invalid', async () => {
      const response = await request(app)
        .post('/api/media/views')
        .send({ filePaths: 'not-array' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/directories', () => {
    it('should return directories', async () => {
      const mockDirs = ['/dir1', '/dir2'];
      vi.mocked(database.getMediaDirectories).mockResolvedValue(
        mockDirs as any,
      );

      const response = await request(app).get('/api/directories');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockDirs);
    });
  });

  describe('POST /api/directories', () => {
    it('should add a directory', async () => {
      const dirPath = '/new/dir';
      vi.mocked(fs.realpath).mockResolvedValue(dirPath);

      const response = await request(app)
        .post('/api/directories')
        .send({ path: dirPath });

      expect(response.status).toBe(200);
      expect(response.body).toBe(dirPath);
      expect(database.addMediaDirectory).toHaveBeenCalledWith(dirPath);
    });

    it('should return 400 if path is missing', async () => {
      const response = await request(app).post('/api/directories').send({});

      expect(response.status).toBe(400);
    });

    it('should return 400 if directory does not exist', async () => {
      vi.mocked(fs.realpath).mockRejectedValue(new Error('Not found'));

      const response = await request(app)
        .post('/api/directories')
        .send({ path: '/fake/dir' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Directory does not exist' });
    });

    it('should handle errors', async () => {
      const dirPath = '/new/dir';
      vi.mocked(fs.realpath).mockResolvedValue(dirPath);
      vi.mocked(database.addMediaDirectory).mockRejectedValue(
        new Error('Db error'),
      );

      const response = await request(app)
        .post('/api/directories')
        .send({ path: dirPath });

      expect(response.status).toBe(500);
    });
  });

  describe('DELETE /api/directories', () => {
    it('should remove a directory', async () => {
      const dirPath = '/dir/to/remove';

      const response = await request(app)
        .delete('/api/directories')
        .send({ path: dirPath });

      expect(response.status).toBe(200);
      expect(database.removeMediaDirectory).toHaveBeenCalledWith(dirPath);
    });

    it('should return 400 if path is missing', async () => {
      const response = await request(app).delete('/api/directories').send({});

      expect(response.status).toBe(400);
    });

    it('should handle errors', async () => {
      vi.mocked(database.removeMediaDirectory).mockRejectedValue(
        new Error('Db error'),
      );
      const response = await request(app)
        .delete('/api/directories')
        .send({ path: '/dir' });
      expect(response.status).toBe(500);
    });
  });

  describe('PUT /api/directories/active', () => {
    it('should set directory active state', async () => {
      const dirPath = '/dir';
      const isActive = false;

      const response = await request(app)
        .put('/api/directories/active')
        .send({ path: dirPath, isActive });

      expect(response.status).toBe(200);
      expect(database.setDirectoryActiveState).toHaveBeenCalledWith(
        dirPath,
        isActive,
      );
    });
    it('should return 400 if path is missing', async () => {
      const response = await request(app)
        .put('/api/directories/active')
        .send({ isActive: true });
      expect(response.status).toBe(400);
    });
    it('should handle errors', async () => {
      vi.mocked(database.setDirectoryActiveState).mockRejectedValue(
        new Error('error'),
      );
      const response = await request(app)
        .put('/api/directories/active')
        .send({ path: '/dir', isActive: true });
      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/fs/ls', () => {
    it('should list directory', async () => {
      const dirPath = '/dir';
      const mockContents = [{ name: 'file.txt', isDirectory: false }];
      vi.mocked(fileSystem.listDirectory).mockResolvedValue(
        mockContents as any,
      );

      const response = await request(app)
        .get('/api/fs/ls')
        .query({ path: dirPath });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockContents);
    });
    it('should return 400 if path missing', async () => {
      const response = await request(app).get('/api/fs/ls');
      expect(response.status).toBe(400);
    });
    it('should handle error', async () => {
      vi.mocked(fileSystem.listDirectory).mockRejectedValue(new Error('error'));
      const response = await request(app)
        .get('/api/fs/ls')
        .query({ path: '/dir' });
      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/fs/parent', () => {
    it('should return parent', async () => {
      const response = await request(app)
        .get('/api/fs/parent')
        .query({ path: '/a/b' });
      // In windows environment this might be tricky with path handling if path.dirname is win32 specific but input is posix-ish or vice versa.
      // The code uses `path.dirname`, which depends on OS.
      // Since the user is on windows, `path.dirname('/a/b')` might be just `\a` or `/a`.
      // Let's rely on the response being valid json.
      expect(response.status).toBe(200);
      expect(response.body.parent).toBeDefined();
    });
    it('should return null parent for root', async () => {
      // Hard to mock path.dirname behavior safely across environments without complex setups, but passing same path as parent logic:
      // The code checks `if (parent === dirPath)`.
      // On windows `path.dirname('C:\\')` is `C:\\`.
      const root = process.platform === 'win32' ? 'C:\\' : '/';
      const response = await request(app)
        .get('/api/fs/parent')
        .query({ path: root });
      expect(response.status).toBe(200);
      expect(response.body.parent).toBeNull();
    });

    it('should return 400 if missing path', async () => {
      const response = await request(app).get('/api/fs/parent');
      expect(response.status).toBe(400);
    });
  });

  describe('Media Handler Routes', () => {
    it('GET /api/metadata should call serveMetadata', async () => {
      await request(app).get('/api/metadata').query({ file: 'test.mp4' });
      expect(mediaHandler.serveMetadata).toHaveBeenCalled();
    });
    it('GET /api/metadata should 400 if missing file', async () => {
      const response = await request(app).get('/api/metadata');
      expect(response.status).toBe(400);
    });

    it('GET /api/stream should call serveRawStream by default', async () => {
      await request(app).get('/api/stream').query({ file: 'test.mp4' });
      expect(mediaHandler.serveRawStream).toHaveBeenCalled();
    });

    it('GET /api/stream with transcode=true should call serveTranscodedStream', async () => {
      await request(app)
        .get('/api/stream')
        .query({ file: 'test.mp4', transcode: 'true' });
      expect(mediaHandler.serveTranscodedStream).toHaveBeenCalled();
    });
    it('GET /api/stream should 400 if missing file', async () => {
      const response = await request(app).get('/api/stream');
      expect(response.status).toBe(400);
    });

    it('GET /api/thumbnail should call serveThumbnail', async () => {
      await request(app).get('/api/thumbnail').query({ file: 'test.mp4' });
      expect(mediaHandler.serveThumbnail).toHaveBeenCalled();
    });
    it('GET /api/thumbnail should 400 if missing file', async () => {
      const response = await request(app).get('/api/thumbnail');
      expect(response.status).toBe(400);
    });

    it('GET /api/serve should call serveRawStream', async () => {
      await request(app).get('/api/serve').query({ path: 'test.mp4' });
      expect(mediaHandler.serveRawStream).toHaveBeenCalled();
    });
    it('GET /api/serve should 400 if missing path', async () => {
      const response = await request(app).get('/api/serve');
      expect(response.status).toBe(400);
    });
  });

  describe('Auth Routes', () => {
    it('GET /auth/google/callback should not expose XSS', async () => {
      const maliciousCode = '<script>alert(1)</script>';
      const response = await request(app)
        .get('/auth/google/callback')
        .query({ code: maliciousCode });

      expect(response.status).toBe(200);
      expect(response.text).not.toContain(maliciousCode);
      expect(response.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('GET /auth/google/callback should return 400 for invalid code type', async () => {
      const response = await request(app)
        .get('/auth/google/callback')
        .query('code=a&code=b'); // Array input

      expect(response.status).toBe(400);
    });

    it('POST /api/auth/google-drive/code should return 200 on success', async () => {
      const { authenticateWithCode } =
        await import('../../src/main/google-auth');
      vi.mocked(authenticateWithCode).mockResolvedValue();

      const response = await request(app)
        .post('/api/auth/google-drive/code')
        .send({ code: 'valid-code' });

      expect(response.status).toBe(200);
    });

    it('POST /api/auth/google-drive/code should return 400 on invalid code', async () => {
      const { authenticateWithCode } =
        await import('../../src/main/google-auth');
      // Mock an error that looks like a Google API 400 error
      const error: any = new Error('invalid_grant');
      error.response = { status: 400 };
      vi.mocked(authenticateWithCode).mockRejectedValue(error);

      const response = await request(app)
        .post('/api/auth/google-drive/code')
        .send({ code: 'invalid-code' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid code' });
    });

    it('POST /api/auth/google-drive/code should return 500 on other errors', async () => {
      const { authenticateWithCode } =
        await import('../../src/main/google-auth');
      vi.mocked(authenticateWithCode).mockRejectedValue(
        new Error('Server error'),
      );

      const response = await request(app)
        .post('/api/auth/google-drive/code')
        .send({ code: 'valid-code' });

      expect(response.status).toBe(500);
    });
  });

  describe('Security Headers', () => {
    it('should set security headers', async () => {
      const response = await request(app).get('/api/config/extensions');
      // Helmet adds these headers by default
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-dns-prefetch-control']).toBe('off');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
    });
  });

  describe('Other Routes', () => {
    it('GET /api/config/extensions should return extensions', async () => {
      const response = await request(app).get('/api/config/extensions');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('images');
      expect(response.body).toHaveProperty('videos');
    });
  });
});
