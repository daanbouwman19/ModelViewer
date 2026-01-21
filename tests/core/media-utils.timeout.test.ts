// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runFFmpeg } from '../../src/core/media-utils';

// Hoist mockExeca so it can be used in factory
const { mockExeca } = vi.hoisted(() => ({
  mockExeca: vi.fn(),
}));

vi.mock('execa', () => ({
  execa: mockExeca,
}));

describe('Security: Process Timeouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should timeout when a process runs too long', async () => {
    // Mock execa to simulate a timeout
    mockExeca.mockResolvedValue({
      timedOut: true,
      exitCode: null,
      stderr: '',
      stdout: '',
      command: 'ffmpeg',
      escapedCommand: 'ffmpeg',
      failed: false,
      isCanceled: false,
      killed: false,
    });

    const command = 'ffmpeg';
    const args = ['-i', 'input.mp4'];
    const timeoutMs = 1000;

    await expect(runFFmpeg(command, args, timeoutMs)).rejects.toThrow(
      `Process timed out after ${timeoutMs}ms`,
    );

    expect(mockExeca).toHaveBeenCalledWith(
      command,
      args,
      expect.objectContaining({
        timeout: timeoutMs,
        reject: false,
      }),
    );
  });

  it('should return result when process completes successfully', async () => {
    mockExeca.mockResolvedValue({
      timedOut: false,
      exitCode: 0,
      stderr: 'ok',
      stdout: '',
      command: 'ffmpeg',
      escapedCommand: 'ffmpeg',
      failed: false,
      isCanceled: false,
      killed: false,
    });

    const command = 'ffmpeg';
    const args = ['-version'];
    const result = await runFFmpeg(command, args);

    expect(result).toEqual({ code: 0, stderr: 'ok' });
    expect(mockExeca).toHaveBeenCalledWith(
      command,
      args,
      expect.objectContaining({
        timeout: 30000, // Default timeout
        reject: false,
      }),
    );
  });
});
