import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'stream';
import fs from 'fs'; // Import for spying
import {
  serveThumbnail,
  generateLocalThumbnail,
} from '../../src/core/thumbnail-handler';

const {
  mockRunFFmpeg,
  mockGetDriveFileThumbnail,
  mockAuthorizeFilePath,
  mockGetThumbnailCachePath,
  mockCheckThumbnailCache,
} = vi.hoisted(() => ({
  mockRunFFmpeg: vi.fn(),
  mockGetDriveFileThumbnail: vi.fn(),
  mockAuthorizeFilePath: vi.fn(),
  mockGetThumbnailCachePath: vi.fn(),
  mockCheckThumbnailCache: vi.fn(),
}));

// REMOVED vi.mock('fs') and vi.mock('fs/promises')

// Mock dependencies
vi.mock('../../src/main/google-drive-service', () => ({
  getDriveFileThumbnail: mockGetDriveFileThumbnail,
}));

vi.mock('../../src/core/security', () => ({
  authorizeFilePath: mockAuthorizeFilePath,
}));

vi.mock('../../src/core/access-validator', () => ({
  validateFileAccess: vi.fn().mockImplementation(async (path) => {
    // Mocking validateFileAccess logic for local files
    // Dynamic import to get the mocked authorizeFilePath
    const { authorizeFilePath } = await import('../../src/core/security');
    if (path.startsWith('gdrive://')) return { success: true, path };
    try {
      const auth = await authorizeFilePath(path);
      if (!auth.isAllowed) {
        return { success: false, error: 'Access denied.', statusCode: 403 };
      }
      return { success: true, path: auth.realPath || path };
    } catch {
      return {
        success: false,
        error: 'Internal server error.',
        statusCode: 500,
      };
    }
  }),
}));

vi.mock('../../src/core/media-utils', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/core/media-utils')>();
  return {
    ...actual,
    getThumbnailCachePath: mockGetThumbnailCachePath,
    checkThumbnailCache: mockCheckThumbnailCache,
  };
});

vi.mock('../../src/core/utils/ffmpeg-utils', () => ({
  getThumbnailArgs: vi.fn(),
  runFFmpeg: mockRunFFmpeg,
}));

vi.mock('../../src/core/fs-provider-factory', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/core/fs-provider-factory')>();
  return {
    ...actual,
    getProvider: vi.fn().mockImplementation(actual.getProvider),
  };
});

