// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runFFmpeg,
  getFFmpegDuration,
  getFFmpegStreams,
  getTranscodeArgs,
  getThumbnailArgs,
  parseFFmpegDuration,
  getHlsTranscodeArgs,
} from '../../../src/core/utils/ffmpeg-utils';

// Hoist mockExeca so it can be used in factory
const { mockExeca } = vi.hoisted(() => ({
  mockExeca: vi.fn(),
}));

vi.mock('execa', () => ({
  execa: mockExeca,
}));

describe('FFmpeg Utils Combined Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // From ffmpeg-utils.params.test.ts
  describe('getTranscodeArgs', () => {
    const INPUT_PATH = '/path/to/video.mp4';

    it('returns basic arguments without start time', () => {
      const args = getTranscodeArgs(INPUT_PATH, undefined);

      // Performance flags
      expect(args).toContain('-hide_banner');
      expect(args).toContain('-loglevel');
      expect(args).toContain('error');

      // Core inputs
      expect(args).toContain(INPUT_PATH);
      expect(args).toContain('pipe:1');
      expect(args).toContain('libx264');

      // Ensure no start time arg
      expect(args).not.toContain('-ss');
    });

    // Parameterized tests for various valid time formats
    const validTimes = [
      ['10', 'simple seconds'],
      ['10.5', 'seconds with decimal'],
      ['00:10', 'MM:SS'],
      ['00:00:10', 'HH:MM:SS'],
      ['1:30:05.500', 'full timestamp with ms'],
      ['01:00:00', '1 hour'],
    ];

    it.each(validTimes)('includes start time for format: %s (%s)', (time) => {
      const args = getTranscodeArgs(INPUT_PATH, time);

      const ssIndex = args.indexOf('-ss');
      expect(ssIndex).toBeGreaterThan(-1);
      expect(args[ssIndex + 1]).toBe(time);
      expect(args).toContain(INPUT_PATH);
    });

    // Parameterized tests for invalid time formats (Security check)
    const invalidTimes = [
      ['10;rm -rf', 'command injection attempt'],
      ['invalid', 'non-numeric'],
      ['10:10:10:10', 'too many colons'],
      ['-10', 'negative number'], // Regex doesn't allow sign
      [' 10 ', 'whitespace'],
      ['10&', 'special char'],
    ];

    it.each(invalidTimes)(
      'throws error for invalid time format: %s (%s)',
      (time) => {
        expect(() => getTranscodeArgs(INPUT_PATH, time)).toThrow(
          'Invalid start time format',
        );
      },
    );

    it('handles null start time as undefined', () => {
      const args = getTranscodeArgs(INPUT_PATH, null);
      expect(args).not.toContain('-ss');
    });
  });

  describe('getThumbnailArgs', () => {
    const INPUT_PATH = '/path/to/video.mp4';
    const CACHE_FILE = '/path/to/cache.jpg';

    it('includes performance flags', () => {
      const args = getThumbnailArgs(INPUT_PATH, CACHE_FILE);

      // Performance flags
      expect(args).toContain('-hide_banner');
      expect(args).toContain('-loglevel');
      expect(args).toContain('error');

      // Core inputs
      expect(args).toContain(INPUT_PATH);
      expect(args).toContain(CACHE_FILE);
    });
  });

  describe('getHlsTranscodeArgs', () => {
    const INPUT_PATH = '/path/to/video.mp4';
    const OUTPUT_SEGMENT = '/path/to/segment_%03d.ts';
    const OUTPUT_PLAYLIST = '/path/to/playlist.m3u8';
    const SEGMENT_DURATION = 4;

    it('generates correct HLS arguments', () => {
      const args = getHlsTranscodeArgs(
        INPUT_PATH,
        OUTPUT_SEGMENT,
        OUTPUT_PLAYLIST,
        SEGMENT_DURATION,
      );

      // Performance and logging
      expect(args).toContain('-hide_banner');
      const loglevelIndex = args.indexOf('-loglevel');
      expect(loglevelIndex).toBeGreaterThan(-1);
      expect(args[loglevelIndex + 1]).toBe('error');

      // Check for all flag-value pairs to make the test more robust
      const expectedArgs = {
        '-analyzeduration': '100M',
        '-probesize': '100M',
        '-i': INPUT_PATH,
        '-c:v': 'libx264',
        '-c:a': 'aac',
        '-preset': 'ultrafast',
        '-crf': '23',
        '-pix_fmt': 'yuv420p',
        '-g': '48',
        '-sc_threshold': '0',
        '-f': 'hls',
        '-hls_time': SEGMENT_DURATION.toString(),
        '-hls_list_size': '0',
        '-hls_segment_filename': OUTPUT_SEGMENT,
      };

      for (const [flag, value] of Object.entries(expectedArgs)) {
        const flagIndex = args.indexOf(flag);
        expect(flagIndex).toBeGreaterThan(
          -1,
          `Expected flag ${flag} to be present`,
        );
        expect(args[flagIndex + 1]).toBe(value);
      }

      // Ensure playlist is the last argument
      expect(args[args.length - 1]).toBe(OUTPUT_PLAYLIST);
    });
  });

  // From ffmpeg-utils.duration.test.ts
  describe('parseFFmpegDuration', () => {
    // Define test cases as [description, input string, expected result]
    const testCases: [string, string, number | null][] = [
      [
        'standard duration',
        'Duration: 00:01:01.50, start: 0.000000, bitrate: 1234 kb/s',
        61.5,
      ],
      [
        'duration with no leading zeros',
        'Duration: 0:1:1.5, start: 0.000000',
        61.5,
      ],
      ['long duration', 'Duration: 01:00:00.00, start: 0.000000', 3600],
      [
        'duration with fractional seconds',
        'Duration: 00:00:00.12, start: 0.000000',
        0.12,
      ],
      ['exact zero duration', 'Duration: 00:00:00.00, start: 0.000000', 0],
      ['large hours', 'Duration: 100:00:00.00, start: 0.000000', 360000],
      ['no fractional seconds', 'Duration: 00:00:10, start: 0.000000', 10],
      [
        'surrounded by garbage',
        'some garbage\nDuration: 00:00:05.00\nmore garbage',
        5,
      ],
      ['invalid format (missing parts)', 'Duration: 00:00', null],
      ['invalid format (letters)', 'Duration: aa:bb:cc', null],
      ['empty string', '', null],
      [
        'malformed duration label',
        'Duration 00:00:10.00', // Missing colon
        null,
      ],
    ];

    it.each(testCases)('correctly parses %s', (_desc, input, expected) => {
      const result = parseFFmpegDuration(input);
      expect(result).toBe(expected);
    });
  });

  // From ffmpeg-utils.test.ts
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

  // From ffmpeg-utils.timeout.test.ts
  describe('Security: Process Timeouts', () => {
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

  // From ffmpeg-utils.streams.test.ts
  describe('getFFmpegStreams', () => {
    it('returns true for both when both streams exist', async () => {
      mockExeca.mockResolvedValue({
        exitCode: 0,
        stderr: 'Stream #0:0(und): Video: h264\nStream #0:1(eng): Audio: aac',
      });
      const res = await getFFmpegStreams('file', 'ffmpeg');
      expect(res).toEqual({ hasVideo: true, hasAudio: true });
    });

    it('returns false for video if missing', async () => {
      mockExeca.mockResolvedValue({
        exitCode: 0,
        stderr: 'Stream #0:0(eng): Audio: aac',
      });
      const res = await getFFmpegStreams('file', 'ffmpeg');
      expect(res).toEqual({ hasVideo: false, hasAudio: true });
    });

    it('returns false for audio if missing', async () => {
      mockExeca.mockResolvedValue({
        exitCode: 0,
        stderr: 'Stream #0:0(und): Video: h264',
      });
      const res = await getFFmpegStreams('file', 'ffmpeg');
      expect(res).toEqual({ hasVideo: true, hasAudio: false });
    });

    it('handles garbage output', async () => {
      mockExeca.mockResolvedValue({
        exitCode: 1, // Error but runFFmpeg returns it anyway
        stderr: 'Not a video file',
      });
      const res = await getFFmpegStreams('file', 'ffmpeg');
      expect(res).toEqual({ hasVideo: false, hasAudio: false });
    });
  });
});
