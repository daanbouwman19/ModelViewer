import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  serveStaticFile,
  serveMetadata,
  serveTranscode,
  serveThumbnail,
  getMimeType,
  getVideoDuration,
  createMediaRequestHandler,
} from '../../src/core/media-handler';
import * as security from '../../src/core/security';
import fs from 'fs';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { driveCacheManager } from '../../src/main/drive-cache-manager';
import * as mediaUtils from '../../src/core/media-utils';
import {
  getDriveFileStream,
  getDriveFileMetadata,
  getDriveFileThumbnail,
} from '../../src/main/google-drive-service';

// Mock google-drive-service
vi.mock('../../src/main/google-drive-service', () => ({
  getDriveFileMetadata: vi.fn(),
  getDriveFileStream: vi.fn(),
  getDriveFileThumbnail: vi.fn(),
  getDriveClient: vi.fn(),
  listDriveFiles: vi.fn(),
}));

vi.mock('../../src/main/drive-cache-manager', () => ({
  driveCacheManager: {
    getCachedFilePath: vi.fn(),
  },
}));

vi.mock('../../src/core/media-utils', () => ({
  getThumbnailCachePath: vi.fn((p, d) => `${d}/hashed.jpg`),
  checkThumbnailCache: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../src/core/security');
vi.mock('../../src/core/constants', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    SUPPORTED_VIDEO_EXTENSIONS: [
      ...actual.SUPPORTED_VIDEO_EXTENSIONS,
      '.random',
    ],
  };
});

vi.mock('fs', () => {
  const mockFs = {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn(),
    createReadStream: vi.fn(),
    createWriteStream: vi.fn(),
    promises: {
      stat: vi.fn(),
      access: vi.fn(),
    },
  };
  return {
    default: mockFs,
    ...mockFs,
  };
});
// Hoist spawn mock to persist across assignments
const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}));

vi.mock('child_process', () => ({
  default: { spawn: mockSpawn },
  spawn: mockSpawn,
}));

