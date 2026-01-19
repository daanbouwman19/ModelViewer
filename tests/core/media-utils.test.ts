import { describe, it, expect, vi } from 'vitest';
import { getFFmpegDuration } from '../../src/core/media-utils';

// Hoist mockExeca so it can be used in factory
const { mockExeca } = vi.hoisted(() => ({
  mockExeca: vi.fn(),
}));

vi.mock('execa', () => ({
  execa: mockExeca,
}));

describe('media-utils unit tests', () => {
  describe('getFFmpegDuration', () => {
    it('resolves with duration when ffmpeg provides it', async () => {
      // Mock successful execution with stderr containing duration
      mockExeca.mockResolvedValue({
        exitCode: 0,
        stderr: 'Duration: 00:01:01.50, start:',
      });

      const duration = await getFFmpegDuration('/path/to/video.mp4', 'ffmpeg');
      expect(duration).toBeCloseTo(61.5);
      expect(mockExeca).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining(['-i', '/path/to/video.mp4']),
        expect.objectContaining({ timeout: 30000 })
      );
    });

    it('rejects when duration cannot be determined', async () => {
      // Mock execution with stderr missing duration info
      mockExeca.mockResolvedValue({
        exitCode: 0,
        stderr: 'No duration info here',
      });

      await expect(getFFmpegDuration('/path/to/video.mp4', 'ffmpeg')).rejects.toThrow(
        'Could not determine duration',
      );
    });

    it('rejects when ffmpeg spawn fails', async () => {
      const spawnError = new Error('Spawn failed');
      mockExeca.mockRejectedValue(spawnError);

      await expect(getFFmpegDuration('/path/to/video.mp4', 'ffmpeg')).rejects.toThrow(
        'FFmpeg execution failed',
      );
    });
  });
});
