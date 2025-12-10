import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  serveStaticFile,
  serveMetadata,
  serveTranscode,
  serveThumbnail,
  getMimeType,
  createMediaRequestHandler,
} from '../../src/core/media-handler';
import * as database from '../../src/core/database';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

vi.mock('../../src/core/database');
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
    beforeEach(() => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/allowed', isActive: true, id: 1 },
        // On windows this path might be interpreted differently in path.resolve
      ] as any);
    });

    it('returns 404 if file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await serveStaticFile(req, res, '/allowed/file.txt');
      expect(res.writeHead).toHaveBeenCalledWith(404, expect.anything());
    });

    it('returns 403 if path not allowed', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      // We need to ensure logic considers it outside.
      // /forbidden/file.txt
      await serveStaticFile(req, res, '/forbidden/file.txt');
      expect(res.writeHead).toHaveBeenCalledWith(403, expect.anything());
    });

    it('serves full file if no range', async () => {
      // Mock path resolve for isPathAllowed
      // The logic does: path.resolve(filePath).startsWith(path.resolve(dir.path))
      // If we use simple strings and mocks it might be robust enough if we trust path impl.
      // But let's assume valid.

      // I need to make isPathAllowed return true.
      // /allowed/file.mp4

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      // Force isPathAllowed to be true is tricky without partial implementation.
      // But with getMediaDirectories returning /allowed and path /allowed/file.mp4
      // it should pass if path.resolve works correctly in test env.
      // It usually resolves to C:\cwd\allowed\file.mp4.
      // And db mock needs to return relative or absolute?
      // Since I can't easily know absolute path of CWD in test logic matching implementation:
      // I'll assume standard path.resolve behavior.

      // To ensure isPathAllowed passes, I'll mock getMediaDirectories to return current directory resolved.
      const cwd = process.cwd();
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: cwd, isActive: true, id: 1 },
      ] as any);

      await serveStaticFile(req, res, path.join(cwd, 'file.mp4'));

      expect(res.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ 'Content-Length': 100 }),
      );
      expect(mockStream.pipe).toHaveBeenCalledWith(res);
    });

    it('serves partial content with Range', async () => {
      const cwd = process.cwd();
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: cwd, isActive: true, id: 1 },
      ] as any);

      req.headers.range = 'bytes=0-49';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await serveStaticFile(req, res, path.join(cwd, 'file.mp4'));

      expect(res.writeHead).toHaveBeenCalledWith(206, expect.anything());
      // Expect setup stream with {start: 0, end: 49}
      expect(fs.createReadStream).toHaveBeenCalledWith(expect.anything(), {
        start: 0,
        end: 49,
      });
    });
  });

  describe('serveMetadata', () => {
    it('parses duration from stderr', async () => {
      const cwd = process.cwd();
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: cwd, isActive: true, id: 1 },
      ] as any);

      const stderr = new EventEmitter();
      const processMock: any = new EventEmitter();
      processMock.stderr = stderr;

      vi.mocked(spawn).mockReturnValue(processMock);

      await serveMetadata(req, res, path.join(cwd, 'video.mp4'), '/bin/ffmpeg');

      // Emit data
      stderr.emit('data', Buffer.from('Duration: 00:01:00.00'));
      processMock.emit('close');

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
      const cwd = process.cwd();
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: cwd, isActive: true, id: 1 },
      ] as any);

      const stdout = { pipe: vi.fn() };
      const processMock: any = new EventEmitter();
      processMock.stdout = stdout;
      processMock.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(processMock);

      await serveTranscode(
        req,
        res,
        path.join(cwd, 'video.mp4'),
        null,
        '/bin/ffmpeg',
      );

      expect(stdout.pipe).toHaveBeenCalledWith(res);

      // Test cleanup
      req.on.mock.calls[0][1](); // trigger close
      expect(processMock.kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('includes start time', async () => {
      const cwd = process.cwd();
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: cwd, isActive: true, id: 1 },
      ] as any);
      const processMock: any = new EventEmitter();
      processMock.stdout = { pipe: vi.fn() };
      processMock.kill = vi.fn();
      vi.mocked(spawn).mockReturnValue(processMock);

      await serveTranscode(
        req,
        res,
        path.join(cwd, 'video.mp4'),
        '10',
        '/bin/ffmpeg',
      );

      expect(spawn).toHaveBeenCalledWith(
        '/bin/ffmpeg',
        expect.arrayContaining(['-ss', '10']),
      );
    });
  });

  describe('serveThumbnail', () => {
    it('generates thumbnail', async () => {
      const cwd = process.cwd();
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: cwd, isActive: true, id: 1 },
      ] as any);

      const stdout = { pipe: vi.fn() };
      const processMock: any = new EventEmitter();
      processMock.stdout = stdout;

      vi.mocked(spawn).mockReturnValue(processMock);

      await serveThumbnail(
        req,
        res,
        path.join(cwd, 'video.mp4'),
        '/bin/ffmpeg',
      );

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
  });

  it('handles requests', async () => {
    const handler = createMediaRequestHandler({ ffmpegPath: '/bin/ffmpeg' });

    req.url = '/video/metadata?file=test.mp4';
    req.headers.host = 'localhost';

    // Mock serveMetadata to ensure it's called
    // But internal calls are hard to spy if they are direct references.
    // media-handler.ts exports functions and calls them.
    // Inside createMediaRequestHandler, it calls serveMetadata.
    // Is it calling the exported version?
    // TS file: `return serveMetadata(...)`
    // Since they are in same module, it calls the internal function directly usually, NOT the exported one that is mocked.
    // This means my mocks of `serveMetadata` etc in `media-handler.test.ts` might NOT work for `createMediaRequestHandler` if it calls local definition.

    // Check file content:
    // L350: `return serveMetadata(req, res, filePath, ffmpegPath);`
    // It calls the function defined in the file.

    // So I cannot spy on it unless I export it and re-import it? No.
    // I have to test the EFFECTS.

    // /video/metadata logic:
    // checks file param.
    // calls serveMetadata.

    // We can mock spawn again and expect spawn to be called.

    const cwd = process.cwd();
    vi.mocked(database.getMediaDirectories).mockResolvedValue([
      { path: cwd, isActive: true, id: 1 },
    ] as any);

    const processMock: any = new EventEmitter();
    processMock.stderr = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(processMock);

    await handler(req, res);

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

    // Mock serveStaticFile logic (fs exists etc)
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 10 } as any);
    vi.mocked(fs.createReadStream).mockReturnValue({ pipe: vi.fn() } as any);
    const cwd = process.cwd();
    vi.mocked(database.getMediaDirectories).mockResolvedValue([
      { path: cwd, isActive: true, id: 1 },
    ] as any);

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
    // Mock constants if possible? Or just use a really weird extension
    expect(getMimeType('test.xyz')).toBe('application/octet-stream');
  });

  it('serveMetadata handles path validation error', async () => {
    vi.mocked(database.getMediaDirectories).mockRejectedValue(
      new Error('DB Fail'),
    );
    await serveMetadata(req, res, 'test.mp4', '/bin/ffmpeg');
    expect(res.writeHead).toHaveBeenCalledWith(500);
  });

  it('serveMetadata handles duration parse fail', async () => {
    const cwd = process.cwd();
    vi.mocked(database.getMediaDirectories).mockResolvedValue([
      { path: cwd, isActive: true, id: 1 },
    ] as any);

    const processMock: any = new EventEmitter();
    const stderr = new EventEmitter();
    processMock.stderr = stderr;
    vi.mocked(spawn).mockReturnValue(processMock);

    await serveMetadata(req, res, path.join(cwd, 'video.mp4'), '/bin/ffmpeg');

    stderr.emit('data', Buffer.from('No duration here'));
    processMock.emit('close');

    expect(res.end).toHaveBeenCalledWith(
      JSON.stringify({ error: 'Could not determine duration' }),
    );
  });

  it('serveTranscode handles validation error', async () => {
    vi.mocked(database.getMediaDirectories).mockRejectedValue(
      new Error('DB Fail'),
    );
    await serveTranscode(req, res, 'test.mp4', null, '/bin/ffmpeg');
    expect(res.writeHead).toHaveBeenCalledWith(500);
  });

  it('serveTranscode handles missing ffmpeg', async () => {
    const cwd = process.cwd();
    vi.mocked(database.getMediaDirectories).mockResolvedValue([
      { path: cwd, isActive: true, id: 1 },
    ] as any);
    await serveTranscode(req, res, path.join(cwd, 'test.mp4'), null, null);
    expect(res.writeHead).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith('FFmpeg binary not found');
  });

  it('serveTranscode handles spawn error', async () => {
    const cwd = process.cwd();
    vi.mocked(database.getMediaDirectories).mockResolvedValue([
      { path: cwd, isActive: true, id: 1 },
    ] as any);

    const processMock: any = new EventEmitter();
    processMock.stdout = { pipe: vi.fn() };
    processMock.kill = vi.fn();

    vi.mocked(spawn).mockReturnValue(processMock);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await serveTranscode(
      req,
      res,
      path.join(cwd, 'video.mp4'),
      null,
      '/bin/ffmpeg',
    );

    processMock.emit('error', new Error('Spawn fail'));
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('serveThumbnail handles validation error', async () => {
    vi.mocked(database.getMediaDirectories).mockRejectedValue(
      new Error('DB Fail'),
    );
    await serveThumbnail(req, res, 'test.mp4', '/bin/ffmpeg');
    expect(res.writeHead).toHaveBeenCalledWith(500);
  });

  it('serveThumbnail handles missing ffmpeg', async () => {
    const cwd = process.cwd();
    vi.mocked(database.getMediaDirectories).mockResolvedValue([
      { path: cwd, isActive: true, id: 1 },
    ] as any);
    await serveThumbnail(req, res, path.join(cwd, 'test.mp4'), null);
    expect(res.writeHead).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith('FFmpeg binary not found');
  });
});
