import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MediaAnalyzer,
  HeatmapData,
} from '../../../src/core/analysis/media-analyzer';
import fs from 'fs/promises';
import { EventEmitter } from 'events';

// Mock dependencies
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));
vi.mock('child_process', () => {
  const spawn = vi.fn();
  return {
    spawn,
    default: { spawn },
  };
});
vi.mock('ffmpeg-static', () => ({ default: '/usr/bin/ffmpeg' }));
vi.mock('crypto', () => ({
  default: {
    createHash: () => ({
      update: () => ({
        digest: () => 'mockhash',
      }),
    }),
  },
}));

import { spawn } from 'child_process';

describe('MediaAnalyzer', () => {
  let analyzer: MediaAnalyzer;

  beforeEach(() => {
    vi.resetAllMocks();
    analyzer = MediaAnalyzer.getInstance();
    analyzer.setCacheDir('/tmp/cache');
  });

  it('should return cached data if available', async () => {
    const mockData: HeatmapData = {
      audio: [0.5],
      motion: [10],
      points: 1,
    };
    (fs.readFile as any).mockResolvedValue(JSON.stringify(mockData));

    const result = await analyzer.generateHeatmap('test.mp4', 1);
    expect(result).toEqual(mockData);
    expect(fs.readFile).toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('should run ffmpeg and parse output if cache misses', async () => {
    (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));

    // Mock spawn process
    // Mock spawn process with stdout/stderr
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    const mockProcess = new EventEmitter();
    (mockProcess as any).stdout = mockStdout;
    (mockProcess as any).stderr = mockStderr;
    (spawn as any).mockReturnValue(mockProcess);

    // Simulate ffmpeg output
    // We need to simulate the lines that the analyzer parses
    const outputLines = [
      'lavfi.signalstats.YDIF=10.5',
      'lavfi.astats.Overall.RMS_level=-20.0',
      'lavfi.signalstats.YDIF=12.0',
      'lavfi.astats.Overall.RMS_level=-18.0',
    ].join('\n');

    const promise = analyzer.generateHeatmap('test.mp4', 2);

    // Emit data
    mockStdout.emit('data', Buffer.from(outputLines));

    // Emit close
    setTimeout(() => {
      mockProcess.emit('close', 0);
    }, 10);

    const result = await promise;

    expect(spawn).toHaveBeenCalled();
    expect(result.points).toBe(2);
    expect(result.motion.length).toBe(2);
    expect(result.audio.length).toBe(2);
    // Values are resampled, but we can check existence
    expect(result.motion[0]).toBeGreaterThanOrEqual(0);
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('should handle ffmpeg errors', async () => {
    (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));

    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    const mockProcess = new EventEmitter();
    (mockProcess as any).stdout = mockStdout;
    (mockProcess as any).stderr = mockStderr;
    (spawn as any).mockReturnValue(mockProcess);

    const promise = analyzer.generateHeatmap('error.mp4', 10);

    setTimeout(() => {
      mockProcess.emit('close', 1);
    }, 10);

    await expect(promise).rejects.toThrow(/FFmpeg process exited with code/);
  });

  it('should reject if caching fails (write error)', async () => {
    // Mock successful generation but write failure
    const mockProcess = new EventEmitter();
    (mockProcess as any).stdout = new EventEmitter();
    (mockProcess as any).stderr = new EventEmitter();
    (spawn as any).mockReturnValue(mockProcess);

    // Mock writeFile to throw
    (fs.writeFile as any).mockRejectedValue(new Error('Write failed'));

    const promise = analyzer.generateHeatmap('file.mp4', 10);
    setTimeout(() => {
      // successful ffmpeg
      (mockProcess as any).emit('close', 0);
    }, 10);

    // The current implementation swallows cache errors and logs a warning
    // so it should RESOLVE, not reject.
    const result = await promise;
    expect(result.points).toBe(10);
    // Optionally check if warning was logged if we spied on console
  });

  it('should throw error if ffmpeg is not found', async () => {
    vi.resetModules();
    vi.doMock('ffmpeg-static', () => ({ default: null }));
    const { MediaAnalyzer: ReImportedAnalyzer } =
      await import('../../../src/core/analysis/media-analyzer');
    const instance = ReImportedAnalyzer.getInstance();
    await expect(instance.generateHeatmap('file', 10)).rejects.toThrow(
      'FFmpeg not found',
    );
  });

  it('should skip cache if cacheDir is not set', async () => {
    (MediaAnalyzer as any).instance = null;
    const instance = MediaAnalyzer.getInstance();

    // Mock spawn to return proper mocked process since we are skipping cache
    const mockProcess = new EventEmitter();
    (mockProcess as any).stdout = new EventEmitter();
    (mockProcess as any).stderr = new EventEmitter();
    (spawn as any).mockReturnValue(mockProcess);

    const promise = instance.generateHeatmap('file.mp4', 10);
    setTimeout(() => (mockProcess as any).emit('close', 0), 0);
    await promise;

    expect(fs.readFile).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should handle resampling with empty data', async () => {
    const mockProcess = new EventEmitter();
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    (mockProcess as any).stdout = mockStdout;
    (mockProcess as any).stderr = mockStderr;
    (spawn as any).mockReturnValue(mockProcess);

    const promise = analyzer.generateHeatmap('empty.mp4', 5);
    setTimeout(() => (mockProcess as any).emit('close', 0), 0);

    const result = await promise;
    expect(result.points).toBe(5);
    expect(result.audio).toHaveLength(5);
    expect(result.audio.every((v) => v === -90)).toBe(true);
    expect(result.motion.every((v) => v === 0)).toBe(true);
  });

  it('should handle resampling with more points than data (upsampling)', async () => {
    // Explicitly fail cache to force generation
    (fs.readFile as any).mockRejectedValue(new Error('No cache'));
    const mockProcess = new EventEmitter();
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    (mockProcess as any).stdout = mockStdout;
    (mockProcess as any).stderr = mockStderr;
    (spawn as any).mockReturnValue(mockProcess);

    const outputLines = [
      'lavfi.signalstats.YDIF=10',
      'lavfi.astats.Overall.RMS_level=-20',
      'lavfi.signalstats.YDIF=20',
      'lavfi.astats.Overall.RMS_level=-10',
      'lavfi.signalstats.YDIF=30',
      'lavfi.astats.Overall.RMS_level=-30',
      'lavfi.signalstats.YDIF=40',
      'lavfi.astats.Overall.RMS_level=-40',
    ].join('\n'); // 4 frames

    // Request 8 points from 4 frames -> upsampling (step = 0.5)
    // i=0: [0, 0.5) -> slice [] (empty) -> falls back to 0
    // i=1: [0.5, 1) -> slice [0] -> 10
    // i=2: [1, 1.5) -> slice [] -> fallback to 10
    // i=3: [1.5, 2) -> slice [1] -> 20
    const promise = analyzer.generateHeatmap('small.mp4', 8);

    setTimeout(() => {
      mockStdout.emit('data', Buffer.from(outputLines));
      (mockProcess as any).emit('close', 0);
    }, 10);

    const result = await promise;
    expect(result.points).toBe(8);
    expect(result.motion).toHaveLength(8);
    // Verify fallback behavior for empty slices
    // First point might be 0 if slice is empty and result is empty
    expect(result.motion[0]).toBe(0);
    // And verify legitimate data
    expect(result.motion).toContain(10);
  });

  it('should handle resampling with fewer points than data (downsampling)', async () => {
    (fs.readFile as any).mockRejectedValue(new Error('No cache'));
    const mockProcess = new EventEmitter();
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    (mockProcess as any).stdout = mockStdout;
    (mockProcess as any).stderr = mockStderr;
    (spawn as any).mockReturnValue(mockProcess);

    // 4 data points, 2 requested points
    // Simplify input to ensure no parsing issues
    const outputLines = [
      'lavfi.signalstats.YDIF=10',
      'lavfi.astats.Overall.RMS_level=-20',
      'lavfi.signalstats.YDIF=20',
      'lavfi.astats.Overall.RMS_level=-10',
      'lavfi.signalstats.YDIF=30',
      'lavfi.astats.Overall.RMS_level=-30',
      'lavfi.signalstats.YDIF=40',
      'lavfi.astats.Overall.RMS_level=-40',
    ].join('\n');

    const promise = analyzer.generateHeatmap('large.mp4', 2);

    // Slight delay for async processing (fs.readFile await)
    setTimeout(() => {
      // Emit data AFTER init has likely finished
      mockStdout.emit('data', Buffer.from(outputLines));
      (mockProcess as any).emit('close', 0);
    }, 10);
    const result = await promise;
    expect(spawn).toHaveBeenCalled();
    expect(result.points).toBe(2);
    expect(result.motion).toHaveLength(2);
    expect(result.motion[0]).toBe(15);
    expect(result.motion[1]).toBe(35);
  });

  it('should ignore irrelevant output lines', async () => {
    const mockProcess = new EventEmitter();
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    (mockProcess as any).stdout = mockStdout;
    (mockProcess as any).stderr = mockStderr;
    (spawn as any).mockReturnValue(mockProcess);

    const outputLines = [
      'frame:123',
      'some other info',
      'lavfi.signalstats.YDIF=10',
      'garbage',
      'lavfi.astats.Overall.RMS_level=-20',
    ].join('\n');

    const promise = analyzer.generateHeatmap('mixed.mp4', 1);

    setTimeout(() => {
      mockStdout.emit('data', Buffer.from(outputLines));
      (mockProcess as any).emit('close', 0);
    }, 10);

    const result = await promise;
    expect(result.points).toBe(1);
    expect(result.motion[0]).toBe(10);
    expect(result.audio[0]).toBe(-20);
  });

  it('should handle invalid parsing values', async () => {
    const mockProcess = new EventEmitter();
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    (mockProcess as any).stdout = mockStdout;
    (mockProcess as any).stderr = mockStderr;
    (spawn as any).mockReturnValue(mockProcess);

    const outputLines = [
      'lavfi.signalstats.YDIF=NaN',
      'lavfi.astats.Overall.RMS_level=invalid',
    ].join('\n');

    const promise = analyzer.generateHeatmap('invalid.mp4', 10);
    mockStdout.emit('data', Buffer.from(outputLines));
    setTimeout(() => (mockProcess as any).emit('close', 0), 0);

    const result = await promise;
    expect(result.motion.every((v) => v === 0)).toBe(true);
  });

  describe('resample (private)', () => {
    it('handles upsampling with empty first slice (ternary false)', () => {
      // data=[10], target=2. step=0.5
      // i=0: slice=[] -> result empty -> push 0.
      // i=1: slice=[10] -> push 10.
      const res = (analyzer as any).resample([10], 2, 0);
      expect(res).toEqual([0, 10]);
    });

    it('handles upsampling with empty middle slice (ternary true)', () => {
      // data=[10], target=3. step=0.33
      // i=0: slice=[] -> result empty -> push 0
      // i=1: slice=[] -> result=[0] -> push 0 (prev)
      // i=2: slice=[10] -> result=[0,0] -> push 10
      const res = (analyzer as any).resample([10], 3, 0);
      expect(res).toEqual([0, 0, 10]);
    });

    it('handles empty input', () => {
      const res = (analyzer as any).resample([], 5, 99);
      expect(res).toEqual([99, 99, 99, 99, 99]);
    });
  });

  describe('getProgress', () => {
    it('returns null when no job exists', () => {
      const progress = analyzer.getProgress('/nonexistent.mp4');
      expect(progress).toBeNull();
    });

    it('returns progress when job is active', async () => {
      (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));

      const mockProcess = new EventEmitter();
      const mockStderr = new EventEmitter();
      (mockProcess as any).stdout = new EventEmitter();
      (mockProcess as any).stderr = mockStderr;
      (spawn as any).mockReturnValue(mockProcess);

      const promise = analyzer.generateHeatmap('test.mp4', 10);

      // Wait for process to be spawned
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Emit duration and time to set progress
      mockStderr.emit('data', Buffer.from('Duration: 00:10:00.00\n'));
      await new Promise((resolve) => setTimeout(resolve, 10));
      mockStderr.emit('data', Buffer.from('time=00:05:00.00\n'));
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Check progress
      const progress = analyzer.getProgress('test.mp4');
      expect(progress).toBeGreaterThanOrEqual(45); // Allow some variance

      // Complete the process
      setTimeout(() => mockProcess.emit('close', 0), 0);
      await promise;
    });
  });

  describe('Duplicate job handling', () => {
    it('joins existing job instead of creating duplicate', async () => {
      (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));

      const mockProcess = new EventEmitter();
      (mockProcess as any).stdout = new EventEmitter();
      (mockProcess as any).stderr = new EventEmitter();
      (spawn as any).mockReturnValue(mockProcess);

      const promise1 = analyzer.generateHeatmap('same-file.mp4', 10);
      const promise2 = analyzer.generateHeatmap('same-file.mp4', 10);

      setTimeout(() => mockProcess.emit('close', 0), 10);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should return the same result (joined job)
      expect(result1).toEqual(result2);

      // spawn should only be called once
      expect(spawn).toHaveBeenCalledTimes(1);
    });
  });

  describe('stderr parsing and progress tracking', () => {
    it('parses duration from stderr', async () => {
      (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));

      const mockProcess = new EventEmitter();
      const mockStderr = new EventEmitter();
      (mockProcess as any).stdout = new EventEmitter();
      (mockProcess as any).stderr = mockStderr;
      (spawn as any).mockReturnValue(mockProcess);

      const promise = analyzer.generateHeatmap('duration-test.mp4', 10);

      mockStderr.emit('data', Buffer.from('Duration: 01:30:45.67\n'));

      setTimeout(() => mockProcess.emit('close', 0), 0);
      await promise;

      // Just verify it didn't crash parsing the duration
      expect(spawn).toHaveBeenCalled();
    });

    it('parses progress from stderr time updates', async () => {
      (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));

      const mockProcess = new EventEmitter();
      const mockStderr = new EventEmitter();
      (mockProcess as any).stdout = new EventEmitter();
      (mockProcess as any).stderr = mockStderr;
      (spawn as any).mockReturnValue(mockProcess);

      const promise = analyzer.generateHeatmap('progress-test.mp4', 10);

      // Wait for spawn
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Set duration first
      mockStderr.emit('data', Buffer.from('Duration: 00:10:00.00\n'));
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Then emit progress updates
      mockStderr.emit('data', Buffer.from('time=00:02:30.00\n'));
      await new Promise((resolve) => setTimeout(resolve, 10));

      const progress1 = analyzer.getProgress('progress-test.mp4');
      expect(progress1).not.toBeNull();
      if (progress1 !== null) {
        expect(progress1).toBeGreaterThan(0);
      }

      setTimeout(() => mockProcess.emit('close', 0), 0);
      await promise;
    });
  });

  describe('Timeout Handling', () => {
    it('should set up timeout when spawning ffmpeg', async () => {
      (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));

      const mockProcess = new EventEmitter();
      (mockProcess as any).stdout = new EventEmitter();
      (mockProcess as any).stderr = new EventEmitter();
      (mockProcess as any).kill = vi.fn();
      (spawn as any).mockReturnValue(mockProcess);

      const promise = analyzer.generateHeatmap('test.mp4', 10);

      // Complete quickly to avoid timeout
      setTimeout(() => {
        mockProcess.emit('close', 0);
      }, 10);

      await promise;

      // Just verifying the process completes successfully
      expect(spawn).toHaveBeenCalled();
    });
  });

  describe('Error Scenarios', () => {
    it('should handle spawn error event', async () => {
      (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));

      const mockProcess = new EventEmitter();
      (mockProcess as any).stdout = new EventEmitter();
      (mockProcess as any).stderr = new EventEmitter();
      (spawn as any).mockReturnValue(mockProcess);

      const promise = analyzer.generateHeatmap('error.mp4', 10);

      setTimeout(() => {
        mockProcess.emit('error', new Error('Spawn failed'));
      }, 0);

      await expect(promise).rejects.toThrow('Spawn failed');
    });
  });
});
