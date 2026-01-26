// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runFFmpeg,
  getFFmpegDuration,
} from '../../../src/core/utils/ffmpeg-utils';

// Hoist mockExeca so it can be used in factory
const { mockExeca } = vi.hoisted(() => ({
  mockExeca: vi.fn(),
}));

vi.mock('execa', () => ({
  execa: mockExeca,
}));

describe('ffmpeg-utils coverage tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runFFmpeg', () => {
    it('should throw timeout error if execa throws with timedOut property', async () => {
      // Simulate execa rejecting with a timeout object
      const timeoutError: any = new Error('Command timed out');
      timeoutError.timedOut = true;
      mockExeca.mockRejectedValue(timeoutError);

      await expect(runFFmpeg('ffmpeg', [])).rejects.toThrow(
        'Process timed out after 30000ms',
      );
    });

    it('should rethrow generic errors from execa', async () => {
      const genericError = new Error('Something exploded');
      mockExeca.mockRejectedValue(genericError);

      await expect(runFFmpeg('ffmpeg', [])).rejects.toThrow(
        'Something exploded',
      );
    });

    it('should timeout when a process runs too long (resolved result)', async () => {
      mockExeca.mockResolvedValue({
        timedOut: true,
      });

      const timeoutMs = 1000;
      await expect(runFFmpeg('ffmpeg', [], timeoutMs)).rejects.toThrow(
        `Process timed out after ${timeoutMs}ms`,
      );
    });
  });

  describe('getFFmpegDuration', () => {
    it('resolves with duration when ffmpeg provides it', async () => {
      mockExeca.mockResolvedValue({
        exitCode: 0,
        stderr: 'Duration: 00:01:01.50, start:',
      });

      const duration = await getFFmpegDuration('/path/to/video.mp4', 'ffmpeg');
      expect(duration).toBeCloseTo(61.5);
    });

    it('rejects when duration cannot be determined', async () => {
      mockExeca.mockResolvedValue({
        exitCode: 0,
        stderr: 'No duration info here',
      });

      await expect(
        getFFmpegDuration('/path/to/video.mp4', 'ffmpeg'),
      ).rejects.toThrow('Could not determine duration');
    });

    it('rejects when ffmpeg spawn fails (logs error)', async () => {
      const spawnError = new Error('Spawn failed');
      mockExeca.mockRejectedValue(spawnError);

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(
        getFFmpegDuration('/path/to/video.mp4', 'ffmpeg'),
      ).rejects.toThrow('FFmpeg execution failed');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Metadata] FFmpeg spawn error:',
        spawnError,
      );
      consoleSpy.mockRestore();
    });
  });
});