describe('thumbnail-handler unit tests', () => {
  let req: any;
  let res: any;

  let mockFsStat: any;
  let mockFsCreateReadStream: any;
  let mockFsCreateWriteStream: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset persistent mocks
    mockRunFFmpeg.mockReset();
    mockGetDriveFileThumbnail.mockReset();
    mockAuthorizeFilePath.mockReset();
    mockGetThumbnailCachePath.mockReset();
    mockCheckThumbnailCache.mockReset();

    // Setup spies
    mockFsStat = vi.spyOn(fs.promises, 'stat');
    mockFsCreateReadStream = vi.spyOn(fs, 'createReadStream');
    mockFsCreateWriteStream = vi.spyOn(fs, 'createWriteStream');

    // Default implementations
    mockFsStat.mockResolvedValue({ size: 1000 });

    mockFsCreateReadStream.mockImplementation(() => {
      const s = new EventEmitter();
      setTimeout(() => s.emit('open', 1), 0);
      return s;
    });

    mockFsCreateWriteStream.mockReturnValue(new EventEmitter());

    // Default mock implementation for authorizeFilePath
    mockAuthorizeFilePath.mockResolvedValue({
      isAllowed: true,
      realPath: '/test/path',
    });

    req = {};
    res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
      set: vi.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('serveThumbnail', () => {
    it('serves from cache if available', async () => {
      // Must allow file access first
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: true,
        realPath: '/local/file',
      });

      const cachePath = '/cache/thumb.jpg';
      mockGetThumbnailCachePath.mockReturnValue(cachePath);
      mockCheckThumbnailCache.mockResolvedValue(true);

      const mockStream = new EventEmitter();
      (mockStream as any).pipe = vi.fn();

      mockFsCreateReadStream.mockReturnValue(mockStream as any);

      const promise = serveThumbnail(
        req,
        res,
        '/video.mp4',
        'ffmpeg',
        '/cache',
      );

      // Wait for stream to be created (which happens after async auth check)
      await new Promise<void>((resolve) => {
        const check = () => {
          if (mockFsCreateReadStream.mock.calls.length > 0) {
            resolve();
          } else {
            setTimeout(check, 10);
          }
        };
        check();
      });

      mockStream.emit('open');
      mockStream.emit('end');

      await promise;

      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({ 'Content-Type': 'image/jpeg' }),
      );
      expect(mockFsCreateReadStream).toHaveBeenCalledWith(cachePath);
      expect((mockStream as any).pipe).toHaveBeenCalledWith(res);
    });

    it('should BLOCK thumbnail if file is unauthorized EVEN IF cached', async () => {
      // 1. Setup unauthorized file access
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: false,
        message: 'Access denied',
      });

      // 2. Setup CACHE HIT
      mockCheckThumbnailCache.mockResolvedValue(true);

      await serveThumbnail(req, res, '/secret/video.mp4', 'ffmpeg', '/cache');

      // Expect 403 Forbidden because access check should happen before cache check
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access denied.');
      // Should NOT have attempted to read cache stream
      expect(mockFsCreateReadStream).not.toHaveBeenCalled();
    });

    it('generates thumbnail for gdrive file', async () => {
      mockCheckThumbnailCache.mockResolvedValue(false);
      mockGetThumbnailCachePath.mockReturnValue('/cache/gdrive.jpg');

      const mockDriveStream = { pipe: vi.fn() };
      mockGetDriveFileThumbnail.mockResolvedValue(mockDriveStream);

      const mockWriteStream = {};
      mockFsCreateWriteStream.mockReturnValue(mockWriteStream as any);

      await serveThumbnail(req, res, 'gdrive://123', 'ffmpeg', '/cache');

      expect(mockGetDriveFileThumbnail).toHaveBeenCalledWith('123');
      expect(mockDriveStream.pipe).toHaveBeenCalledWith(expect.anything());
      expect(mockDriveStream.pipe).toHaveBeenCalledWith(res);
    });

    it('returns 404 if drive fetch fails', async () => {
      mockCheckThumbnailCache.mockResolvedValue(false);
      mockGetThumbnailCachePath.mockReturnValue('/cache/gdrive.jpg');
      mockGetDriveFileThumbnail.mockRejectedValue(new Error('Drive error'));

      await serveThumbnail(req, res, 'gdrive://123', 'ffmpeg', '/cache');

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.end).toHaveBeenCalled();
    });

    it('returns 500 if local file access denied', async () => {
      mockCheckThumbnailCache.mockResolvedValue(false);
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: false });

      await serveThumbnail(req, res, '/local/vid.mp4', 'ffmpeg', '/cache');

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access denied.');
    });

    it('returns 500 if auth threw error', async () => {
      mockCheckThumbnailCache.mockResolvedValue(false);
      mockAuthorizeFilePath.mockRejectedValue(new Error('Auth fail'));
      await serveThumbnail(req, res, '/local/vid.mp4', 'ffmpeg', '/cache');
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Internal server error.');
    });

    it('handles ffmpg generation for local file', async () => {
      mockCheckThumbnailCache.mockResolvedValue(false);
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: true,
        realPath: '/local/file',
      });
      mockGetThumbnailCachePath.mockReturnValue('/cache/local.jpg');

      // Mock runFFmpeg success
      mockRunFFmpeg.mockResolvedValue({ code: 0, stderr: '' });

      mockFsStat.mockResolvedValue({} as any);

      const mockStream = { pipe: vi.fn(), on: vi.fn() };
      mockFsCreateReadStream.mockReturnValue(mockStream as any);

      await serveThumbnail(req, res, '/video.mp4', 'ffmpeg', '/cache');

      expect(mockRunFFmpeg).toHaveBeenCalled();
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({ 'Content-Type': 'image/jpeg' }),
      );
      expect(mockFsCreateReadStream).toHaveBeenCalledWith('/cache/local.jpg');
      expect(mockStream.pipe).toHaveBeenCalledWith(res);
    });

    it('handles ffmpeg failure (non-zero exit)', async () => {
      mockCheckThumbnailCache.mockResolvedValue(false);
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: true,
        realPath: '/local/file',
      });

      // Mock runFFmpeg failure
      mockRunFFmpeg.mockResolvedValue({ code: 1, stderr: 'Error' });

      await serveThumbnail(req, res, '/video.mp4', 'ffmpeg', '/cache');

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Generation failed');
    });

    it('handles ffmpeg close success but file missing', async () => {
      mockCheckThumbnailCache.mockResolvedValue(false);
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: true,
        realPath: '/local/file',
      });

      // Success but no file created
      mockRunFFmpeg.mockResolvedValue({ code: 0, stderr: '' });

      mockFsStat.mockRejectedValue(new Error('ENOENT'));

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await serveThumbnail(req, res, '/video.mp4', 'ffmpeg', '/cache');

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Generation failed');
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Thumbnail] Generation failed:',
        expect.anything(),
      );
      consoleSpy.mockRestore();
    });

    it('handles runFFmpeg error (e.g. timeout)', async () => {
      mockCheckThumbnailCache.mockResolvedValue(false);
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: true,
        realPath: '/local/file',
      });

      mockRunFFmpeg.mockRejectedValue(new Error('Process timed out'));

      await serveThumbnail(req, res, '/video.mp4', 'ffmpeg', '/cache');

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Generation failed');
    });

    it('returns 500 if ffmpeg binary is not found', async () => {
      mockCheckThumbnailCache.mockResolvedValue(false);
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: true,
        realPath: '/local/file',
      });

      await serveThumbnail(req, res, '/video.mp4', null, '/cache');

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('FFmpeg binary not found');
    });

    it('handles cache stream error', async () => {
      const cachePath = '/cache/thumb.jpg';
      mockGetThumbnailCachePath.mockReturnValue(cachePath);
      mockCheckThumbnailCache.mockResolvedValue(true);

      const mockStream = new EventEmitter();
      (mockStream as any).pipe = vi.fn();
      mockFsCreateReadStream.mockReturnValue(mockStream as any);

      // Setup generation mocks for fallback
      mockRunFFmpeg.mockResolvedValue({ code: 0, stderr: '' });
      mockFsStat.mockResolvedValue({} as any);

      const mockGenStream = { pipe: vi.fn(), on: vi.fn() };
      // First call for cache read, second for gen read
      mockFsCreateReadStream
        .mockReturnValueOnce(mockStream as any)
        .mockReturnValueOnce(mockGenStream as any);

      const promise = serveThumbnail(
        req,
        res,
        '/video.mp4',
        'ffmpeg',
        '/cache',
      );

      await new Promise((r) => setTimeout(r, 0));
      mockStream.emit('error', new Error('Cache read failed'));

      // Should fall back to generation
      await promise;

      expect(mockRunFFmpeg).toHaveBeenCalled();
    });

    it('handles stream error during sending generated file', async () => {
      mockCheckThumbnailCache.mockResolvedValue(false);
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: true,
        realPath: '/local/file',
      });
      mockGetThumbnailCachePath.mockReturnValue('/cache/local.jpg');

      mockRunFFmpeg.mockResolvedValue({ code: 0, stderr: '' });
      mockFsStat.mockResolvedValue({} as any);

      const mockStream = new EventEmitter();
      (mockStream as any).pipe = vi.fn();
      mockFsCreateReadStream.mockReturnValue(mockStream as any);

      const promise = serveThumbnail(
        req,
        res,
        '/video.mp4',
        'ffmpeg',
        '/cache',
      );

      await promise;

      // Simulate stream error after pipe
      mockStream.emit('error', new Error('Stream error'));

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('generateLocalThumbnail', () => {
    it('returns error if file access fails', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: false });
      await generateLocalThumbnail(res, '/denied.mp4', '/cache.jpg', 'ffmpeg');
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access denied.');
    });
  });
});
