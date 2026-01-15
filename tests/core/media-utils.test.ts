import { describe, it, expect, vi } from 'vitest';
import { PassThrough, EventEmitter } from 'stream';
import { getFFmpegDuration } from '../../src/core/media-utils';

const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: mockSpawn,
  default: { spawn: mockSpawn },
}));

function createMockProcess() {
  const mockProc = new EventEmitter() as any;
  mockProc.stdout = new PassThrough();
  mockProc.stderr = new EventEmitter();
  mockSpawn.mockReturnValue(mockProc);
  return mockProc;
}

describe('media-utils unit tests', () => {
  describe('getFFmpegDuration', () => {
    it('resolves with duration when ffmpeg provides it', async () => {
      const mockProc = createMockProcess();

      const promise = getFFmpegDuration('/path/to/video.mp4', 'ffmpeg');
      await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

      mockProc.stderr.emit('data', 'Duration: 00:01:01.50, start:');
      mockProc.emit('close', 0);

      const duration = await promise;
      expect(duration).toBeCloseTo(61.5);
    });

    it('rejects when duration cannot be determined', async () => {
      const mockProc = createMockProcess();

      const promise = getFFmpegDuration('/path/to/video.mp4', 'ffmpeg');
      await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

      mockProc.stderr.emit('data', 'No duration info here');
      mockProc.emit('close', 0);

      await expect(promise).rejects.toThrow('Could not determine duration');
    });

    it('rejects when ffmpeg spawn fails', async () => {
      const mockProc = createMockProcess();

      const promise = getFFmpegDuration('/path/to/video.mp4', 'ffmpeg');
      await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

      mockProc.emit('error', new Error('Spawn failed'));

      await expect(promise).rejects.toThrow('FFmpeg execution failed');
    });
  });
});
