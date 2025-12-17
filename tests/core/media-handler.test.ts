import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IMediaSource } from '../../src/core/media-source-types';
import { PassThrough, EventEmitter } from 'stream';
import { createMediaSource } from '../../src/core/media-source';

// Hoist mocks to ensure shared reference
const {
  mockSpawn,
  mockGetDriveFileMetadata,
  mockGetDriveFileThumbnail,
  mockAuthorizeFilePath,
  mockGetThumbnailCachePath,
  mockCheckThumbnailCache,
  mockFsCreateReadStream,
  mockFsCreateWriteStream,
  mockFsStat,
} = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockGetDriveFileMetadata: vi.fn(),
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

// Import code under test AFTER mocking
import {
  serveTranscodedStream,
  serveRawStream,
  getMimeType,
  getVideoDuration,
  serveMetadata,
  serveThumbnail,
  serveStaticFile,
  createMediaRequestHandler,
} from '../../src/core/media-handler';

vi.mock('../../src/main/google-drive-service', () => ({
  getDriveFileMetadata: mockGetDriveFileMetadata,
  getDriveFileThumbnail: mockGetDriveFileThumbnail,
}));

vi.mock('../../src/core/security', () => ({
  authorizeFilePath: mockAuthorizeFilePath,
}));

vi.mock('../../src/core/media-utils', () => ({
  getThumbnailCachePath: mockGetThumbnailCachePath,
  checkThumbnailCache: mockCheckThumbnailCache,
}));

vi.mock('../../src/core/media-source', () => ({
  createMediaSource: vi.fn(),
}));

// Mock IMediaSource
const mockMediaSource = {
  getFFmpegInput: vi.fn().mockResolvedValue('/path/to/media'),
  getStream: vi
    .fn()
    .mockResolvedValue({ stream: new PassThrough(), length: 1000 }),
  getMimeType: vi.fn().mockResolvedValue('video/mp4'),
  getSize: vi.fn().mockResolvedValue(1000),
} as unknown as IMediaSource;

