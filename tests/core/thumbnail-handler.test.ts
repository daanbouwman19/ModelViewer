import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter, PassThrough } from 'stream';
import { serveThumbnail } from '../../src/core/thumbnail-handler';

const {
  mockSpawn,
  mockGetDriveFileThumbnail,
  mockAuthorizeFilePath,
  mockGetThumbnailCachePath,
  mockCheckThumbnailCache,
  mockFsCreateReadStream,
  mockFsCreateWriteStream,
  mockFsStat,
} = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockGetDriveFileThumbnail: vi.fn(),
  mockAuthorizeFilePath: vi.fn(),
  mockGetThumbnailCachePath: vi.fn(),
  mockCheckThumbnailCache: vi.fn(),
  mockFsCreateReadStream: vi.fn(),
  mockFsCreateWriteStream: vi.fn(),
  mockFsStat: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: mockSpawn,
  default: { spawn: mockSpawn },
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      promises: {
        ...actual.promises,
        stat: mockFsStat,
      },
      createReadStream: mockFsCreateReadStream,
      createWriteStream: mockFsCreateWriteStream,
    },
    promises: {
      ...actual.promises,
      stat: mockFsStat,
    },
    createReadStream: mockFsCreateReadStream,
    createWriteStream: mockFsCreateWriteStream,
  };
});

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    default: {
      ...actual,
      stat: mockFsStat,
    },
    stat: mockFsStat,
  };
});

// Mock dependencies
vi.mock('../../src/main/google-drive-service', () => ({
  getDriveFileThumbnail: mockGetDriveFileThumbnail,
}));

vi.mock('../../src/core/security', () => ({
  authorizeFilePath: mockAuthorizeFilePath,
}));

