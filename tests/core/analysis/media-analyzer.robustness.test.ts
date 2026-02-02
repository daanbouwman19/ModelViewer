import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaAnalyzer } from '../../../src/core/analysis/media-analyzer';
import fs from 'fs/promises';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';

// Mock dependencies
// Mock fs/promises using vi.hoisted for stability
const { mockFs } = vi.hoisted(() => {
  return {
    mockFs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      access: vi.fn(),
    },
  };
});

vi.mock('fs/promises', () => ({
  default: mockFs,
  readFile: mockFs.readFile,
  writeFile: mockFs.writeFile,
  mkdir: mockFs.mkdir,
  access: mockFs.access,
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

vi.mock('../../../src/core/utils/ffmpeg-utils.ts', () => ({
  getFFmpegStreams: vi.fn(),
}));

vi.mock('../../../src/core/media-source', () => ({
  createMediaSource: vi.fn(),
}));

import { getFFmpegStreams } from '../../../src/core/utils/ffmpeg-utils.ts';
import { createMediaSource } from '../../../src/core/media-source';

describe('MediaAnalyzer Robustness', () => {
  let analyzer: MediaAnalyzer;

  beforeEach(() => {
    vi.resetAllMocks();
    (MediaAnalyzer as any).instance = null;
    analyzer = MediaAnalyzer.getInstance();
    analyzer.setCacheDir('/tmp/cache');
    (fs.readFile as any).mockRejectedValue(new Error('ENOENT')); // Cache miss
    (createMediaSource as any).mockImplementation((path: string) => ({
      getFFmpegInput: vi.fn().mockResolvedValue(path),
    }));
  });

  it('should handle missing audio stream gracefully', async () => {
    (getFFmpegStreams as any).mockResolvedValue({
      hasVideo: true,
      hasAudio: false,
    });

    const mockProcess = new EventEmitter();
    const mockStderr = new EventEmitter();
    const mockStdout = new EventEmitter();
    (mockProcess as any).stdout = mockStdout;
    (mockProcess as any).stderr = mockStderr;
    (spawn as any).mockReturnValue(mockProcess);

    const promise = analyzer.generateHeatmap('video_only.mp4', 10);

    // Emit only video stats
    const outputLines = [
      'lavfi.signalstats.YDIF=10',
      'lavfi.signalstats.YDIF=20',
    ].join('\n');

    setTimeout(() => {
      mockStdout.emit('data', Buffer.from(outputLines));
      mockProcess.emit('close', 0);
    }, 10);

    const result = await promise;
    expect(result.points).toBe(10);
    // Should have valid motion
    expect(result.motion[0]).toBeGreaterThan(0);
    // Should have default audio (-90)
    expect(result.audio.every((v) => v === -90)).toBe(true);
  });

  it('should handle missing video stream gracefully', async () => {
    (getFFmpegStreams as any).mockResolvedValue({
      hasVideo: false,
      hasAudio: true,
    });

    const mockProcess = new EventEmitter();
    const mockStderr = new EventEmitter();
    const mockStdout = new EventEmitter();
    (mockProcess as any).stdout = mockStdout;
    (mockProcess as any).stderr = mockStderr;
    (spawn as any).mockReturnValue(mockProcess);

    const promise = analyzer.generateHeatmap('audio_only.mp3', 10);

    // Emit only audio stats
    const outputLines = [
      'lavfi.astats.Overall.RMS_level=-20',
      'lavfi.astats.Overall.RMS_level=-15',
    ].join('\n');

    setTimeout(() => {
      mockStdout.emit('data', Buffer.from(outputLines));
      mockProcess.emit('close', 0);
    }, 10);

    const result = await promise;
    expect(result.points).toBe(10);
    // Should have valid audio
    expect(result.audio[0]).toBeGreaterThan(-90);
    // Should have default motion (0)
    expect(result.motion.every((v) => v === 0)).toBe(true);
  });

  it('should fail if BOTH streams are missing', async () => {
    (getFFmpegStreams as any).mockResolvedValue({
      hasVideo: false,
      hasAudio: false,
    });

    const promise = analyzer.generateHeatmap('empty.file', 10);
    await expect(promise).rejects.toThrow('No video or audio streams found');
  });

  it('should handle partial output lines correctly', async () => {
    (getFFmpegStreams as any).mockResolvedValue({
      hasVideo: true,
      hasAudio: true,
    });
    // Scenario: FFmpeg runs but maybe only outputs one type of stats?
    // Current logic should handle this gracefully by filling with defaults.
    const mockProcess = new EventEmitter();
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    (mockProcess as any).stdout = mockStdout;
    (mockProcess as any).stderr = mockStderr;
    (spawn as any).mockReturnValue(mockProcess);

    const promise = analyzer.generateHeatmap('partial.mp4', 2);

    const outputLines = [
      'lavfi.signalstats.YDIF=10',
      'lavfi.signalstats.YDIF=20',
      // No audio stats
    ].join('\n');

    setTimeout(() => {
      mockStdout.emit('data', Buffer.from(outputLines));
      mockProcess.emit('close', 0);
    }, 10);

    const result = await promise;
    expect(result.points).toBe(2);
    expect(result.motion).toEqual([10, 20]);
    // Audio should be default (-90)
    expect(result.audio).toEqual([-90, -90]);
  });
});