describe('media-handler', () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      headers: {},
      on: vi.fn(),
    };
    res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    };
    // Default allow
    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: true,
      realPath: '/resolved/path',
    });

    // Default spawn behavior: returns usable object
    const defaultProcessMock: any = new EventEmitter();
    defaultProcessMock.stderr = new EventEmitter();
    defaultProcessMock.stdout = new EventEmitter();
    defaultProcessMock.kill = vi.fn();
    mockSpawn.mockReturnValue(defaultProcessMock);

    // Default Cache Miss
    vi.mocked(mediaUtils.checkThumbnailCache).mockResolvedValue(false);
  });

  describe('getMimeType', () => {
    it('returns correct mime types', () => {
      expect(getMimeType('file.jpg')).toBe('image/jpeg');
      expect(getMimeType('file.png')).toBe('image/png');
      expect(getMimeType('file.mp4')).toBe('video/mp4');
      expect(getMimeType('file.unknown')).toBe('application/octet-stream');
    });

    it('defaults Drive paths to octet-stream', () => {
      expect(getMimeType('gdrive://abc123')).toBe('application/octet-stream');
    });
  });

  describe('getVideoDuration', () => {
    it('resolves with error when ffmpeg spawn fails', async () => {
      const processMock: any = new EventEmitter();
      processMock.stderr = new EventEmitter();
      mockSpawn.mockReturnValue(processMock);

      const resultPromise = getVideoDuration('video.mp4', '/bin/ffmpeg');

      const error = new Error('spawn failed');
      processMock.emit('error', error);

      await expect(resultPromise).resolves.toEqual({
        error: 'FFmpeg execution failed',
      });
    });

    it('returns Drive API error when duration missing', async () => {
      vi.mocked(getDriveFileMetadata).mockResolvedValue({} as any);

      await expect(
        getVideoDuration('gdrive://file-id', '/bin/ffmpeg'),
      ).resolves.toEqual({ error: 'Duration not available from Drive API' });
    });

    it('handles Drive metadata failures', async () => {
      vi.mocked(getDriveFileMetadata).mockRejectedValue(new Error('boom'));

      await expect(
        getVideoDuration('gdrive://file-id', '/bin/ffmpeg'),
      ).resolves.toEqual({ error: 'Failed to fetch Drive metadata' });
    });
  });

  describe('serveStaticFile', () => {
    it('returns 403 if file does not exist (security: prevent enumeration)', async () => {
      vi.mocked(security.authorizeFilePath).mockResolvedValue({
        isAllowed: false,
        message: 'File does not exist',
      });
      await serveStaticFile(req, res, '/allowed/file.txt');
      expect(res.writeHead).toHaveBeenCalledWith(403, expect.anything());
      expect(res.end).toHaveBeenCalledWith('Access denied.');
    });

    it('serveMetadata returns duration from Drive metadata', async () => {
      vi.mocked(getDriveFileMetadata).mockResolvedValue({
        videoMediaMetadata: { durationMillis: '60000' },
      } as any);

      await serveMetadata(req, res, 'gdrive://123', null);

      expect(res.end).toHaveBeenCalledWith(JSON.stringify({ duration: 60 }));
    });

    it('serveStaticFile serves from Drive Cache', async () => {
      vi.mocked(driveCacheManager.getCachedFilePath).mockResolvedValue({
        path: '/cache/file.mp4',
        totalSize: 100,
        mimeType: 'video/mp4',
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.stat).mockResolvedValue({ size: 100 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await serveStaticFile(req, res, 'gdrive://123');

      expect(driveCacheManager.getCachedFilePath).toHaveBeenCalledWith('123');
      expect(fs.createReadStream).toHaveBeenCalledWith(
        '/cache/file.mp4',
        expect.anything(),
      );
      expect(res.writeHead).toHaveBeenCalledWith(
        206,
        expect.objectContaining({
          'Content-Type': 'video/mp4',
          'Content-Length': 100,
          'Content-Range': 'bytes 0-99/100',
        }),
      );
      expect(mockStream.pipe).toHaveBeenCalledWith(res);
    });

    it('serveStaticFile handles Drive errors', async () => {
      vi.mocked(driveCacheManager.getCachedFilePath).mockRejectedValue(
        new Error('Drive Fail'),
      );

      await serveStaticFile(req, res, 'gdrive://123');

      expect(res.writeHead).toHaveBeenCalledWith(500);
      expect(res.end).toHaveBeenCalledWith('Drive Error');
    });

    it('serveTranscode handles Drive Cache Error', async () => {
      vi.mocked(driveCacheManager.getCachedFilePath).mockRejectedValue(
        new Error('Cache Fail'),
      );

      await serveTranscode(req, res, 'gdrive://123', null, null);

      expect(res.writeHead).toHaveBeenCalledWith(500);
      expect(res.end).toHaveBeenCalledWith('Drive Handler Error');
    });

    it('serveThumbnail handles Drive fetch error', async () => {
      vi.mocked(fs.promises.access).mockRejectedValue(new Error('No cache'));
      vi.mocked(fs.existsSync).mockReturnValue(false);
      res.headersSent = false;
      vi.mocked(getDriveFileThumbnail).mockRejectedValue(
        new Error('Thumb Fail'),
      );

      await serveThumbnail(req, res, 'gdrive://123', null, '/tmp');

      await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async

      expect(res.writeHead).toHaveBeenCalledWith(404);
      expect(res.end).toHaveBeenCalled();
    });

    it('serves full file if no range', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.stat).mockResolvedValue({ size: 100 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await serveStaticFile(req, res, 'file.mp4');

      expect(res.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ 'Content-Length': 100 }),
      );
      expect(mockStream.pipe).toHaveBeenCalledWith(res);
    });

    it('serves partial content with Range', async () => {
      req.headers.range = 'bytes=0-49';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.stat).mockResolvedValue({ size: 100 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await serveStaticFile(req, res, 'file.mp4');

      expect(res.writeHead).toHaveBeenCalledWith(206, expect.anything());
      expect(fs.createReadStream).toHaveBeenCalledWith(expect.anything(), {
        start: 0,
        end: 49,
      });
    });

    it('handles stat error for Drive cache file', async () => {
      vi.mocked(driveCacheManager.getCachedFilePath).mockResolvedValue({
        path: '/cache/file',
        totalSize: 1000,
        mimeType: 'video/mp4',
      });
      vi.mocked(fs.promises.stat).mockRejectedValue(new Error('Stat fail'));

      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await serveStaticFile(req, res, 'gdrive://123');

      // logic catches stat error, returns { size: 0 }, forcing fallback to Drive stream (206)
      expect(res.writeHead).toHaveBeenCalledWith(206, expect.anything());
    });
  });

  describe('serveMetadata', () => {
    it('parses duration from stderr', async () => {
      const stderr = new EventEmitter();
      const processMock: any = new EventEmitter();
      processMock.stderr = stderr;

      vi.mocked(spawn).mockReturnValue(processMock);

      const promise = serveMetadata(req, res, 'video.mp4', '/bin/ffmpeg');

      await new Promise((resolve) => setTimeout(resolve, 0));
      stderr.emit('data', Buffer.from('Duration: 00:01:00.00'));
      processMock.emit('close');

      await promise;

      expect(res.end).toHaveBeenCalledWith(JSON.stringify({ duration: 60 }));
    });

    it('handles ffmpeg missing', async () => {
      await serveMetadata(req, res, 'file.mp4', null);
      expect(res.writeHead).toHaveBeenCalledWith(500);
      expect(res.end).toHaveBeenCalledWith(
        expect.stringContaining('FFmpeg binary not found'),
      );
    });
  });

  describe('serveTranscode', () => {
    it('pipes stdout', async () => {
      const stdout = { pipe: vi.fn() };
      const processMock: any = new EventEmitter();
      processMock.stdout = stdout;
      processMock.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(processMock);

      await serveTranscode(req, res, 'video.mp4', null, '/bin/ffmpeg');

      expect(stdout.pipe).toHaveBeenCalledWith(res);

      req.on.mock.calls[0][1](); // trigger close
      expect(processMock.kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('includes start time', async () => {
      const processMock: any = new EventEmitter();
      processMock.stdout = { pipe: vi.fn() };
      processMock.kill = vi.fn();
      vi.mocked(spawn).mockReturnValue(processMock);

      await serveTranscode(req, res, 'video.mp4', '10', '/bin/ffmpeg');

      expect(spawn).toHaveBeenCalledWith(
        '/bin/ffmpeg',
        expect.arrayContaining(['-ss', '10']),
      );
    });
  });

  describe('serveThumbnail', () => {
    it('generates thumbnail', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const stdout = { pipe: vi.fn() };
      const processMock: any = new EventEmitter();
      processMock.stderr = new EventEmitter();
      processMock.stdout = stdout;

      vi.mocked(fs.promises.stat).mockResolvedValue({ size: 100 } as any);

      mockSpawn.mockImplementation(() => {
        const p = processMock;
        setTimeout(() => {
          p.emit('close', 0);
        }, 10);
        return p;
      });

      await serveThumbnail(req, res, 'video.mp4', '/bin/ffmpeg', '/tmp');
      await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async event handlers

      expect(res.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ 'Content-Type': 'image/jpeg' }),
      );
      expect(fs.createReadStream).toHaveBeenCalled();
    });

    it('serves from cache if available', async () => {
      vi.mocked(mediaUtils.checkThumbnailCache).mockResolvedValue(true);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await serveThumbnail(req, res, '/path/to/media.jpg', null, '/cache');

      expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
      expect(mockStream.pipe).toHaveBeenCalledWith(res);
    });

    it('fetches from Drive and caches on success', async () => {
      vi.mocked(fs.promises.access).mockRejectedValue(new Error('No cache'));
      const mockStream = { pipe: vi.fn() };
      vi.mocked(getDriveFileThumbnail).mockResolvedValue(mockStream as any);

      const mockWriteStream = { on: vi.fn(), end: vi.fn() };
      vi.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream as any);

      await serveThumbnail(req, res, 'gdrive://123', null, '/cache');

      expect(getDriveFileThumbnail).toHaveBeenCalledWith('123');
      expect(mockStream.pipe).toHaveBeenCalledWith(mockWriteStream);
      expect(mockStream.pipe).toHaveBeenCalledWith(res);
    });

    it('handles local FFmpeg success but cache file missing', async () => {
      // checkThumbnailCache returns false by default mock

      const processMock: any = new EventEmitter();
      processMock.stderr = { on: vi.fn() };
      mockSpawn.mockReturnValue(processMock);

      // Fail the final stat check
      vi.mocked(fs.promises.stat).mockRejectedValue(new Error('File missing'));

      const p = serveThumbnail(req, res, '/file.mp4', '/bin/ffmpeg', '/cache');

      expect(res.writeHead).not.toHaveBeenCalled();

      // Wait for spawn to receive call (async due to auth/cache check)
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      expect(processMock.listenerCount('error')).toBeGreaterThan(0);

      processMock.emit('close', 0);

      // Wait for async stat/catch block
      await new Promise((resolve) => setTimeout(resolve, 50));
      await p;

      expect(security.authorizeFilePath).toHaveBeenCalled();
      expect(res.writeHead).toHaveBeenCalledWith(500);
    });

    it('handles spawn error', async () => {
      vi.mocked(fs.promises.access).mockRejectedValue(new Error('No cache'));
      const { spawn } = await import('child_process');

      const processMock: any = new EventEmitter();
      processMock.stderr = { on: vi.fn() };
      vi.mocked(spawn).mockReturnValue(processMock);

      const p = serveThumbnail(req, res, '/file.mp4', '/bin/ffmpeg', '/cache');

      // Wait for spawn
      await vi.waitFor(() => {
        expect(processMock.listenerCount('error')).toBeGreaterThan(0);
      });

      processMock.emit('error', new Error('Spawn failed'));
      await p;

      expect(res.writeHead).toHaveBeenCalledWith(500);
    });
  });
});

