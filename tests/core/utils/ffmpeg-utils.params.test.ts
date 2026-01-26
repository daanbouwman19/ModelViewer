import { describe, it, expect } from 'vitest';
import {
  getTranscodeArgs,
  getThumbnailArgs,
} from '../../../src/core/utils/ffmpeg-utils';

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
