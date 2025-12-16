import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IMediaSource } from '../../src/core/media-source-types';
import { PassThrough } from 'stream';

// Hoist mocks to ensure shared reference
const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: mockSpawn,
  default: { spawn: mockSpawn },
}));

// Import code under test AFTER mocking
import {
  serveTranscodedStream,
  serveRawStream,
} from '../../src/core/media-handler';

// Mock IMediaSource
const mockMediaSource = {
  getFFmpegInput: vi.fn(),
  getStream: vi.fn(),
  getMimeType: vi.fn(),
  getSize: vi.fn(),
} as unknown as IMediaSource;

describe('media-handler unit tests', () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawn.mockReset(); // Reset the spy
    req = { headers: {}, on: vi.fn() };
    res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: false,
      on: vi.fn(),
      once: vi.fn(),
      emit: vi.fn(),
      write: vi.fn(),
    };
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
  });
});
