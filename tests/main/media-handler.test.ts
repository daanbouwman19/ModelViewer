
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { EventEmitter } from 'events';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

// Mock child_process
vi.mock('child_process', () => ({
  spawn: mocks.spawn,
  default: { spawn: mocks.spawn },
}));

// Mock database
vi.mock('../../src/core/database', () => ({
  getMediaDirectories: vi.fn(),
}));

// Mock fs functions that are used
vi.spyOn(fs, 'existsSync');
vi.spyOn(fs, 'statSync');
vi.spyOn(fs, 'createReadStream');

import {
  getMimeType,
  serveMetadata,
  serveTranscode,
  serveThumbnail,
  serveStaticFile,
  createMediaRequestHandler,
} from '../../src/core/media-handler';
import * as database from '../../src/core/database';
import { spawn } from 'child_process';

// Mock response object
function createMockResponse() {
  return {
    writeHead: vi.fn(),
    end: vi.fn(),
  } as unknown as http.ServerResponse;
}

// Mock request object
function createMockRequest(url: string, headers: any = {}) {
    return {
        url,
        headers,
        on: vi.fn(),
    } as unknown as http.IncomingMessage;
}

describe('media-handler.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMimeType', () => {
    it('should return correct mime types for images', () => {
      expect(getMimeType('test.jpg')).toBe('image/jpeg');
      expect(getMimeType('test.png')).toBe('image/png');
      expect(getMimeType('test.gif')).toBe('image/gif');
    });

    it('should return correct mime types for videos', () => {
      expect(getMimeType('test.mp4')).toBe('video/mp4');
      expect(getMimeType('test.webm')).toBe('video/webm');
      expect(getMimeType('test.mkv')).toBe('video/x-matroska');
      expect(getMimeType('test.avi')).toBe('video/x-msvideo');
    });

    it('should return default mime type for unknown extensions', () => {
      expect(getMimeType('test.xyz')).toBe('application/octet-stream');
    });
  });

  describe('isPathAllowed', () => {
      // This function is not exported, but we can test it indirectly via serveMetadata
      it('should allow paths case-insensitively on win32', async () => {
          // Mock platform
          Object.defineProperty(process, 'platform', { value: 'win32' });

          // Mock path.sep to be backslash
          const originalSep = path.sep;
          // @ts-ignore
          path.sep = '\\';

          // Mock path.resolve to behave like win32 (returning path as is or simplified)
          const resolveSpy = vi.spyOn(path, 'resolve').mockImplementation((p) => p);

          vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([{ path: 'C:\\Media', isActive: true }]);

          const res = createMockResponse();

          // Should pass check
          const mockProcess = new EventEmitter();
          (mockProcess as any).stderr = new EventEmitter();
          mocks.spawn.mockReturnValue(mockProcess);

          await serveMetadata({} as any, res, 'c:\\media\\file.mp4', '/bin/ffmpeg');

          // Wait for spawn
          await new Promise(resolve => setTimeout(resolve, 0));

          expect(res.writeHead).not.toHaveBeenCalledWith(403);

          // Cleanup
          Object.defineProperty(process, 'platform', { value: 'linux' });
          // @ts-ignore
          path.sep = originalSep;
          resolveSpy.mockRestore();
      });

      it('should allow paths normally on linux', async () => {
          Object.defineProperty(process, 'platform', { value: 'linux' });
          // Ensure sep is /
          // @ts-ignore
          path.sep = '/';
          const resolveSpy = vi.spyOn(path, 'resolve').mockImplementation((p) => p);

          vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([{ path: '/media', isActive: true }]);

          const res = createMockResponse();

          // Should pass check
          const mockProcess = new EventEmitter();
          (mockProcess as any).stderr = new EventEmitter();
          mocks.spawn.mockReturnValue(mockProcess);

          await serveMetadata({} as any, res, '/media/file.mp4', '/bin/ffmpeg');

          // Wait for spawn
          await new Promise(resolve => setTimeout(resolve, 0));

          expect(res.writeHead).not.toHaveBeenCalledWith(403);

          resolveSpy.mockRestore();
      });
  });

  describe('serveMetadata', () => {
    it('should return 500 if ffmpegPath is missing', async () => {
      const res = createMockResponse();
      await serveMetadata({} as any, res, '/path/file.mp4', null);
      expect(res.writeHead).toHaveBeenCalledWith(500);
      expect(res.end).toHaveBeenCalledWith('FFmpeg binary not found');
    });

    it('should return 403 if path is not allowed', async () => {
      vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([{ path: '/allowed', isActive: true }]);
      const res = createMockResponse();

      await serveMetadata({} as any, res, '/forbidden/file.mp4', '/bin/ffmpeg');

      expect(res.writeHead).toHaveBeenCalledWith(403);
      expect(res.end).toHaveBeenCalledWith('Access denied');
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(database, 'getMediaDirectories').mockRejectedValue(new Error('DB Error'));
      const res = createMockResponse();

      await serveMetadata({} as any, res, '/any/file.mp4', '/bin/ffmpeg');

      expect(res.writeHead).toHaveBeenCalledWith(500);
      expect(res.end).toHaveBeenCalledWith('Internal Error');
    });

    it('should spawn ffmpeg and return duration', async () => {
      vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([{ path: '/allowed', isActive: true }]);
      const res = createMockResponse();

      const mockStderr = new EventEmitter();
      const mockProcess = new EventEmitter();
      (mockProcess as any).stderr = mockStderr;

      mocks.spawn.mockReturnValue(mockProcess);

      const promise = serveMetadata({} as any, res, '/allowed/file.mp4', '/bin/ffmpeg');

      // Wait for spawn to be called (async due to getMediaDirectories)
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mocks.spawn).toHaveBeenCalled();

      // Simulate ffmpeg output
      mockStderr.emit('data', Buffer.from('Duration: 00:01:30.50'));
      mockProcess.emit('close', 0);

      await promise;

      expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': 'application/json' }));
      expect(res.end).toHaveBeenCalledWith(JSON.stringify({ duration: 90.5 }));
    });

    it('should handle ffmpeg output without duration', async () => {
        vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([{ path: '/allowed', isActive: true }]);
        const res = createMockResponse();

        const mockStderr = new EventEmitter();
        const mockProcess = new EventEmitter();
        (mockProcess as any).stderr = mockStderr;

        mocks.spawn.mockReturnValue(mockProcess);

        const promise = serveMetadata({} as any, res, '/allowed/file.mp4', '/bin/ffmpeg');

        // Wait for spawn
        await new Promise(resolve => setTimeout(resolve, 0));

        // Simulate ffmpeg output with no duration
        mockStderr.emit('data', Buffer.from('Something else'));
        mockProcess.emit('close', 0);

        await promise;

        expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Could not determine duration' }));
    });
  });

  describe('serveTranscode', () => {
    it('should return 500 if ffmpegPath is missing', async () => {
        vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([{ path: '/allowed', isActive: true }]);
        const res = createMockResponse();
        await serveTranscode({} as any, res, '/allowed/file.mp4', null, null);
        expect(res.writeHead).toHaveBeenCalledWith(500);
        expect(res.end).toHaveBeenCalledWith('FFmpeg binary not found');
    });

    it('should spawn ffmpeg and pipe output', async () => {
        vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([{ path: '/allowed', isActive: true }]);
        const req = createMockRequest('/');
        const res = createMockResponse();

        const mockStdout = { pipe: vi.fn() };
        const mockProcess = new EventEmitter();
        (mockProcess as any).stdout = mockStdout;
        (mockProcess as any).kill = vi.fn();

        mocks.spawn.mockReturnValue(mockProcess);

        await serveTranscode(req, res, '/allowed/file.mp4', '10', '/bin/ffmpeg');

        expect(mocks.spawn).toHaveBeenCalledWith('/bin/ffmpeg', expect.arrayContaining(['-ss', '10', '-i', '/allowed/file.mp4']));
        expect(mockStdout.pipe).toHaveBeenCalledWith(res);
        expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': 'video/mp4' }));
    });

     it('should handle process error', async () => {
        vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([{ path: '/allowed', isActive: true }]);
        const req = createMockRequest('/');
        const res = createMockResponse();
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const mockStdout = { pipe: vi.fn() };
        const mockProcess = new EventEmitter();
        (mockProcess as any).stdout = mockStdout;

        mocks.spawn.mockReturnValue(mockProcess);

        await serveTranscode(req, res, '/allowed/file.mp4', null, '/bin/ffmpeg');

        mockProcess.emit('error', new Error('Spawn failed'));

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Spawn Error'), expect.any(Error));
        consoleSpy.mockRestore();
     });

     it('should kill process on request close', async () => {
         vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([{ path: '/allowed', isActive: true }]);
         const req = new EventEmitter() as unknown as http.IncomingMessage; // Use EventEmitter for req to emit close
         const res = createMockResponse();

         const mockStdout = { pipe: vi.fn() };
         const mockProcess = new EventEmitter();
         (mockProcess as any).stdout = mockStdout;
         (mockProcess as any).kill = vi.fn();

         mocks.spawn.mockReturnValue(mockProcess);

         await serveTranscode(req, res, '/allowed/file.mp4', null, '/bin/ffmpeg');

         req.emit('close');

         expect((mockProcess as any).kill).toHaveBeenCalledWith('SIGKILL');
     });
  });

  describe('serveThumbnail', () => {
      it('should spawn ffmpeg for thumbnail', async () => {
        vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([{ path: '/allowed', isActive: true }]);
        const res = createMockResponse();

        const mockStdout = { pipe: vi.fn() };
        const mockProcess = new EventEmitter();
        (mockProcess as any).stdout = mockStdout;

        mocks.spawn.mockReturnValue(mockProcess);

        await serveThumbnail({} as any, res, '/allowed/file.mp4', '/bin/ffmpeg');

        expect(mocks.spawn).toHaveBeenCalledWith('/bin/ffmpeg', expect.arrayContaining(['-frames:v', '1']));
        expect(mockStdout.pipe).toHaveBeenCalledWith(res);
      });

      it('should handle validation errors', async () => {
           vi.spyOn(database, 'getMediaDirectories').mockRejectedValue(new Error('DB Error'));
           const res = createMockResponse();
           await serveThumbnail({} as any, res, '/path', '/bin/ffmpeg');
           expect(res.writeHead).toHaveBeenCalledWith(500);
      });
  });

  describe('serveStaticFile', () => {
      it('should return 404 if file does not exist', async () => {
          vi.spyOn(fs, 'existsSync').mockReturnValue(false);
          const res = createMockResponse();

          await serveStaticFile({} as any, res, '/path/missing.jpg');

          expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
          expect(res.end).toHaveBeenCalledWith('File not found.');
      });

      it('should return 403 if access denied', async () => {
          vi.spyOn(fs, 'existsSync').mockReturnValue(true);
          vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([{ path: '/other', isActive: true }]);
          const res = createMockResponse();

          await serveStaticFile({} as any, res, '/path/file.jpg');

          expect(res.writeHead).toHaveBeenCalledWith(403, expect.any(Object));
      });

      it('should serve full file if no range', async () => {
          vi.spyOn(fs, 'existsSync').mockReturnValue(true);
          vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([{ path: '/path', isActive: true }]);
          vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1000 } as any);
          const pipe = vi.fn();
          vi.spyOn(fs, 'createReadStream').mockReturnValue({ pipe } as any);

          const req = createMockRequest('/path/file.jpg');
          const res = createMockResponse();

          await serveStaticFile(req, res, '/path/file.jpg');

          expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Length': 1000 }));
          expect(pipe).toHaveBeenCalledWith(res);
      });

      it('should serve partial content if range header is present', async () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([{ path: '/path', isActive: true }]);
        vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1000 } as any);
        const pipe = vi.fn();
        vi.spyOn(fs, 'createReadStream').mockReturnValue({ pipe } as any);

        const req = createMockRequest('/path/file.jpg', { range: 'bytes=0-499' });
        const res = createMockResponse();

        await serveStaticFile(req, res, '/path/file.jpg');

        expect(fs.createReadStream).toHaveBeenCalledWith(expect.any(String), { start: 0, end: 499 });
        expect(res.writeHead).toHaveBeenCalledWith(206, expect.objectContaining({ 'Content-Length': 500 }));
        expect(pipe).toHaveBeenCalledWith(res);
      });

      it('should return 416 for unsatisfiable range', async () => {
          vi.spyOn(fs, 'existsSync').mockReturnValue(true);
          vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([{ path: '/path', isActive: true }]);
          vi.spyOn(fs, 'statSync').mockReturnValue({ size: 100 } as any);

          const req = createMockRequest('/path/file.jpg', { range: 'bytes=200-300' });
          const res = createMockResponse();

          await serveStaticFile(req, res, '/path/file.jpg');

          expect(res.writeHead).toHaveBeenCalledWith(416, expect.any(Object));
      });

      it('should handle server errors during serving', async () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([{ path: '/path', isActive: true }]);
        vi.spyOn(fs, 'statSync').mockImplementation(() => { throw new Error('Stat failed'); });
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const req = createMockRequest('/path/file.jpg');
        const res = createMockResponse();

        await serveStaticFile(req, res, '/path/file.jpg');

        expect(res.writeHead).toHaveBeenCalledWith(500);
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
      });
  });

  describe('createMediaRequestHandler', () => {
      it('should return a handler function', () => {
          const handler = createMediaRequestHandler({ ffmpegPath: '/bin/ffmpeg' });
          expect(typeof handler).toBe('function');
      });

      it('should route metadata requests', async () => {
          const handler = createMediaRequestHandler({ ffmpegPath: '/bin/ffmpeg' });
          const req = createMockRequest('http://localhost/video/metadata?file=/path/file.mp4');
          const res = createMockResponse();

          vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([{ path: '/path', isActive: true }]);

          // Setup spawn mock for this specific test case
          const mockStderr = new EventEmitter();
          const mockProcess = new EventEmitter();
          (mockProcess as any).stderr = mockStderr;
          mocks.spawn.mockReturnValue(mockProcess);

          await handler(req, res);
          // Just check if it didn't 404/400 immediately
          expect(res.writeHead).not.toHaveBeenCalledWith(400);
      });

      it('should return 400 for missing file param in metadata', async () => {
         const handler = createMediaRequestHandler({ ffmpegPath: '/bin/ffmpeg' });
         const req = createMockRequest('http://localhost/video/metadata');
         const res = createMockResponse();

         await handler(req, res);
         expect(res.writeHead).toHaveBeenCalledWith(400);
      });

      it('should handle missing req.url', async () => {
        const handler = createMediaRequestHandler({ ffmpegPath: '/bin/ffmpeg' });
        const req = { ...createMockRequest(''), url: undefined } as any;
        const res = createMockResponse();

        await handler(req, res);
        expect(res.writeHead).toHaveBeenCalledWith(400);
      });
  });
});