describe('createMediaRequestHandler', () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = {
      headers: {},
      on: vi.fn(),
    };
    res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    };
    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: true,
      realPath: '/resolved/path',
    });
  });

  it('handles requests', async () => {
    const handler = createMediaRequestHandler({
      ffmpegPath: '/bin/ffmpeg',
      cacheDir: '/tmp',
    });

    req.url = '/video/metadata?file=test.mp4';
    req.headers.host = 'localhost';

    const processMock: any = new EventEmitter();
    processMock.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(processMock);

    const promise = handler(req, res);
    await new Promise((resolve) => setTimeout(resolve, 0));
    processMock.emit('close');
    await promise;

    expect(mockSpawn).toHaveBeenCalledWith(
      '/bin/ffmpeg',
      expect.arrayContaining(['-i', 'test.mp4']),
    );
  });

  it('handles missing file param', async () => {
    const handler = createMediaRequestHandler({
      ffmpegPath: '/bin/ffmpeg',
      cacheDir: '/tmp',
    });
    req.url = '/video/metadata';
    req.headers.host = 'localhost';

    await handler(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(400);
    expect(res.end).toHaveBeenCalledWith('Missing file parameter');
  });

  it('handles static files', async () => {
    const handler = createMediaRequestHandler({
      ffmpegPath: '/bin/ffmpeg',
      cacheDir: '/tmp',
    });
    req.url = '/file.txt';
    req.headers.host = 'localhost';

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.promises.stat).mockResolvedValue({ size: 10 } as any);
    vi.mocked(fs.createReadStream).mockReturnValue({ pipe: vi.fn() } as any);

    await handler(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
  });

  it('handles missing file param (stream)', async () => {
    const handler = createMediaRequestHandler({
      ffmpegPath: '/bin/ffmpeg',
      cacheDir: '/tmp',
    });
    req.url = '/video/stream';
    req.headers.host = 'localhost';
    await handler(req, res);
    expect(res.writeHead).toHaveBeenCalledWith(400);
  });

  it('handles missing file param (thumbnail)', async () => {
    const handler = createMediaRequestHandler({ ffmpegPath: '/bin/ffmpeg' });
    req.url = '/video/thumbnail';
    req.headers.host = 'localhost';
    await handler(req, res);
    expect(res.writeHead).toHaveBeenCalledWith(400);
  });

  it('handles missing req.url', async () => {
    const handler = createMediaRequestHandler({ ffmpegPath: '/bin/ffmpeg' });
    req.url = undefined;
    await handler(req, res);
    expect(res.writeHead).toHaveBeenCalledWith(400);
  });
});

