import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaHandler } from '../../src/core/media-handler';
import { validateFileAccess } from '../../src/core/access-validator';
import { isDrivePath } from '../../src/core/media-utils';
import { MediaAnalyzer } from '../../src/core/analysis/media-analyzer';

// Mock dependencies
vi.mock('../../src/core/access-validator');
vi.mock('../../src/core/media-utils');
vi.mock('../../src/core/media-source');
vi.mock('../../src/core/utils/ffmpeg-utils');
vi.mock('../../src/core/analysis/media-analyzer');

describe('MediaHandler Branch Coverage', () => {
  let mediaHandler: MediaHandler;
  const mockRes = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn(),
    json: vi.fn(),
    headersSent: false,
    sendFile: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mediaHandler = new MediaHandler({
      ffmpegPath: '/usr/bin/ffmpeg',
      cacheDir: '/tmp',
    });
    mockRes.headersSent = false;
  });

  describe('handleStreamRequest', () => {
    it('should handle missing file parameter', async () => {
      const req = { query: {} } as any;
      await mediaHandler.handleStreamRequest(req, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith('Missing file parameter');
    });

    it('should handle access denied', async () => {
      const req = { query: { file: 'secret.mp4' } } as any;
      (validateFileAccess as any).mockResolvedValue({
        success: false,
        statusCode: 403,
        error: 'Access denied',
      });

      await mediaHandler.handleStreamRequest(req, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.send).toHaveBeenCalledWith('Access denied');
    });

    it('should handle internal errors gracefully', async () => {
      const req = { query: { file: 'video.mp4' } } as any;
      (validateFileAccess as any).mockRejectedValue(
        new Error('Unexpected crash'),
      );

      await mediaHandler.handleStreamRequest(req, mockRes);
      // It catches and logs error
      // If headers not sent, it sends 500
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('Error initializing source');
    });
  });

  describe('serveMetadata', () => {
    it('should respond with error if validateFileAccess fails', async () => {
      (validateFileAccess as any).mockResolvedValue({
        success: false,
        statusCode: 404,
        error: 'Not found',
      });

      await mediaHandler.serveMetadata({} as any, mockRes, 'missing.mp4');
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.send).toHaveBeenCalledWith('Not found');
    });

    it('should return 500 if ffmpeg invalid and not drive path', async () => {
      (validateFileAccess as any).mockResolvedValue({
        success: true,
        path: '/local/file.mp4',
      });
      (isDrivePath as any).mockReturnValue(false);

      const handlerNoFfmpeg = new MediaHandler({
        ffmpegPath: null,
        cacheDir: '/tmp',
      });

      await handlerNoFfmpeg.serveMetadata({} as any, mockRes, 'file.mp4');
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('FFmpeg binary not found');
    });
  });

  describe('serveHeatmapProgress', () => {
    it('should handle access denied', async () => {
      (validateFileAccess as any).mockResolvedValue({
        success: false,
        statusCode: 403,
        error: 'Denied',
      });
      await mediaHandler.serveHeatmapProgress(
        {} as any,
        mockRes,
        'private.mp4',
      );
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.send).toHaveBeenCalledWith('Denied');
    });

    it('should return null progress if analyzer returns null', async () => {
      (validateFileAccess as any).mockResolvedValue({
        success: true,
        path: '/clean.mp4',
      });
      // Mock MediaAnalyzer singleton
      const mockAnalyzer = { getProgress: vi.fn().mockReturnValue(null) };
      (MediaAnalyzer.getInstance as any).mockReturnValue(mockAnalyzer);

      await mediaHandler.serveHeatmapProgress({} as any, mockRes, 'clean.mp4');
      expect(mockRes.json).toHaveBeenCalledWith({ progress: null });
    });

    it('should return progress value', async () => {
      (validateFileAccess as any).mockResolvedValue({
        success: true,
        path: '/processing.mp4',
      });
      const mockAnalyzer = { getProgress: vi.fn().mockReturnValue(50) };
      (MediaAnalyzer.getInstance as any).mockReturnValue(mockAnalyzer);

      await mediaHandler.serveHeatmapProgress(
        {} as any,
        mockRes,
        'processing.mp4',
      );
      expect(mockRes.json).toHaveBeenCalledWith({ progress: 50 });
    });
  });
});