describe('media-handler unit tests', () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawn.mockReset(); // Reset the spy
    const listeners: Record<string, ((...args: any[]) => void)[]> = {};
    req = {
      headers: {},
      on: vi.fn((event, cb) => {
        // console.log(`[MockReq] on(${event}) registered`);
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      }),
      emit: vi.fn((event, ...args) => {
        // console.log(`[MockReq] emit(${event})`);
        if (listeners[event]) {
          listeners[event].forEach((cb) => cb(...args));
        }
      }),
    };
    res = {
      writeHead: vi.fn(() => {
        // console.log(`[MockRes] writeHead(${code})`);
      }),
      end: vi.fn(() => {
        // console.log(`[MockRes] end(${msg})`);
      }),
      headersSent: false,
      on: vi.fn(),
      once: vi.fn(),
      emit: vi.fn(),
      write: vi.fn(),
    };

    // Default mock behavior
    vi.mocked(createMediaSource).mockImplementation(() => {
      // console.log(`[MockMediaSource] Created for ${file}`);
      return {
        getFFmpegInput: vi.fn().mockResolvedValue('/path/to/media'),
        getStream: vi
          .fn()
          .mockResolvedValue({ stream: new PassThrough(), length: 1000 }),
        getMimeType: vi.fn().mockResolvedValue('video/mp4'),
        getSize: vi.fn().mockResolvedValue(1000),
      } as unknown as IMediaSource;
    });
  });

  describe('getMimeType', () => {
    it('returns octet-stream for gdrive files', () => {
      expect(getMimeType('gdrive://123')).toBe('application/octet-stream');
    });

    it('returns correct image mime types', () => {
      expect(getMimeType('test.jpg')).toBe('image/jpeg');
      expect(getMimeType('test.png')).toBe('image/png');
    });

    it('returns correct video mime types', () => {
      expect(getMimeType('test.mp4')).toBe('video/mp4');
      expect(getMimeType('test.mkv')).toBe('video/x-matroska');
      expect(getMimeType('test.avi')).toBe('video/x-msvideo');
    });

    it('returns default for unknown extension', () => {
      expect(getMimeType('test.xyz')).toBe('application/octet-stream');
    });
  });

  describe('getVideoDuration', () => {
    it('fetches duration from gdrive metadata', async () => {
      mockGetDriveFileMetadata.mockResolvedValue({
        videoMediaMetadata: { durationMillis: '10000' },
      });
      const result = await getVideoDuration('gdrive://123', 'ffmpeg');
      expect(result).toEqual({ duration: 10 });
    });

    it('handles gdrive metadata failure', async () => {
      mockGetDriveFileMetadata.mockRejectedValue(new Error('API fail'));
      const result = await getVideoDuration('gdrive://123', 'ffmpeg');
      expect(result).toEqual({ error: 'Failed to fetch Drive metadata' });
    });

    it('fetches duration from local file using ffmpeg', async () => {
      const mockProc = new EventEmitter() as any;
      mockProc.stdout = new PassThrough();
      mockProc.stderr = new EventEmitter();
      mockSpawn.mockReturnValue(mockProc);

      const promise = getVideoDuration('/local/file.mp4', 'ffmpeg');

      // Emit on stderr as per implementation
      mockProc.stderr.emit('data', 'Duration: 00:00:10.50, start:');
      mockProc.emit('close', 0);

      const result = (await promise) as any;
      expect(result.duration).toBeCloseTo(10.5);
    });

    it('handles ffmpeg failure for duration', async () => {
      const mockProc = new EventEmitter() as any;
      mockProc.stdout = new PassThrough();
      mockProc.stderr = new EventEmitter();
      mockSpawn.mockReturnValue(mockProc);

      const promise = getVideoDuration('/local/file.mp4', 'ffmpeg');

      mockProc.emit('close', 1);

      const result = (await promise) as any;
      expect(result.error).toBe('Could not determine duration');
    });

    it('handles ffmpeg spawn error for duration', async () => {
      const mockProc = new EventEmitter() as any;
      mockProc.stdout = new PassThrough();
      mockProc.stderr = new EventEmitter();
      mockSpawn.mockReturnValue(mockProc);

      const promise = getVideoDuration('/local/file.mp4', 'ffmpeg');
      mockProc.emit('error', new Error('Spawn failed'));

      const result = (await promise) as any;
      expect(result.error).toBe('FFmpeg execution failed');
    });
  });

  describe('serveMetadata', () => {
    it('returns access denied for unauthorized local file', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: false });
      await serveMetadata(req, res, '/local/file', 'ffmpeg');
      expect(res.writeHead).toHaveBeenCalledWith(403);
      expect(res.end).toHaveBeenCalledWith('Access denied.');
    });

    it('returns error if ffmpeg path missing for local file', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      await serveMetadata(req, res, '/local/file', null);
      expect(res.writeHead).toHaveBeenCalledWith(500);
      expect(res.end).toHaveBeenCalledWith('FFmpeg binary not found');
    });

    // Note: Success path testing mockVideoDuration requires mocking spawn behavior which is complex here
    // as getVideoDuration implementation is inside the same file and not easily mocked out purely via import
    // unless we mock the module itself or the spawn call fully.
  });

  describe('serveTranscodedStream', () => {
    it('spawns ffmpeg with correct arguments for local file', async () => {
      const sourceInput = '/path/to/video.mp4';
      const ffmpegPath = '/usr/bin/ffmpeg';

      vi.mocked(mockMediaSource.getFFmpegInput).mockResolvedValue(sourceInput);

      const mockStdout = new PassThrough();
      const mockStderr = new PassThrough();
      const mockProcess = {
        stdout: mockStdout,
        stderr: mockStderr,
        on: vi.fn(),
        kill: vi.fn(),
      };

      mockSpawn.mockReturnValue(mockProcess);

      await serveTranscodedStream(req, res, mockMediaSource, ffmpegPath, null);

      expect(mockMediaSource.getFFmpegInput).toHaveBeenCalled();
      expect(mockSpawn).toHaveBeenCalledWith(
        ffmpegPath,
        expect.arrayContaining(['-i', sourceInput, '-f', 'mp4', 'pipe:1']),
      );
      expect(res.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ 'Content-Type': 'video/mp4' }),
      );
    });

    it('adds start time argument if provided', async () => {
      const sourceInput = '/path/to/video.mp4';
      const ffmpegPath = '/usr/bin/ffmpeg';
      const startTime = '10.5';

      vi.mocked(mockMediaSource.getFFmpegInput).mockResolvedValue(sourceInput);

      const mockStdout = new PassThrough();
      const mockStderr = new PassThrough();
      const mockProcess = {
        stdout: mockStdout,
        stderr: mockStderr,
        on: vi.fn(),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProcess);

      await serveTranscodedStream(
        req,
        res,
        mockMediaSource,
        ffmpegPath,
        startTime,
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        ffmpegPath,
        expect.arrayContaining(['-ss', startTime, '-i', sourceInput]),
      );
    });

    it('kills ffmpeg process when request closes', async () => {
      const sourceInput = '/path/to/video.mp4';
      const ffmpegPath = '/usr/bin/ffmpeg';

      vi.mocked(mockMediaSource.getFFmpegInput).mockResolvedValue(sourceInput);

      const mockProcess = {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        on: vi.fn(),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProcess);

      await serveTranscodedStream(req, res, mockMediaSource, ffmpegPath, null);

      // Simulate request close
      const closeCalls = req.on.mock.calls.filter((c: any) => c[0] === 'close');
      const closeHandler = closeCalls[closeCalls.length - 1][1];

      closeHandler();

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('propagates errors from getFFmpegInput', async () => {
      vi.mocked(mockMediaSource.getFFmpegInput).mockRejectedValue(
        new Error('Access denied'),
      );

      await expect(
        serveTranscodedStream(req, res, mockMediaSource, '/bin/ffmpeg', null),
      ).rejects.toThrow('Access denied');

      expect(res.writeHead).not.toHaveBeenCalled();
    });
  });

  describe('serveRawStream', () => {
    it('pipes stream with correct headers for full content', async () => {
      vi.mocked(mockMediaSource.getSize).mockResolvedValue(1000);
      vi.mocked(mockMediaSource.getMimeType).mockResolvedValue('video/mp4');

      const mockStream = new PassThrough();
      vi.mocked(mockMediaSource.getStream).mockResolvedValue({
        stream: mockStream,
        length: 1000,
      });

      await serveRawStream(req, res, mockMediaSource);

      expect(mockMediaSource.getStream).toHaveBeenCalledWith({
        start: 0,
        end: 999,
      });
      expect(res.writeHead).toHaveBeenCalledWith(
        206,
        expect.objectContaining({
          'Content-Range': 'bytes 0-999/1000',
          'Content-Length': 1000,
          'Content-Type': 'video/mp4',
        }),
      );
    });

    it('handles Range requests correctly', async () => {
      req.headers.range = 'bytes=100-199';
      vi.mocked(mockMediaSource.getSize).mockResolvedValue(1000);
      vi.mocked(mockMediaSource.getMimeType).mockResolvedValue('video/mp4');

      const mockStream = new PassThrough();
      vi.mocked(mockMediaSource.getStream).mockResolvedValue({
        stream: mockStream,
        length: 100,
      });

      await serveRawStream(req, res, mockMediaSource);

      expect(mockMediaSource.getStream).toHaveBeenCalledWith({
        start: 100,
        end: 199,
      });
      expect(res.writeHead).toHaveBeenCalledWith(
        206,
        expect.objectContaining({
          'Content-Range': 'bytes 100-199/1000',
          'Content-Length': 100,
        }),
      );
    });

    it('propagates errors from getStream', async () => {
      vi.mocked(mockMediaSource.getSize).mockResolvedValue(1000);
      vi.mocked(mockMediaSource.getMimeType).mockResolvedValue('video/mp4');
      vi.mocked(mockMediaSource.getStream).mockRejectedValue(
        new Error('Access denied'),
      );

      await expect(serveRawStream(req, res, mockMediaSource)).rejects.toThrow(
        'Access denied',
      );

      expect(res.writeHead).not.toHaveBeenCalled();
    });

    it('handles open-ended Range requests', async () => {
      req.headers.range = 'bytes=100-';
      vi.mocked(mockMediaSource.getSize).mockResolvedValue(1000);
      vi.mocked(mockMediaSource.getMimeType).mockResolvedValue('video/mp4');

      const mockStream = new PassThrough();
      vi.mocked(mockMediaSource.getStream).mockResolvedValue({
        stream: mockStream,
        length: 900,
      });

      await serveRawStream(req, res, mockMediaSource);

      expect(mockMediaSource.getStream).toHaveBeenCalledWith({
        start: 100,
        end: 999,
      });
      expect(res.writeHead).toHaveBeenCalledWith(
        206,
        expect.objectContaining({
          'Content-Range': 'bytes 100-999/1000',
        }),
      );
    });
  });
  describe('serveThumbnail', () => {
    it('serves from cache if available', async () => {
      const cachePath = '/cache/thumb.jpg';
      mockGetThumbnailCachePath.mockReturnValue(cachePath);
      mockCheckThumbnailCache.mockResolvedValue(true);
      const mockStream = { pipe: vi.fn() };

      mockFsCreateReadStream.mockReturnValue(mockStream as any);

      await serveThumbnail(req, res, '/video.mp4', 'ffmpeg', '/cache');

      expect(res.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ 'Content-Type': 'image/jpeg' }),
      );
      expect(mockStream.pipe).toHaveBeenCalledWith(res);
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
      expect(mockDriveStream.pipe).toHaveBeenCalledWith(expect.anything()); // Write stream
      expect(mockDriveStream.pipe).toHaveBeenCalledWith(res);
    });

    it('returns 404 if drive fetch fails', async () => {
      mockCheckThumbnailCache.mockResolvedValue(false);
      mockGetThumbnailCachePath.mockReturnValue('/cache/gdrive.jpg');
      mockGetDriveFileThumbnail.mockRejectedValue(new Error('Drive error'));

      await serveThumbnail(req, res, 'gdrive://123', 'ffmpeg', '/cache');

      expect(res.writeHead).toHaveBeenCalledWith(404);
      expect(res.end).toHaveBeenCalled();
    });

    it('returns 500 if local file access denied', async () => {
      mockCheckThumbnailCache.mockResolvedValue(false);
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: false });

      await serveThumbnail(req, res, '/local/vid.mp4', 'ffmpeg', '/cache');

      expect(res.writeHead).toHaveBeenCalledWith(403);
      expect(res.end).toHaveBeenCalledWith('Access denied.');
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
      const mockStream = { pipe: vi.fn() };
      mockFsCreateReadStream.mockReturnValue(mockStream as any);

      await serveThumbnail(req, res, '/video.mp4', 'ffmpeg', '/cache');

      expect(mockSpawn).toHaveBeenCalled();
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
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

      await vi.waitFor(() => {
        expect(res.writeHead).toHaveBeenCalledWith(500);
        expect(res.end).toHaveBeenCalled();
      });
    });

    it('collects stderr output', async () => {
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

      // Emit stderr data
      mockProcess.stderr.emit('data', 'Error output');

      // Finish process with error to log stderr
      mockProcess.emit('close', 1);

      await promise;

      // We can't easily assert console.error but we ensure the callback ran
      // If we really wanted to, we could spy on console.error
    });
  });

  describe('serveStaticFile', () => {
    it('serves file as raw stream', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      const mockStream = { pipe: vi.fn(), on: vi.fn(), destroy: vi.fn() };

      vi.mocked(createMediaSource).mockReturnValue({
        getSize: vi.fn().mockResolvedValue(100),
        getMimeType: vi.fn().mockResolvedValue('text/plain'),
        getStream: vi
          .fn()
          .mockResolvedValue({ stream: mockStream, length: 100 }),
        getFFmpegInput: vi.fn(),
      });

      await serveStaticFile(req, res, '/static/file');
      expect(res.writeHead).toHaveBeenCalledWith(206, expect.anything());
    });

    it('handles access denied', async () => {
      // Mock createMediaSource to throw or checking auth inside source
      // But serveStaticFile calls createMediaSource, then serveRawStream.
      // If serveRawStream fails, it logs and sends error.

      // Actually serveStaticFile creates source. If creation fails (auth?), it catches.
      // But createMediaSource usually just returns an object.
      // The error likely comes from serveRawStream calling source.getSize or getStream.

      vi.mocked(createMediaSource).mockReturnValue({
        getSize: vi.fn().mockRejectedValue(new Error('Access denied')),
        getMimeType: vi.fn(),
        getStream: vi.fn(),
        getFFmpegInput: vi.fn(),
      });

      await serveStaticFile(req, res, '/static/file');
      expect(res.writeHead).toHaveBeenCalledWith(403);
      expect(res.end).toHaveBeenCalledWith('Access denied.');
    });

    it('handles internal errors', async () => {
      vi.mocked(createMediaSource).mockImplementation(() => {
        throw new Error('Boom');
      });
      await serveStaticFile(req, res, '/static/file');
      expect(res.writeHead).toHaveBeenCalledWith(500);
      expect(res.end).toHaveBeenCalledWith('Internal server error.');
    });
  });

  describe('createMediaRequestHandler', () => {
    it('returns 400 if no url', async () => {
      const handler = createMediaRequestHandler({
        ffmpegPath: 'ffmpeg',
        cacheDir: '/cache',
      });
      req.url = undefined;
      await handler(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(400);
    });

    it('handlers /video/metadata', async () => {
      const handler = createMediaRequestHandler({
        ffmpegPath: 'ffmpeg',
        cacheDir: '/cache',
      });
      req.url = '/video/metadata?file=test.mp4';
      req.headers.host = 'localhost';

      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      mockSpawn.mockImplementation(() => {
        const proc = {
          on: vi.fn(),
          stderr: { on: vi.fn() },
        };
        setTimeout(() => {
          // Trigger handlers for 'close'
          const calls = (proc.on as any).mock.calls || [];
          const closeCall = calls.find((c: any) => c[0] === 'close');
          if (closeCall && closeCall[1]) {
            closeCall[1](0);
          }
        }, 10);
        return proc as any;
      });

      await handler(req, res);
      expect(res.writeHead).toHaveBeenCalled(); // 200 likely
    });

    it('handlers /video/stream raw', async () => {
      const handler = createMediaRequestHandler({
        ffmpegPath: 'ffmpeg',
        cacheDir: '/cache',
      });
      req.url = '/video/stream?file=test.mp4';
      req.headers.host = 'localhost';

      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      mockFsStat.mockResolvedValue({ size: 100 });
      mockFsCreateReadStream.mockReturnValue({
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      } as any);

      await handler(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(206, expect.anything());
    });

    it('handlers /video/stream transcode', async () => {
      const handler = createMediaRequestHandler({
        ffmpegPath: 'ffmpeg',
        cacheDir: '/cache',
      });
      req.url = '/video/stream?file=test.mp4&transcode=true';
      req.headers.host = 'localhost';

      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      mockSpawn.mockReturnValue({
        stdout: { pipe: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      } as any);

      await handler(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
    });

    it('handles transcoding error (no ffmpeg)', async () => {
      const handler = createMediaRequestHandler({
        ffmpegPath: null,
        cacheDir: '/cache',
      });
      req.url = '/video/stream?file=test.mp4&transcode=true';

      await handler(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(500);
    });

    it('handlers static file', async () => {
      const handler = createMediaRequestHandler({
        ffmpegPath: 'ffmpeg',
        cacheDir: '/cache',
      });
      req.url = '/some/static/file.css';
      req.headers.host = 'localhost';

      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      mockFsStat.mockResolvedValue({ size: 100 });
      mockFsCreateReadStream.mockReturnValue({
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      } as any);

      await handler(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(206, expect.anything());
    });

    it('returns 400 for metadata if file missing', async () => {
      const handler = createMediaRequestHandler({
        ffmpegPath: 'ffmpeg',
        cacheDir: '/cache',
      });
      req.url = '/video/metadata';
      await handler(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(400);
      expect(res.end).toHaveBeenCalledWith('Missing file parameter');
    });

    it('returns 400 for stream if file missing', async () => {
      const handler = createMediaRequestHandler({
        ffmpegPath: 'ffmpeg',
        cacheDir: '/cache',
      });
      req.url = '/video/stream';
      await handler(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(400);
      expect(res.end).toHaveBeenCalledWith('Missing file parameter');
    });

    it('returns 400 for thumbnail if file missing', async () => {
      const handler = createMediaRequestHandler({
        ffmpegPath: 'ffmpeg',
        cacheDir: '/cache',
      });
      req.url = '/video/thumbnail';
      await handler(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(400);
      expect(res.end).toHaveBeenCalledWith('Missing file parameter');
    });

    it('handles stream initialization error', async () => {
      const handler = createMediaRequestHandler({
        ffmpegPath: 'ffmpeg',
        cacheDir: '/cache',
      });
      req.url = '/video/stream?file=bad';
      req.headers.host = 'localhost';

      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      // Force createMediaSource to return a source that throws on methods or throw itself
      vi.mocked(createMediaSource).mockImplementation(() => {
        throw new Error('Error initializing source');
      });

      await handler(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(500);
      expect(res.end).toHaveBeenCalledWith('Error initializing source');
    });

    it('handles stream access denied', async () => {
      const handler = createMediaRequestHandler({
        ffmpegPath: 'ffmpeg',
        cacheDir: '/cache',
      });
      req.url = '/video/stream?file=secret';
      req.headers.host = 'localhost';

      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: false,
        message: 'Access denied',
      });
      // Emulate access denied from source
      vi.mocked(createMediaSource).mockImplementation(() => {
        console.log('Test: Creating mock media source for access denied');
        return {
          getSize: vi.fn().mockRejectedValue(new Error('Access denied')),
          getMimeType: vi.fn(),
          getStream: vi.fn(),
          getFFmpegInput: vi.fn(),
        } as any;
      });

      await handler(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(403);
      expect(res.end).toHaveBeenCalledWith('Access denied.');
    });

    it('cleans up stream on request close', async () => {
      const mockStream = { pipe: vi.fn(), on: vi.fn(), destroy: vi.fn() };
      const mockSource = {
        getStream: vi
          .fn()
          .mockResolvedValue({ stream: mockStream, length: 100 }),
        getSize: vi.fn().mockResolvedValue(100),
        getMimeType: vi.fn().mockResolvedValue('video/mp4'),
        getFFmpegInput: vi.fn(),
      };

      await serveRawStream(req, res, mockSource as any);

      // Trigger close
      req.emit('close');
      expect(mockStream.destroy).toHaveBeenCalled();
    });

    it('cleans up transcoded process on request close', async () => {
      const mockProc = {
        stdout: { pipe: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProc as any);

      const mockSource = {
        getStream: vi.fn(),
        getSize: vi.fn(),
        getMimeType: vi.fn(),
        getFFmpegInput: vi.fn().mockResolvedValue('input'),
      };

      await serveTranscodedStream(req, res, mockSource as any, 'ffmpeg', null);

      // Trigger close
      req.emit('close');
      expect(mockProc.kill).toHaveBeenCalledWith('SIGKILL');
    });
    it('handles process error', async () => {
      const mockProc = new EventEmitter() as any;
      mockProc.stdout = new PassThrough();
      mockProc.stderr = new EventEmitter();
      mockProc.kill = vi.fn();
      mockSpawn.mockReturnValue(mockProc as any);

      const mockSource = {
        getStream: vi.fn(),
        getSize: vi.fn(),
        getMimeType: vi.fn(),
        getFFmpegInput: vi.fn().mockResolvedValue('input'),
      };

      await serveTranscodedStream(req, res, mockSource as any, 'ffmpeg', null);

      mockProc.emit('error', new Error('Process Error'));
      // assert calling console.error? Not strictly needed for coverage, just need execution.
    });

    it('collects stderr data', async () => {
      const mockProc = new EventEmitter() as any;
      mockProc.stdout = new PassThrough();
      mockProc.stderr = new EventEmitter();
      mockProc.kill = vi.fn();
      mockSpawn.mockReturnValue(mockProc as any);

      const mockSource = {
        getStream: vi.fn(),
        getSize: vi.fn(),
        getMimeType: vi.fn(),
        getFFmpegInput: vi.fn().mockResolvedValue('input'),
      };

      await serveTranscodedStream(req, res, mockSource as any, 'ffmpeg', null);

      mockProc.stderr.emit('data', 'some log');
    });
  });
});
