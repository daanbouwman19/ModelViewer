import { describe, it, expect, vi, beforeEach, Mock, afterEach } from 'vitest';
import { IMediaSource } from '../../src/core/media-source-types';
import { PassThrough, EventEmitter } from 'stream';
import path from 'path';
import request from 'supertest';
import { createMediaSource } from '../../src/core/media-source';
import fs from 'fs'; // Import fs for spying

const {
  mockSpawn,
  mockGetDriveFileMetadata,
  mockGetDriveFileThumbnail,
  mockAuthorizeFilePath,
  mockGetThumbnailCachePath,
  mockCheckThumbnailCache,
  mockGetDriveStreamWithCache,
  mockGetFFmpegDuration,
} = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockGetDriveFileMetadata: vi.fn(),
  mockGetDriveFileThumbnail: vi.fn(),
  mockAuthorizeFilePath: vi.fn(),
  mockGetThumbnailCachePath: vi.fn(),
  mockCheckThumbnailCache: vi.fn(),
  mockGetDriveStreamWithCache: vi.fn(),
  mockGetFFmpegDuration: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: mockSpawn,
  default: { spawn: mockSpawn },
}));

// Import code under test AFTER mocking dependencies
import {
  serveTranscodedStream,
  serveRawStream,
  getVideoDuration,
  serveMetadata,
  serveStaticFile,
  handleStreamRequest,
  generateFileUrl,
  createMediaApp,
  serveHlsMaster,
  serveHlsPlaylist,
  serveHlsSegment,
  serveHeatmap,
} from '../../src/core/media-handler';
import { getMimeType } from '../../src/core/media-utils';

vi.mock('../../src/main/google-drive-service', () => ({
  getDriveFileMetadata: mockGetDriveFileMetadata,
  getDriveFileThumbnail: mockGetDriveFileThumbnail,
}));

vi.mock('../../src/core/drive-stream', () => ({
  getDriveStreamWithCache: mockGetDriveStreamWithCache,
}));