describe('Edge Cases', () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = {
      headers: {},
      on: vi.fn(),
    };
    res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    };
  });

  it('getMimeType returns default video type', () => {
    expect(getMimeType('test.random')).toBe('video/random');
  });

  it('getMimeType returns octet-stream for unknown ext', () => {
    expect(getMimeType('test.xyz')).toBe('application/octet-stream');
  });

  it('serveMetadata handles path validation error', async () => {
    vi.mocked(security.authorizeFilePath).mockRejectedValue(
      new Error('Auth Fail'),
    );
    await serveMetadata(req, res, 'test.mp4', '/bin/ffmpeg');
    expect(res.writeHead).toHaveBeenCalledWith(500);
  });

  it('serveMetadata handles duration parse fail', async () => {
    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: true,
    });
    const processMock: any = new EventEmitter();
    const stderr = new EventEmitter();
    processMock.stderr = stderr;
    mockSpawn.mockReturnValue(processMock);

    const promise = serveMetadata(req, res, 'video.mp4', '/bin/ffmpeg');

    await new Promise((resolve) => setTimeout(resolve, 0));
    stderr.emit('data', Buffer.from('No duration here'));
    processMock.emit('close');

    await promise;

    expect(res.end).toHaveBeenCalledWith(
      JSON.stringify({ error: 'Could not determine duration' }),
    );
  });

  it('serveTranscode handles validation error', async () => {
    vi.mocked(security.authorizeFilePath).mockRejectedValue(
      new Error('Auth Fail'),
    );
    await serveTranscode(req, res, 'test.mp4', null, '/bin/ffmpeg');
    expect(res.writeHead).toHaveBeenCalledWith(500);
  });

  it('serveTranscode handles missing ffmpeg', async () => {
    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: true,
    });
    await serveTranscode(req, res, 'test.mp4', null, null);
    expect(res.writeHead).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith('FFmpeg binary not found');
  });

  it('serveTranscode handles spawn error', async () => {
    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: true,
    });
    const processMock: any = new EventEmitter();
    processMock.stdout = { pipe: vi.fn() };
    processMock.kill = vi.fn();

    mockSpawn.mockReturnValue(processMock);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await serveTranscode(req, res, 'video.mp4', null, '/bin/ffmpeg');

    processMock.emit('error', new Error('Spawn fail'));
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('serveThumbnail handles validation error', async () => {
    vi.mocked(security.authorizeFilePath).mockRejectedValue(
      new Error('Auth Fail'),
    );
    await serveThumbnail(req, res, 'test.mp4', '/bin/ffmpeg', '/tmp');
    expect(res.writeHead).toHaveBeenCalledWith(500);
  });

  it('serveThumbnail handles missing ffmpeg', async () => {
    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: true,
    });
    await serveThumbnail(req, res, 'test.mp4', null, '/tmp');
    expect(res.writeHead).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith('FFmpeg binary not found');
  });
  it('serveStaticFile handles invalid range (416)', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.promises.stat).mockResolvedValue({ size: 100 } as any);
    req.headers.range = 'bytes=200-300'; // Invalid since size=100

    await serveStaticFile(req, res, 'file.mp4');

    expect(res.writeHead).toHaveBeenCalledWith(
      416,
      expect.objectContaining({ 'Content-Range': 'bytes */100' }),
    );
    expect(res.end).toHaveBeenCalledWith('Requested range not satisfiable.');
  });

  it('serveStaticFile handles server error (stat fail)', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // auth succeeded, but stat fails
    vi.mocked(fs.promises.stat).mockRejectedValue(new Error('Stat Fail'));

    await serveStaticFile(req, res, 'file.mp4');

    expect(res.writeHead).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith('Server error.');
  });

  it('serveStaticFile handles auth internal error', async () => {
    vi.mocked(security.authorizeFilePath).mockRejectedValue(
      new Error('Auth Crash'),
    );
    await serveStaticFile(req, res, 'file.mp4');
    expect(res.writeHead).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith('Internal server error.');
  });
});

