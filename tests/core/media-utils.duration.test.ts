import { describe, it, expect } from 'vitest';
import { parseFFmpegDuration } from '../../src/core/media-utils';

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
    [
      'long duration',
      'Duration: 01:00:00.00, start: 0.000000',
      3600,
    ],
    [
      'duration with fractional seconds',
      'Duration: 00:00:00.12, start: 0.000000',
      0.12,
    ],
    [
      'exact zero duration',
      'Duration: 00:00:00.00, start: 0.000000',
      0,
    ],
    [
      'large hours',
      'Duration: 100:00:00.00, start: 0.000000',
      360000,
    ],
    [
      'no fractional seconds',
      'Duration: 00:00:10, start: 0.000000',
      10,
    ],
    [
      'surrounded by garbage',
      'some garbage\nDuration: 00:00:05.00\nmore garbage',
      5,
    ],
    [
      'invalid format (missing parts)',
      'Duration: 00:00',
      null,
    ],
    [
      'invalid format (letters)',
      'Duration: aa:bb:cc',
      null,
    ],
    [
      'empty string',
      '',
      null,
    ],
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