vi.mock('../../src/core/security', () => ({
  authorizeFilePath: mockAuthorizeFilePath,
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

vi.mock('../../src/core/utils/ffmpeg-utils', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/core/utils/ffmpeg-utils')>();
  return {
    ...actual,
    getFFmpegDuration: mockGetFFmpegDuration,
  };
});

vi.mock('../../src/core/media-source', () => ({
  createMediaSource: vi.fn(),
}));

vi.mock('../../src/core/fs-provider-factory', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/core/fs-provider-factory')>();
  return {
    ...actual,
    getProvider: vi.fn().mockImplementation(actual.getProvider),
  };
});

const mockHlsManagerInstance = {
  ensureSession: vi.fn(),
  getSessionDir: vi.fn(),
  touchSession: vi.fn(),
};

vi.mock('../../src/core/hls-manager', () => ({
  HlsManager: {
    getInstance: vi.fn(() => mockHlsManagerInstance),
  },
}));

import { getProvider } from '../../src/core/fs-provider-factory';

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

  // Define spies to replace hoisted vars
  let mockFsStat: any;
  let mockFsReadFile: any;
  let mockFsAccess: any;
  let mockFsCreateReadStream: any;

  // HLS spies
  let mockHlsEnsureSession: any;
  let mockHlsGetSessionDir: any;
  let mockHlsTouchSession: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset all persistent mocks prevents cross-test state pollution
    mockSpawn.mockReset();
    mockGetDriveFileMetadata.mockReset();
    mockGetDriveFileThumbnail.mockReset();
    mockAuthorizeFilePath.mockReset();
    mockGetThumbnailCachePath.mockReset();
    mockCheckThumbnailCache.mockReset();
    mockGetDriveStreamWithCache.mockReset();
    mockGetDriveStreamWithCache.mockReset();
    mockGetFFmpegDuration.mockReset();

    mockHlsEnsureSession = mockHlsManagerInstance.ensureSession;
    mockHlsGetSessionDir = mockHlsManagerInstance.getSessionDir;
    mockHlsTouchSession = mockHlsManagerInstance.touchSession;
    mockHlsEnsureSession.mockReset();
    mockHlsGetSessionDir.mockReset();
    mockHlsTouchSession.mockReset();

    // Setup Spies
    // Note: Since media-handler imports from fs/promises, we spy on fs.promises
    mockFsStat = vi.spyOn(fs.promises, 'stat');
    mockFsReadFile = vi.spyOn(fs.promises, 'readFile');
    mockFsAccess = vi.spyOn(fs.promises, 'access');

    mockFsCreateReadStream = vi.spyOn(fs, 'createReadStream');

    // Default spy implementations to avoid errors
    mockFsStat.mockResolvedValue({ size: 1000, mtime: new Date() });
    mockFsAccess.mockResolvedValue(undefined); // Success
    mockFsReadFile.mockResolvedValue(Buffer.from(''));

    mockFsCreateReadStream.mockImplementation(() => {
      const s = new PassThrough();
      setTimeout(() => {
        s.emit('open');
        s.end(Buffer.from('fake-image'));
      }, 0);
      return s;
    });

    // Default mock implementation for authorizeFilePath
    mockAuthorizeFilePath.mockResolvedValue({
      isAllowed: true,
      realPath: '/test/path',
    });

    // Restore default getProvider behavior
    const { getProvider: actualGetProvider } = (await vi.importActual(
      '../../src/core/fs-provider-factory',
    )) as any;
    vi.mocked(getProvider).mockReset().mockImplementation(actualGetProvider);

    const listeners: Record<string, ((...args: any[]) => void)[]> = {};
    req = {
      method: 'GET',
      headers: {},
      query: {},
      on: vi.fn((event, cb) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      }),
      emit: vi.fn((event, ...args) => {
        if (listeners[event]) {
          listeners[event].forEach((cb) => cb(...args));
        }
      }),
    };
    res = {
      writeHead: vi.fn(() => {}),
      end: vi.fn(() => {}),
      headersSent: false,
      on: vi.fn(),
      once: vi.fn(),
      emit: vi.fn(),
      write: vi.fn(),
      // Express Mocks
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
      json: vi.fn(),
      set: vi.fn().mockReturnThis(),
      sendFile: vi.fn(),
      setHeader: vi.fn(),
      getHeader: vi.fn(),
    };

    // Default mock behavior
    vi.mocked(createMediaSource).mockImplementation(() => {
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

  afterEach(() => {
    vi.restoreAllMocks();
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
      expect(result).toEqual({ error: 'Duration not available' });
    });

    it('fetches duration from local file using ffmpeg', async () => {
      mockGetFFmpegDuration.mockResolvedValue(10.5);

      const result = (await getVideoDuration(
        '/local/file.mp4',
        'ffmpeg',
      )) as any;

      expect(mockGetFFmpegDuration).toHaveBeenCalledWith(
        '/local/file.mp4',
        'ffmpeg',
      );
      expect(result.duration).toBeCloseTo(10.5);
    });

    it('handles ffmpeg failure for duration', async () => {
      mockGetFFmpegDuration.mockRejectedValue(
        new Error('Could not determine duration'),
      );

      const result = (await getVideoDuration(
        '/local/file.mp4',
        'ffmpeg',
      )) as any;
      expect(result.error).toBe('Could not determine duration');
    });

    it('handles ffmpeg spawn error for duration', async () => {
      mockGetFFmpegDuration.mockRejectedValue(
        new Error('FFmpeg execution failed'),
      );

      const result = (await getVideoDuration(
        '/local/file.mp4',
        'ffmpeg',
      )) as any;
      expect(result.error).toBe('FFmpeg execution failed');
    });

    it('returns error if drive metadata has no duration', async () => {
      mockGetDriveFileMetadata.mockResolvedValue({});
      const result = await getVideoDuration('gdrive://123', 'ffmpeg');
      expect(result).toEqual({
        error: 'Duration not available',
      });
    });
  });

  describe('serveMetadata', () => {
    it('returns access denied for unauthorized local file', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: false });
      await serveMetadata(req, res, '/local/file', 'ffmpeg');
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access denied.');
    });

    it('returns 500 if auth check throws', async () => {
      mockAuthorizeFilePath.mockRejectedValue(new Error('Auth error'));
      await serveMetadata(req, res, '/local/file', 'ffmpeg');
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Internal server error.');
    });

    it('returns error if ffmpeg path missing for local file', async () => {
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: true,
        realPath: '/local/file',
      });
      await serveMetadata(req, res, '/local/file', null);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('FFmpeg binary not found');
    });
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

      await serveTranscodedStream(
        req,
        res,
        mockMediaSource,
        ffmpegPath,
        undefined,
      );

      expect(mockMediaSource.getFFmpegInput).toHaveBeenCalled();
      expect(mockSpawn).toHaveBeenCalledWith(
        ffmpegPath,
        expect.arrayContaining(['-i', sourceInput, '-f', 'mp4', 'pipe:1']),
      );
      expect(res.set).toHaveBeenCalledWith(
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

      await serveTranscodedStream(
        req,
        res,
        mockMediaSource,
        ffmpegPath,
        undefined,
      );

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
        serveTranscodedStream(
          req,
          res,
          mockMediaSource,
          '/bin/ffmpeg',
          undefined,
        ),
      ).rejects.toThrow('Access denied');

      expect(res.writeHead).not.toHaveBeenCalled();
    });

    it('logs spawn error', async () => {
      const sourceInput = '/path/to/video.mp4';
      vi.mocked(mockMediaSource.getFFmpegInput).mockResolvedValue(sourceInput);
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new PassThrough();
      mockProcess.stderr = new PassThrough();
      mockProcess.kill = vi.fn();
      mockSpawn.mockReturnValue(mockProcess);

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const mp = serveTranscodedStream(
        req,
        res,
        mockMediaSource,
        'ffmpeg',
        undefined,
      );

      // Wait for the function to proceed past await getFFmpegInput
      await new Promise((resolve) => setTimeout(resolve, 0));

      mockProcess.emit('error', new Error('Spawn problem'));
      await mp;

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Transcode] Spawn Error:',
        expect.anything(),
      );
      consoleSpy.mockRestore();
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
      expect(res.status).toHaveBeenCalledWith(206);
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Range': 'bytes 0-999/1000',
          'Content-Length': '1000',
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
      expect(res.status).toHaveBeenCalledWith(206);
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Range': 'bytes 100-199/1000',
          'Content-Length': '100',
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
      expect(res.status).toHaveBeenCalledWith(206);
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Range': 'bytes 100-999/1000',
        }),
      );
    });

    it('returns 416 for unsatisfiable range', async () => {
      req.headers.range = 'bytes=2000-3000';
      vi.mocked(mockMediaSource.getSize).mockResolvedValue(1000);

      await serveRawStream(req, res, mockMediaSource);

      expect(res.status).toHaveBeenCalledWith(416);
      expect(res.set).toHaveBeenCalledWith(expect.anything());
      expect(res.send).toHaveBeenCalledWith('Requested range not satisfiable.');
    });

    it('returns 416 if start >= totalSize', async () => {
      req.headers.range = '';

      vi.mocked(mockMediaSource.getSize).mockResolvedValue(0);
      await serveRawStream(req, res, mockMediaSource);
      expect(res.status).toHaveBeenCalledWith(416);
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({ 'Content-Range': 'bytes */0' }),
      );
    });

    it('handles stream error during pipe', async () => {
      vi.mocked(mockMediaSource.getSize).mockResolvedValue(1000);
      vi.mocked(mockMediaSource.getMimeType).mockResolvedValue('video/mp4');
      const mockStream = new PassThrough();
      vi.mocked(mockMediaSource.getStream).mockResolvedValue({
        stream: mockStream,
        length: 1000,
      });

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await serveRawStream(req, res, mockMediaSource);

      // Raw stream is synchronous setup once awaited getStream.
      // But let's yield just in case
      await new Promise((r) => setTimeout(r, 0));

      mockStream.emit('error', new Error('Pipe broken'));
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.end).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[RawStream] Stream error:',
        expect.anything(),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('serveStaticFile', () => {
    it('serves file as raw stream', async () => {
      const testPath = '/static/file';
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: true,
        realPath: testPath,
      });
      const mockStream = { pipe: vi.fn(), on: vi.fn(), destroy: vi.fn() };

      vi.mocked(createMediaSource).mockReturnValue({
        getSize: vi.fn().mockResolvedValue(100),
        getMimeType: vi.fn().mockResolvedValue('text/plain'),
        getStream: vi
          .fn()
          .mockResolvedValue({ stream: mockStream, length: 100 }),
        getFFmpegInput: vi.fn(),
      });

      await serveStaticFile(req, res, testPath);
      expect(res.sendFile).toHaveBeenCalledWith(testPath);
    });

    it('handles access denied', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: false });

      await serveStaticFile(req, res, '/static/file');
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access denied.');
    });

    it('handles internal errors', async () => {
      mockAuthorizeFilePath.mockRejectedValue(new Error('Boom'));

      await serveStaticFile(req, res, '/static/file');
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Internal server error.');
    });
  });

  describe('handleStreamRequest', () => {
    it('returns 400 if missing file parameter', async () => {
      req.query = {};
      await handleStreamRequest(req, res, 'ffmpeg');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Missing file parameter');
    });

    it('handles local file by sending file (optimization)', async () => {
      const testFile = '/local/test.mp4';
      req.query = { file: testFile };
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: true,
        realPath: testFile,
      });

      await handleStreamRequest(req, res, 'ffmpeg');
      expect(res.sendFile).toHaveBeenCalledWith(path.basename(testFile), {
        root: path.dirname(testFile),
      });
    });

    it('handles local file access denied', async () => {
      req.query = { file: '/local/secret.mp4' };
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: false });

      await handleStreamRequest(req, res, 'ffmpeg');
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access denied.');
    });

    it('handles transcode request', async () => {
      req.query = { file: '/local/test.mp4', transcode: 'true' };
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: true,
        realPath: '/local/file',
      });

      // We mocked createMediaSource in beforeEach to return standard source
      const sourceInput = '/path/to/media';
      vi.mocked(mockMediaSource.getFFmpegInput).mockResolvedValue(sourceInput);

      const mockStdout = new PassThrough();
      const mockStderr = new PassThrough();
      mockSpawn.mockReturnValue({
        stdout: mockStdout,
        stderr: mockStderr,
        on: vi.fn(),
        kill: vi.fn(),
      } as any);

      await handleStreamRequest(req, res, 'ffmpeg');

      // It calls serveTranscodedStream -> calls spawn
      expect(mockSpawn).toHaveBeenCalled();
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({ 'Content-Type': 'video/mp4' }),
      );
    });

    it('returns 500 if ffmpeg missing for transcode', async () => {
      req.query = { file: '/local/test.mp4', transcode: 'true' };
      await handleStreamRequest(req, res, null);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('FFmpeg binary not found');
    });

    it('falls back to serveRawStream for gdrive files', async () => {
      req.query = { file: 'gdrive://123' };

      // serveRawStream logic will be called.
      await handleStreamRequest(req, res, 'ffmpeg');

      // serveRawStream calls res.status(206)
      expect(res.status).toHaveBeenCalledWith(206);
    });

    it('handles initialization errors', async () => {
      // Use transcode=true to bypass the tryServeDirectFile optimization
      // so we definitely hit createMediaSource
      req.query = { file: '/bad', transcode: 'true' };
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: true,
        realPath: '/local/file',
      });

      // To force error in top level, we can fail createMediaSource
      vi.mocked(createMediaSource).mockImplementation(() => {
        throw new Error('Init fail');
      });

      await handleStreamRequest(req, res, 'ffmpeg');
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Error initializing source');
    });
  });

  it('cleans up stream on request close', async () => {
    const mockStream = { pipe: vi.fn(), on: vi.fn(), destroy: vi.fn() };
    const mockSource = {
      getStream: vi.fn().mockResolvedValue({ stream: mockStream, length: 100 }),
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
      stdout: new PassThrough(),
      stderr: new PassThrough(),
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

    await serveTranscodedStream(
      req,
      res,
      mockSource as any,
      'ffmpeg',
      undefined,
    );

    // Trigger close
    req.emit('close');
    expect(mockProc.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('handles process error', async () => {
    const mockProc = new EventEmitter() as any;
    mockProc.stdout = new PassThrough();
    mockProc.stderr = new PassThrough();
    mockProc.kill = vi.fn();
    mockSpawn.mockReturnValue(mockProc as any);

    const mockSource = {
      getStream: vi.fn(),
      getSize: vi.fn(),
      getMimeType: vi.fn(),
      getFFmpegInput: vi.fn().mockResolvedValue('input'),
    };

    await serveTranscodedStream(
      req,
      res,
      mockSource as any,
      'ffmpeg',
      undefined,
    );

    mockProc.emit('error', new Error('Process Error'));
  });

  it('collects stderr data', async () => {
    const mockProc = new EventEmitter() as any;
    mockProc.stdout = new PassThrough();
    mockProc.stderr = new PassThrough();
    mockProc.kill = vi.fn();
    mockSpawn.mockReturnValue(mockProc as any);

    const mockSource = {
      getStream: vi.fn(),
      getSize: vi.fn(),
      getMimeType: vi.fn(),
      getFFmpegInput: vi.fn().mockResolvedValue('input'),
    };

    await serveTranscodedStream(
      req,
      res,
      mockSource as any,
      'ffmpeg',
      undefined,
    );

    mockProc.stderr.emit('data', 'some log');
  });

  describe('generateFileUrl', () => {
    it('should return error for large Drive file if serverPort is 0', async () => {
      mockGetDriveFileMetadata.mockResolvedValue({
        size: 10 * 1024 * 1024,
        mimeType: 'video/mp4',
      });

      const result = await generateFileUrl('gdrive://123', { serverPort: 0 });
      expect(result).toEqual({
        type: 'error',
        message: 'Local server not ready to stream large file.',
      });
    });

    it('getVideoDuration returns error for Drive file when metadata fails', async () => {
      const mockProvider = {
        getMetadata: vi.fn().mockRejectedValue(new Error('Drive Fail')),
      };
      vi.mocked(getProvider).mockReturnValue(mockProvider as any);

      const result = await getVideoDuration('gdrive://123', 'ffmpeg');
      expect(result).toEqual({ error: 'Duration not available' });
    });

    it('should return error for large local file if serverPort is 0', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      mockFsStat.mockResolvedValue({ size: 10 * 1024 * 1024 }); // > 1MB

      const result = await generateFileUrl('/local/large.mp4', {
        serverPort: 0,
      });
      expect(result).toEqual({
        type: 'error',
        message: 'Local server not ready to stream large file.',
      });
    });

    it('should return http-url for large local file if serverPort > 0', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      mockFsStat.mockResolvedValue({ size: 10 * 1024 * 1024 });

      const result = await generateFileUrl('/local/large.mp4', {
        serverPort: 3000,
      });
      expect(result).toEqual({
        type: 'http-url',
        url: 'http://localhost:3000/video/stream?file=%2Flocal%2Flarge.mp4',
      });
    });

    it('should handle fs errors gracefully', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      mockFsStat.mockRejectedValue(new Error('FS Error'));
      const result = await generateFileUrl('/local/file.mp4', {
        serverPort: 3000,
      });
      expect(result).toEqual({
        type: 'error',
        message: 'FS Error',
      });
    });

    it('should return data-url for small Drive file', async () => {
      mockGetDriveFileMetadata.mockResolvedValue({
        size: 100,
        mimeType: 'video/mp4',
      });
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('data');
        },
      };
      (mockGetDriveStreamWithCache as unknown as Mock).mockResolvedValue({
        stream: mockStream,
        length: 100,
      });

      const result = await generateFileUrl('gdrive://123', {
        serverPort: 3000,
      });
      expect(result.type).toBe('data-url');
    });

    it('should return data-url for small local file', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      mockFsStat.mockResolvedValue({ size: 100 });

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('data');
        },
      };
      mockFsCreateReadStream.mockReturnValue(mockStream);

      const result = await generateFileUrl('/local/small.mp4', {
        serverPort: 3000,
      });
      expect(result.type).toBe('data-url');
    });
  });

  describe('Additional Integration Coverage', () => {
    it('METADATA route handles array input and missing file', async () => {
      const app = createMediaApp({ ffmpegPath: 'ffmpeg', cacheDir: '/cache' });

      // Missing file
      const res1 = await request(app).get('/video/metadata');
      expect(res1.status).toBe(400);

      // Array file
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      const mockProvider = {
        getMetadata: vi.fn().mockResolvedValue({ duration: 100 }),
      };
      vi.mocked(getProvider).mockReturnValue(mockProvider as any);

      // Mocks for getVideoDuration inside serveMetadata
      mockGetFFmpegDuration.mockResolvedValue(100);

      const res2 = await request(app).get(
        '/video/metadata?file=/test.mp4&file=/ignore.mp4',
      );
      expect(res2.status).toBe(200);
      expect(mockAuthorizeFilePath).toHaveBeenCalledWith('/test.mp4');
    });

    it('THUMBNAIL route handles array input and missing file', async () => {
      const app = createMediaApp({ ffmpegPath: 'ffmpeg', cacheDir: '/cache' });

      // Missing file
      const res1 = await request(app).get('/video/thumbnail');
      expect(res1.status).toBe(400);

      // Array file
      mockGetThumbnailCachePath.mockReturnValue('/cache/test.jpg');
      mockCheckThumbnailCache.mockResolvedValue(true);

      const res2 = await request(app).get(
        '/video/thumbnail?file=/test.jpg&file=/ignore.jpg',
      );
      // Expect 200 because we simulate successful cache hit
      expect(res2.status).toBe(200);
    });

    it('Static File Middleware normalizes Windows paths with leading slash', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const app = createMediaApp({ ffmpegPath: 'ffmpeg', cacheDir: '/cache' });

      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });

      await request(app).get('/C:/test.mp4');

      expect(mockAuthorizeFilePath).toHaveBeenCalledWith('C:/test.mp4');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('handleStreamRequest skips sending error if headers already sent', async () => {
      req.query = { file: '/test.mp4' };
      res.headersSent = true;
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      vi.mocked(createMediaSource).mockImplementationOnce(() => {
        throw new Error('Immediate Fail');
      });

      await handleStreamRequest(req, res, 'ffmpeg');
      expect(res.status).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('generateFileUrl returns error when auth is denied', async () => {
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: false,
        message: 'No touchy',
      });
      const result = await generateFileUrl('/secret', { serverPort: 3000 });
      expect(result).toEqual({ type: 'error', message: 'No touchy' });
    });

    it('generateFileUrl returns error when serverPort is 0 but preferHttp is true', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      const mockProvider = {
        getMetadata: vi.fn().mockResolvedValue({ size: 100 }),
      };
      vi.mocked(getProvider).mockReturnValue(mockProvider as any);

      const result = await generateFileUrl('/file.mp4', {
        serverPort: 0,
        preferHttp: true,
      });
      expect(result).toEqual({
        type: 'error',
        message: 'Local server not ready to stream file.',
      });
    });

    it('getVideoDuration returns error for Drive file when metadata fails', async () => {
      const mockProvider = {
        getMetadata: vi.fn().mockRejectedValue(new Error('Drive Fail')),
      };
      vi.mocked(getProvider).mockReturnValue(mockProvider as any);

      const result = await getVideoDuration('gdrive://123', 'ffmpeg');
      expect(result).toEqual({ error: 'Duration not available' });
    });
  });

  describe('HLS Serving', () => {
    describe('serveHlsMaster', () => {
      it('serves master playlist with correct content', async () => {
        req.query = { file: '/path/to/video.mp4' };
        mockAuthorizeFilePath.mockResolvedValue({
          isAllowed: true,
          realPath: '/path/to/video.mp4',
        });

        await serveHlsMaster(req, res, '/path/to/video.mp4');

        expect(res.set).toHaveBeenCalledWith(
          'Content-Type',
          'application/vnd.apple.mpegurl',
        );
        expect(res.send).toHaveBeenCalledWith(
          expect.stringContaining('#EXTM3U'),
        );
        expect(res.send).toHaveBeenCalledWith(
          expect.stringContaining(
            'playlist.m3u8?file=%2Fpath%2Fto%2Fvideo.mp4',
          ),
        );
      });

      it('handles access denied', async () => {
        mockAuthorizeFilePath.mockResolvedValue({ isAllowed: false });
        await serveHlsMaster(req, res, '/path/to/video.mp4');
        expect(res.status).toHaveBeenCalledWith(403);
      });
    });

    describe('serveHlsPlaylist', () => {
      it('serves playlist and ensures session', async () => {
        req.query = { file: '/path/to/video.mp4' };
        mockAuthorizeFilePath.mockResolvedValue({
          isAllowed: true,
          realPath: '/path/to/video.mp4',
        });
        mockHlsGetSessionDir.mockReturnValue('/tmp/hls/session123');
        mockHlsEnsureSession.mockResolvedValue();
        mockFsReadFile.mockResolvedValue(
          '#EXTM3U\nsegment_000.ts\nsegment_001.ts',
        );

        await serveHlsPlaylist(req, res, '/path/to/video.mp4');

        expect(mockHlsEnsureSession).toHaveBeenCalled();
        expect(mockFsReadFile).toHaveBeenCalledWith(
          expect.stringContaining('playlist.m3u8'),
          'utf8',
        );
        // Verify rewrite
        expect(res.send).toHaveBeenCalledWith(
          expect.stringContaining(
            'segment_000.ts?file=%2Fpath%2Fto%2Fvideo.mp4',
          ),
        );
        expect(mockHlsTouchSession).toHaveBeenCalled();
      });

      it('handles session missing dir', async () => {
        mockAuthorizeFilePath.mockResolvedValue({
          isAllowed: true,
          realPath: '/path/to/video.mp4',
        });
        mockHlsGetSessionDir.mockReturnValue(null); // No session dir

        await serveHlsPlaylist(req, res, '/path/to/video.mp4');
        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('serveHlsSegment', () => {
      it('serves segment file if valid', async () => {
        mockAuthorizeFilePath.mockResolvedValue({
          isAllowed: true,
          realPath: '/path/to/video.mp4',
        });
        mockHlsGetSessionDir.mockReturnValue('/tmp/hls/session123');
        mockFsAccess.mockResolvedValue(); // File exists

        await serveHlsSegment(req, res, '/path/to/video.mp4', 'segment_000.ts');

        expect(mockHlsGetSessionDir).toHaveBeenCalled();
        expect(res.sendFile).toHaveBeenCalledWith(
          expect.stringContaining('segment_000.ts'),
        );
        expect(mockHlsTouchSession).toHaveBeenCalled();
      });

      it('returns 404 if session expired', async () => {
        mockAuthorizeFilePath.mockResolvedValue({
          isAllowed: true,
          realPath: '/path/to/video.mp4',
        });
        mockHlsGetSessionDir.mockReturnValue(null);

        await serveHlsSegment(req, res, '/path/to/video.mp4', 'segment_000.ts');
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.send).toHaveBeenCalledWith(
          expect.stringContaining('Session expired'),
        );
      });

      it('blocks invalid segment names', async () => {
        mockAuthorizeFilePath.mockResolvedValue({
          isAllowed: true,
          realPath: '/path/to/video.mp4',
        });
        mockHlsGetSessionDir.mockReturnValue('/tmp/hls/session123');

        await serveHlsSegment(req, res, '/path/to/video.mp4', '../secret.ts');
        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('returns 404 if segment file missing', async () => {
        mockAuthorizeFilePath.mockResolvedValue({
          isAllowed: true,
          realPath: '/path/to/video.mp4',
        });
        mockHlsGetSessionDir.mockReturnValue('/tmp/hls/session123');
        mockFsAccess.mockRejectedValue(new Error('Noent'));

        await serveHlsSegment(req, res, '/path/to/video.mp4', 'segment_999.ts');
        expect(res.status).toHaveBeenCalledWith(404);
      });

      it('handles access denied for segments', async () => {
        mockAuthorizeFilePath.mockResolvedValue({ isAllowed: false });
        await serveHlsSegment(req, res, '/path/to/video.mp4', 'segment_000.ts');
        expect(res.status).toHaveBeenCalledWith(403);
      });
    });
  });

  describe('serveHeatmap', () => {
    it('serves heatmap data on success', async () => {
      req.query = { file: '/path/to/video.mp4', points: '50' };
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: true,
        realPath: '/path/to/video.mp4',
      });
      const mockAnalyzer = {
        generateHeatmap: vi
          .fn()
          .mockResolvedValue({ audio: [], motion: [], points: 50 }),
      };
      // Mock MediaAnalyzer.getInstance
      const { MediaAnalyzer } =
        await import('../../src/core/analysis/media-analyzer');
      vi.spyOn(MediaAnalyzer, 'getInstance').mockReturnValue(
        mockAnalyzer as any,
      );

      await serveHeatmap(req, res, '/path/to/video.mp4');

      expect(mockAnalyzer.generateHeatmap).toHaveBeenCalledWith(
        '/path/to/video.mp4',
        50,
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ points: 50 }),
      );
    });

    it('defaults points to 100', async () => {
      req.query = { file: '/path/to/video.mp4' }; // No points
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: true,
        realPath: '/path/to/video.mp4',
      });
      const mockAnalyzer = {
        generateHeatmap: vi.fn().mockResolvedValue({}),
      };
      const { MediaAnalyzer } =
        await import('../../src/core/analysis/media-analyzer');
      vi.spyOn(MediaAnalyzer, 'getInstance').mockReturnValue(
        mockAnalyzer as any,
      );

      await serveHeatmap(req, res, '/path/to/video.mp4');

      expect(mockAnalyzer.generateHeatmap).toHaveBeenCalledWith(
        '/path/to/video.mp4',
        100,
      );
    });

    it('handles access denied', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: false });
      await serveHeatmap(req, res, '/path/to/video.mp4');
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('handles analyzer errors', async () => {
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: true,
        realPath: '/path/to/video.mp4',
      });
      const mockAnalyzer = {
        generateHeatmap: vi.fn().mockRejectedValue(new Error('Analyzer Fail')),
      };
      const { MediaAnalyzer } =
        await import('../../src/core/analysis/media-analyzer');
      vi.spyOn(MediaAnalyzer, 'getInstance').mockReturnValue(
        mockAnalyzer as any,
      );

      await serveHeatmap(req, res, '/path/to/video.mp4');
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Heatmap generation failed');
    });
  });

  describe('serveHlsSegment - Additional Coverage', () => {
    it('returns 404 when session has expired', async () => {
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: true,
        realPath: '/path/to/video.mp4',
      });

      const MockHlsManager = {
        getSessionDir: vi.fn().mockReturnValue(null),
      };

      const { HlsManager } = await import('../../src/core/hls-manager');
      vi.spyOn(HlsManager, 'getInstance').mockReturnValue(
        MockHlsManager as any,
      );

      await serveHlsSegment(req, res, '/path/to/video.mp4', 'segment_001.ts');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith(
        'Segment not found (Session expired)',
      );
    });
  });

  describe('serveHlsPlaylist - Additional Coverage', () => {
    it('handles session creation failure', async () => {
      mockAuthorizeFilePath.mockResolvedValue({
        isAllowed: true,
        realPath: '/path/to/video.mp4',
      });

      const MockHlsManager = {
        ensureSession: vi
          .fn()
          .mockRejectedValue(new Error('Session creation failed')),
        getSessionDir: vi.fn().mockReturnValue(null),
        touchSession: vi.fn(),
      };

      const { HlsManager } = await import('../../src/core/hls-manager');
      vi.spyOn(HlsManager, 'getInstance').mockReturnValue(
        MockHlsManager as any,
      );

      const req = {
        query: { file: '/path/to/video.mp4' },
      } as any;

      await serveHlsPlaylist(req, res, '/path/to/video.mp4');
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('HLS Generation failed');
    });
  });

  describe('getVideoDuration - Additional Coverage', () => {
    it('handles provider metadata errors gracefully', async () => {
      const mockProvider = {
        getMetadata: vi.fn().mockRejectedValue(new Error('Provider error')),
      };

      vi.doMock('../../src/core/fs-provider-factory', () => ({
        getProvider: vi.fn().mockReturnValue(mockProvider),
      }));

      const result = await getVideoDuration(
        'gdrive://file-id',
        '/usr/bin/ffmpeg',
      );
      expect(result).toHaveProperty('error', 'Duration not available');
    });
  });
});