describe('serveStaticFile with Active Caching Fallback', () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = {
      headers: {},
      on: vi.fn(),
    };
    res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    };
  });

  it('falls back to Drive stream if local cache is insufficient (Cache Miss logic)', async () => {
    const fileId = 'fallback-file';
    const filePath = `gdrive://${fileId}`;
    const mockStream = { pipe: vi.fn(), destroy: vi.fn(), on: vi.fn() };

    vi.mocked(getDriveFileStream).mockResolvedValue(mockStream as any);

    // Mock Cache Manager to return valid metadata
    vi.mocked(driveCacheManager.getCachedFilePath).mockResolvedValue({
      path: '/tmp/cache/file',
      totalSize: 1000,
      mimeType: 'video/mp4',
    });

    // Mock stat to return size 0 (empty local file), forcing fallback
    vi.mocked(fs.promises.stat).mockResolvedValue({ size: 0 } as any);

    await serveStaticFile(req, res, filePath);

    // Should call getDriveFileStream
    expect(getDriveFileStream).toHaveBeenCalledWith(fileId, expect.anything());
    // Should pipe stream to res
    expect(mockStream.pipe).toHaveBeenCalledWith(res);
    // Should set 206
    expect(res.writeHead).toHaveBeenCalledWith(206, expect.anything());
  });

  it('parses Range header correctly', async () => {
    const fileId = 'range-file';
    const filePath = `gdrive://${fileId}`;
    req.headers = { range: 'bytes=10-20' };

    vi.mocked(driveCacheManager.getCachedFilePath).mockResolvedValue({
      path: '/tmp/cache/file',
      totalSize: 1000,
      mimeType: 'video/mp4',
    });
    // Local file has enough data
    vi.mocked(fs.promises.stat).mockResolvedValue({ size: 100 } as any);
    const mockReadStream = { pipe: vi.fn() };
    vi.mocked(fs.createReadStream).mockReturnValue(mockReadStream as any);

    await serveStaticFile(req, res, filePath);

    expect(fs.createReadStream).toHaveBeenCalledWith('/tmp/cache/file', {
      start: 10,
      end: 20,
    });
    expect(res.writeHead).toHaveBeenCalledWith(
      206,
      expect.objectContaining({
        'Content-Range': 'bytes 10-20/1000',
        'Content-Length': 11,
      }),
    );
  });
});