vi.mock('../../src/core/access-validator', () => ({
  validateFileAccess: vi.fn().mockImplementation(async (res, path) => {
    // Mocking validateFileAccess logic for local files
    const { authorizeFilePath } = await import('../../src/core/security');
    if (path.startsWith('gdrive://')) return true;
    try {
      const auth = await authorizeFilePath(path);
      if (!auth.isAllowed) {
        if (!res.headersSent) res.status(403).send('Access denied.');
        return false;
      }
      return true;
    } catch {
      if (!res.headersSent) res.status(500).send('Internal server error.');
      return false;
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawn.mockReset();

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

  describe('serveThumbnail', () => {
    it('serves from cache if available', async () => {
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

      await new Promise((r) => setTimeout(r, 0));
      mockStream.emit('open');
      mockStream.emit('end');

      await promise;

      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({ 'Content-Type': 'image/jpeg' }),
      );
      expect(mockFsCreateReadStream).toHaveBeenCalledWith(cachePath);
      expect((mockStream as any).pipe).toHaveBeenCalledWith(res);
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
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      mockGetThumbnailCachePath.mockReturnValue('/cache/local.jpg');

      const mockProcess = {
        on: vi.fn().mockImplementation((event, cb) => {
          if (event === 'close') cb(0);
        }),
        stderr: { on: vi.fn() },
      };
      mockSpawn.mockReturnValue(mockProcess);

      mockFsStat.mockResolvedValue({} as any);

      const mockStream = { pipe: vi.fn(), on: vi.fn() };
      mockFsCreateReadStream.mockReturnValue(mockStream as any);

      await serveThumbnail(req, res, '/video.mp4', 'ffmpeg', '/cache');

      expect(mockSpawn).toHaveBeenCalled();
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({ 'Content-Type': 'image/jpeg' }),
      );
      expect(mockFsCreateReadStream).toHaveBeenCalledWith('/cache/local.jpg');
      expect(mockStream.pipe).toHaveBeenCalledWith(res);
    });

    it('handles ffmpeg failure (non-zero exit)', async () => {
      mockCheckThumbnailCache.mockResolvedValue(false);
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });

      const mockProcess = {
        on: vi.fn().mockImplementation((event, cb) => {
          if (event === 'close') cb(1);
        }),
        stderr: { on: vi.fn() },
      };
      mockSpawn.mockReturnValue(mockProcess);

      await serveThumbnail(req, res, '/video.mp4', 'ffmpeg', '/cache');

      // wait for async
      await new Promise((r) => setTimeout(r, 0));

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Generation failed');
    });

    it('collects stderr output', async () => {
      mockCheckThumbnailCache.mockResolvedValue(false);
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new PassThrough();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = vi.fn();
      mockSpawn.mockReturnValue(mockProcess);

      const promise = serveThumbnail(
        req,
        res,
        '/video.mp4',
        'ffmpeg',
        '/cache',
      );

      await new Promise((r) => setTimeout(r, 0)); // wait for spawn

      mockProcess.stderr.emit('data', 'Error output');
      mockProcess.emit('close', 1);

      await promise;
    });

    it('handles ffmpeg close success but file missing', async () => {
      mockCheckThumbnailCache.mockResolvedValue(false);
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      const mockProcess = new EventEmitter() as any;
      mockProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValue(mockProcess);

      mockFsStat.mockRejectedValue(new Error('ENOENT'));

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const p = serveThumbnail(req, res, '/video.mp4', 'ffmpeg', '/cache');

      await new Promise((r) => setTimeout(r, 0));
      mockProcess.emit('close', 0);

      // Wait for error handling
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0)); // extra tick

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Generation failed');
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Thumbnail] Generation failed:',
        expect.anything(),
      );
      await p;
      consoleSpy.mockRestore();
    });

    it('handles spawn error', async () => {
      mockCheckThumbnailCache.mockResolvedValue(false);
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      const mockProcess = new EventEmitter() as any;
      mockProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValue(mockProcess);

      const p = serveThumbnail(req, res, '/video.mp4', 'ffmpeg', '/cache');

      await new Promise((r) => setTimeout(r, 0));
      mockProcess.emit('error', new Error('Spawn failed'));

      // wait for async
      await new Promise((r) => setTimeout(r, 0));

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Generation failed');
      await p;
    });

    it('returns 500 if ffmpeg binary is not found', async () => {
      mockCheckThumbnailCache.mockResolvedValue(false);
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });

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

      // Since we want to test fallback to generation, we need to setup generation mocks
      const mockProcess = {
        on: vi.fn().mockImplementation((event, cb) => {
          if (event === 'close') cb(0);
        }),
        stderr: { on: vi.fn() },
      };
      mockSpawn.mockReturnValue(mockProcess);
      mockFsStat.mockResolvedValue({} as any);

      const mockGenStream = { pipe: vi.fn(), on: vi.fn() };
      // First call for cache read, second for gen read
      mockFsCreateReadStream
        .mockReturnValueOnce(mockStream as any)
        .mockReturnValueOnce(mockGenStream as any);


      const promise = serveThumbnail(req, res, '/video.mp4', 'ffmpeg', '/cache');

      await new Promise((r) => setTimeout(r, 0));
      mockStream.emit('error', new Error('Cache read failed'));

      // Should fall back to generation
      await promise;

      expect(mockSpawn).toHaveBeenCalled();
    });

    it('handles stream error during sending generated file', async () => {
      mockCheckThumbnailCache.mockResolvedValue(false);
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      mockGetThumbnailCachePath.mockReturnValue('/cache/local.jpg');

      const mockProcess = {
        on: vi.fn().mockImplementation((event, cb) => {
          if (event === 'close') cb(0);
        }),
        stderr: { on: vi.fn() },
      };
      mockSpawn.mockReturnValue(mockProcess);
      mockFsStat.mockResolvedValue({} as any);

      const mockStream = new EventEmitter();
      (mockStream as any).pipe = vi.fn();
      mockFsCreateReadStream.mockReturnValue(mockStream as any);

      const promise = serveThumbnail(req, res, '/video.mp4', 'ffmpeg', '/cache');

      await new Promise((r) => setTimeout(r, 0)); // wait for spawn

      mockStream.emit('error', new Error('Stream error'));

      await promise;

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.end).toHaveBeenCalled();
    });
  });
});
