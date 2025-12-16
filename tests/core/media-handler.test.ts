import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  serveStaticFile,
  serveMetadata,
  serveTranscode,
  serveThumbnail,
  getMimeType,
  createMediaRequestHandler,
} from '../../src/core/media-handler';
import * as security from '../../src/core/security';
import fs from 'fs';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock google-drive-service
vi.mock('../../src/main/google-drive-service', () => ({
  getDriveFileMetadata: vi.fn(),
  getDriveFileStream: vi.fn(),
  getDriveFileThumbnail: vi.fn(),
  getDriveClient: vi.fn(),
  listDriveFiles: vi.fn(),
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
    statSync: vi.fn(),
    createReadStream: vi.fn(),
    promises: {
      stat: vi.fn(),
    },
  };
  return {
    default: mockFs,
    ...mockFs,
  };
});
vi.mock('child_process', () => {
  const spawn = vi.fn();
  return {
    default: { spawn },
    spawn,
  };
});

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
  });

  describe('getMimeType', () => {
    it('returns correct mime types', () => {
      expect(getMimeType('file.jpg')).toBe('image/jpeg');
      expect(getMimeType('file.png')).toBe('image/png');
      expect(getMimeType('file.mp4')).toBe('video/mp4');
      expect(getMimeType('file.unknown')).toBe('application/octet-stream');
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
      const driveService = await import('../../src/main/google-drive-service');
      vi.mocked(driveService.getDriveFileMetadata).mockResolvedValue({
        videoMediaMetadata: { durationMillis: '60000' },
      } as any);

      await serveMetadata(req, res, 'gdrive://123', null);

      expect(res.end).toHaveBeenCalledWith(JSON.stringify({ duration: 60 }));
    });

    it('serveStaticFile pipes Drive stream', async () => {
      const driveService = await import('../../src/main/google-drive-service');
      const mockStream = { pipe: vi.fn() };
      vi.mocked(driveService.getDriveFileStream).mockResolvedValue(
        mockStream as any,
      );
      vi.mocked(driveService.getDriveFileMetadata).mockResolvedValue({
        mimeType: 'video/mp4',
        size: '100',
      } as any);

      await serveStaticFile(req, res, 'gdrive://123');

      expect(res.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          'Content-Type': 'video/mp4',
          'Content-Length': 100,
        }),
      );
      expect(mockStream.pipe).toHaveBeenCalledWith(res);
    });

    it('serveStaticFile handles Drive errors', async () => {
      const driveService = await import('../../src/main/google-drive-service');
      vi.mocked(driveService.getDriveFileStream).mockRejectedValue(
        new Error('Drive Fail'),
      );

      await serveStaticFile(req, res, 'gdrive://123');

      expect(res.writeHead).toHaveBeenCalledWith(500);
      expect(res.end).toHaveBeenCalledWith('Drive Error');
    });

    it('serveTranscode handles Drive Stream Error', async () => {
      const driveService = await import('../../src/main/google-drive-service');
      vi.mocked(driveService.getDriveFileStream).mockRejectedValue(
        new Error('Stream Fail'),
      );

      await serveTranscode(req, res, 'gdrive://123', null, null);

      expect(res.writeHead).toHaveBeenCalledWith(500);
      expect(res.end).toHaveBeenCalledWith('Drive Stream Error');
    });

    it('serveThumbnail handles Drive fetch error', async () => {
      const driveService = await import('../../src/main/google-drive-service');
      (driveService.getDriveFileThumbnail as any).mockRejectedValue(
        new Error('Thumb Fail'),
      );

      await serveThumbnail(req, res, 'gdrive://123', null);

      expect(res.writeHead).toHaveBeenCalledWith(404);
      expect(res.end).toHaveBeenCalledWith('Thumbnail not available');
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
      const stdout = { pipe: vi.fn() };
      const processMock: any = new EventEmitter();
      processMock.stdout = stdout;

      vi.mocked(spawn).mockReturnValue(processMock);

      await serveThumbnail(req, res, 'video.mp4', '/bin/ffmpeg');

      expect(res.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ 'Content-Type': 'image/jpeg' }),
      );
      expect(stdout.pipe).toHaveBeenCalledWith(res);
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
    const handler = createMediaRequestHandler({ ffmpegPath: '/bin/ffmpeg' });

    req.url = '/video/metadata?file=test.mp4';
    req.headers.host = 'localhost';

    const processMock: any = new EventEmitter();
    processMock.stderr = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(processMock);

    const promise = handler(req, res);
    await new Promise((resolve) => setTimeout(resolve, 0));
    processMock.emit('close');
    await promise;

    expect(spawn).toHaveBeenCalledWith(
      '/bin/ffmpeg',
      expect.arrayContaining(['-i', 'test.mp4']),
    );
  });

  it('handles missing file param', async () => {
    const handler = createMediaRequestHandler({ ffmpegPath: '/bin/ffmpeg' });
    req.url = '/video/metadata';
    req.headers.host = 'localhost';

    await handler(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(400);
    expect(res.end).toHaveBeenCalledWith('Missing file parameter');
  });

  it('handles static files', async () => {
    const handler = createMediaRequestHandler({ ffmpegPath: '/bin/ffmpeg' });
    req.url = '/file.txt';
    req.headers.host = 'localhost';

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.promises.stat).mockResolvedValue({ size: 10 } as any);
    vi.mocked(fs.createReadStream).mockReturnValue({ pipe: vi.fn() } as any);

    await handler(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
  });

  it('handles missing file param (stream)', async () => {
    const handler = createMediaRequestHandler({ ffmpegPath: '/bin/ffmpeg' });
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
    vi.mocked(spawn).mockReturnValue(processMock);

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

    vi.mocked(spawn).mockReturnValue(processMock);

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
    await serveThumbnail(req, res, 'test.mp4', '/bin/ffmpeg');
    expect(res.writeHead).toHaveBeenCalledWith(500);
  });

  it('serveThumbnail handles missing ffmpeg', async () => {
    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: true,
    });
    await serveThumbnail(req, res, 'test.mp4', null);
    expect(res.writeHead).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith('FFmpeg binary not found');
  });
});
