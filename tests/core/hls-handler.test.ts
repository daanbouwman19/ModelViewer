import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  serveHlsMaster,
  serveHlsPlaylist,
  serveHlsSegment,
} from '../../src/core/hls-handler.ts';
import { HlsManager } from '../../src/core/hls-manager.ts';
import { validateFileAccess } from '../../src/core/access-validator.ts';
import fs from 'fs/promises';
import path from 'path';

// Mock dependencies
vi.mock('../../src/core/hls-manager.ts');
vi.mock('../../src/core/access-validator.ts');
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    access: vi.fn(),
  },
}));
vi.mock('crypto', () => ({
  default: {
    createHash: () => ({
      update: () => ({
        digest: () => 'mock-session-id',
      }),
    }),
  },
}));

describe('hls-handler', () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    vi.resetAllMocks();
    req = {
      query: { file: '/path/to/video.mp4' },
      params: {},
      headers: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
      set: vi.fn(),
      sendFile: vi.fn((_path: string, cb: (err?: any) => void) => {
        if (cb) cb();
      }),
      headersSent: false,
    };
  });

  describe('serveHlsMaster', () => {
    it('should serve master playlist if access is granted', async () => {
      vi.mocked(validateFileAccess).mockResolvedValue({
        success: true,
        path: '/resolved/video.mp4',
      });

      await serveHlsMaster(req, res, '/path/to/video.mp4');

      expect(res.set).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.apple.mpegurl',
      );
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('#EXTM3U'));
      expect(res.send).toHaveBeenCalledWith(
        expect.stringContaining('playlist.m3u8?file=%2Fpath%2Fto%2Fvideo.mp4'),
      );
    });

    it('should handle access denied', async () => {
      vi.mocked(validateFileAccess).mockResolvedValue({
        success: false,
        statusCode: 403,
        error: 'Access denied',
      });

      await serveHlsMaster(req, res, '/path/to/video.mp4');

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access denied');
    });

    it('should not send response if headers already sent', async () => {
      res.headersSent = true;
      vi.mocked(validateFileAccess).mockResolvedValue({
        success: false,
        statusCode: 403,
        error: 'Access denied',
      });

      await serveHlsMaster(req, res, '/path/to/video.mp4');

      expect(res.status).not.toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
    });
  });

  describe('serveHlsPlaylist', () => {
    it('should serve playlist if session exists', async () => {
      vi.mocked(validateFileAccess).mockResolvedValue({
        success: true,
        path: '/resolved/video.mp4',
      });

      const mockHlsManager = {
        ensureSession: vi.fn().mockResolvedValue(undefined),
        getSessionDir: vi.fn().mockReturnValue('/tmp/hls/mock-session-id'),
        touchSession: vi.fn(),
      };
      // @ts-expect-error - Mocking static method
      HlsManager.getInstance.mockReturnValue(mockHlsManager);

      vi.mocked(fs.readFile).mockResolvedValue('#EXTM3U\nsegment_000.ts');

      await serveHlsPlaylist(req, res, '/path/to/video.mp4');

      expect(res.set).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.apple.mpegurl',
      );
      expect(res.send).toHaveBeenCalledWith(
        expect.stringContaining('segment_000.ts?file=%2Fpath%2Fto%2Fvideo.mp4'),
      );
      expect(mockHlsManager.touchSession).toHaveBeenCalledWith(
        'mock-session-id',
      );
    });

    it('should handle access denied', async () => {
      vi.mocked(validateFileAccess).mockResolvedValue({
        success: false,
        statusCode: 403,
        error: 'Access denied',
      });

      await serveHlsPlaylist(req, res, '/path/to/video.mp4');

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access denied');
    });

    it('should throw error if session dir not found', async () => {
      vi.mocked(validateFileAccess).mockResolvedValue({
        success: true,
        path: '/resolved/video.mp4',
      });

      const mockHlsManager = {
        ensureSession: vi.fn().mockResolvedValue(undefined),
        getSessionDir: vi.fn().mockReturnValue(undefined), // Simulating null/undefined return
      };
      // @ts-expect-error - Mocking static method
      HlsManager.getInstance.mockReturnValue(mockHlsManager);

      // Mock console.error to suppress output during test
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await serveHlsPlaylist(req, res, '/path/to/video.mp4');

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('HLS Generation failed');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Playlist error'),
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('serveHlsSegment', () => {
    it('should serve segment if valid name and session exists', async () => {
      vi.mocked(validateFileAccess).mockResolvedValue({
        success: true,
        path: '/resolved/video.mp4',
      });

      const mockHlsManager = {
        getSessionDir: vi.fn().mockReturnValue('/tmp/hls/mock-session-id'),
        touchSession: vi.fn(),
      };
      // @ts-expect-error - Mocking static method
      HlsManager.getInstance.mockReturnValue(mockHlsManager);
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await serveHlsSegment(req, res, '/path/to/video.mp4', 'segment_001.ts');

      expect(res.sendFile).toHaveBeenCalledWith(
        path.join('/tmp/hls/mock-session-id', 'segment_001.ts'),
        expect.any(Function),
      );
    });

    it('should handle access denied', async () => {
      vi.mocked(validateFileAccess).mockResolvedValue({
        success: false,
        statusCode: 403,
        error: 'Access denied',
      });

      await serveHlsSegment(req, res, '/path/to/video.mp4', 'segment_001.ts');

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access denied');
    });

    it('should reject invalid segment names (Security)', async () => {
      vi.mocked(validateFileAccess).mockResolvedValue({
        success: true,
        path: '/resolved/video.mp4',
      });

      const invalidNames = [
        '../passwd',
        'segment_001.ts.bak',
        'segment_abc.ts',
        'other.txt',
        'segment_1.ts/',
      ];

      for (const name of invalidNames) {
        res.status.mockClear();
        res.send.mockClear();
        await serveHlsSegment(req, res, '/path/to/video.mp4', name);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.send).toHaveBeenCalledWith('Invalid segment name');
      }
    });

    it('should return 404 if session expired', async () => {
      vi.mocked(validateFileAccess).mockResolvedValue({
        success: true,
        path: '/resolved/video.mp4',
      });

      const mockHlsManager = {
        getSessionDir: vi.fn().mockReturnValue(undefined),
      };
      // @ts-expect-error - Mocking static method
      HlsManager.getInstance.mockReturnValue(mockHlsManager);

      await serveHlsSegment(req, res, '/path/to/video.mp4', 'segment_001.ts');

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith(
        'Segment not found (Session expired)',
      );
    });

    it('should return 404 if segment file does not exist', async () => {
      vi.mocked(validateFileAccess).mockResolvedValue({
        success: true,
        path: '/resolved/video.mp4',
      });

      const mockHlsManager = {
        getSessionDir: vi.fn().mockReturnValue('/tmp/hls/mock-session-id'),
        touchSession: vi.fn(),
      };
      // @ts-expect-error - Mocking static method
      HlsManager.getInstance.mockReturnValue(mockHlsManager);

      // Mock res.sendFile to fail
      res.sendFile.mockImplementation(
        (_path: string, cb: (err?: any) => void) => {
          if (cb) cb(new Error('File not found'));
        },
      );

      await serveHlsSegment(req, res, '/path/to/video.mp4', 'segment_001.ts');

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('Segment not found');
    });
  });
});