describe('serveThumbnail Error Handling', () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = { headers: {}, on: vi.fn() };
    res = { writeHead: vi.fn(), end: vi.fn(), headersSent: false };
  });

  it('handles FFmpeg failure code', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const stdout = { pipe: vi.fn() };
    const processMock: any = new EventEmitter();
    processMock.stderr = new EventEmitter();
    processMock.stdout = stdout;

    mockSpawn.mockImplementation(() => {
      const p = processMock;
      setTimeout(() => {
        p.emit('close', 1); // Code 1 = Error
      }, 10);
      return p;
    });

    await serveThumbnail(req, res, 'video.mp4', '/bin/ffmpeg', '/tmp');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(res.writeHead).toHaveBeenCalledWith(500);
  });
});

import { serveTranscode } from '../../src/core/media-handler';

describe('serveTranscode (Local)', () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = {
      headers: {},
      url: '',
      on: vi.fn(),
      connection: { remoteAddress: '::1' },
    };
    res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: false,
    };
  });

  it('serves forced transcode for local file', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: true,
      basePath: 'c:/',
    } as any);

    const mockChild: any = new EventEmitter();
    mockChild.stdout = { pipe: vi.fn(), on: vi.fn() };
    mockChild.stderr = new EventEmitter();
    mockChild.kill = vi.fn();
    vi.mocked(spawn).mockReturnValue(mockChild);

    req.url = '/video/stream?file=test.mp4&transcode=true';

    await serveTranscode(req, res, 'c:/test.mp4', '10', 'ffmpeg/path');

    expect(spawn).toHaveBeenCalledWith(
      'ffmpeg/path',
      expect.arrayContaining(['-ss', '10', '-i', 'c:/test.mp4']),
    );
    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Content-Type': 'video/mp4' }),
    );
    expect(mockChild.stdout.pipe).toHaveBeenCalledWith(res);

    mockChild.stderr.emit('data', Buffer.from('ffmpeg log'));

    const closeHandler = req.on.mock.calls.find(
      (call) => call[0] === 'close',
    )?.[1] as (() => void) | undefined;
    closeHandler?.();
    expect(mockChild.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('handles ffmpeg spawn error (cached catch)', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: true,
      basePath: 'c:/',
    } as any);

    vi.mocked(spawn).mockImplementation(() => {
      throw new Error('Spawn Failed');
    });

    req.url = '/video/stream?file=test.mp4&transcode=true';

    await serveTranscode(req, res, 'c:/test.mp4', undefined, 'ffmpeg/path');

    expect(res.writeHead).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith('Transcode Error');
  });

  it('returns 500 if ffmpeg not found', async () => {
    req.url = '/video/stream?file=test.mp4&transcode=true';
    await serveTranscode(req, res, 'c:/test.mp4', undefined, undefined as any);
    expect(res.writeHead).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith('FFmpeg binary not found');
  });
});

describe('serveTranscode (Drive)', () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = {
      headers: { host: 'localhost:3000' },
      url: '',
      on: vi.fn(),
      connection: { remoteAddress: '::1' },
    };
    res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: false,
    };
    // Mock Drive Cache Manager
    vi.mocked(driveCacheManager.getCachedFilePath).mockResolvedValue({
      path: 'cache/file.mp4',
      totalSize: 1000,
      mimeType: 'video/mp4',
    } as any);
  });

  it('serves forced transcode for Drive file using loopback', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // Assuming authorizeFilePath passes or is bypassed for Drive files logic (Drive files don't use authorizeFilePath?)
    // In lines 178+, authorizeFilePath is NOT called again if already checked?
    // Wait, lines 178+ are inside `serveTranscode`.
    // It checks `fileId` pattern.

    const mockChild: any = new EventEmitter();
    mockChild.stdout = { pipe: vi.fn(), on: vi.fn() };
    mockChild.stderr = new EventEmitter();
    mockChild.kill = vi.fn();
    vi.mocked(spawn).mockReturnValue(mockChild);

    req.url = '/video/stream?file=gdrive://abc&transcode=true';

    await serveTranscode(req, res, 'gdrive://abc', '10', 'ffmpeg/path');

    expect(spawn).toHaveBeenCalledWith(
      'ffmpeg/path',
      expect.arrayContaining([
        '-i',
        'http://localhost:3000/video/stream?file=gdrive://abc',
      ]),
    );
    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Content-Type': 'video/mp4' }),
    );
    expect(mockChild.stdout.pipe).toHaveBeenCalledWith(res);

    mockChild.stderr.emit('data', Buffer.from('drive ffmpeg log'));

    const closeHandler = req.on.mock.calls.find(
      (call) => call[0] === 'close',
    )?.[1] as (() => void) | undefined;
    closeHandler?.();
    expect(mockChild.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('serves hybrid cache HIT (partial)', async () => {
    // Mock cache metadata
    vi.mocked(driveCacheManager.getCachedFilePath).mockResolvedValue({
      path: 'cache.mp4',
      totalSize: 1000,
      mimeType: 'video/mp4',
    } as any);

    // Mock fs.promises.stat to return current size 500
    vi.mocked(fs.promises.stat).mockResolvedValue({ size: 500 } as any);

    // Request bytes=0-100 (Cached!)
    req.headers.range = 'bytes=0-100';
    req.url = '/video/stream?file=gdrive://abc';

    await serveTranscode(req, res, 'gdrive://abc', undefined, 'ffmpeg/path');

    expect(res.writeHead).toHaveBeenCalledWith(
      206,
      expect.objectContaining({
        'Content-Range': 'bytes 0-100/1000',
        'Content-Length': 101,
        'Content-Type': 'video/mp4',
      }),
    );
    expect(fs.createReadStream).toHaveBeenCalledWith('cache.mp4', {
      start: 0,
      end: 100,
    });
  });

  it('serves hybrid cache MISS (fallback to Drive)', async () => {
    // Mock cache metadata
    vi.mocked(driveCacheManager.getCachedFilePath).mockResolvedValue({
      path: 'cache.mp4',
      totalSize: 1000,
      mimeType: 'video/mp4',
    } as any);

    // Mock fs.promises.stat to return current size 500
    vi.mocked(fs.promises.stat).mockResolvedValue({ size: 500 } as any);

    // Request bytes=600-700 (Miss!)
    req.headers.range = 'bytes=600-700';
    req.url = '/video/stream?file=gdrive://abc';

    const mockStream = { pipe: vi.fn(), on: vi.fn(), destroy: vi.fn() } as any;
    let errorHandler: ((err: Error) => void) | undefined;
    mockStream.on.mockImplementation((event: string, handler: any) => {
      if (event === 'error') {
        errorHandler = handler;
      }
      return mockStream;
    });
    vi.mocked(getDriveFileStream).mockResolvedValue(mockStream);

    await serveTranscode(req, res, 'gdrive://abc', undefined, 'ffmpeg/path');

    expect(res.writeHead).toHaveBeenCalledWith(
      206,
      expect.objectContaining({
        'Content-Range': 'bytes 600-700/1000',
        'Content-Type': 'video/mp4',
      }),
    );
    expect(getDriveFileStream).toHaveBeenCalledWith('abc', {
      start: 600,
      end: 700,
    });
    expect(mockStream.pipe).toHaveBeenCalledWith(res);

    expect(errorHandler).toBeDefined();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    errorHandler?.(new Error('stream exploded'));
    consoleSpy.mockRestore();

    const closeHandler = req.on.mock.calls.find(
      (call) => call[0] === 'close',
    )?.[1] as (() => void) | undefined;
    expect(closeHandler).toBeDefined();
    closeHandler?.();
    expect(mockStream.destroy).toHaveBeenCalled();
  });
});
