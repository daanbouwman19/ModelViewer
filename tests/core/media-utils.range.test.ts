import { describe, it, expect } from 'vitest';
import { parseHttpRange } from '../../src/core/media-utils';

describe('parseHttpRange', () => {
  const TOTAL_SIZE = 1000;

  it('should return full range when no range header is provided', () => {
    const result = parseHttpRange(TOTAL_SIZE, undefined);
    expect(result).toEqual({ start: 0, end: TOTAL_SIZE - 1 });
  });

  it('should return full range when range header is empty', () => {
    const result = parseHttpRange(TOTAL_SIZE, '');
    expect(result).toEqual({ start: 0, end: TOTAL_SIZE - 1 });
  });

  it('should parse a valid simple range', () => {
    // bytes=0-499
    const result = parseHttpRange(TOTAL_SIZE, 'bytes=0-499');
    expect(result).toEqual({ start: 0, end: 499 });
  });

  it('should parse a range with only start', () => {
    // bytes=500- (meaning 500 to end)
    const result = parseHttpRange(TOTAL_SIZE, 'bytes=500-');
    expect(result).toEqual({ start: 500, end: TOTAL_SIZE - 1 });
  });

  it('should parse a suffix range (last N bytes)', () => {
    // bytes=-100 (last 100 bytes)
    // range-parser converts this to absolute range: (total - 100) to (total - 1)
    const result = parseHttpRange(TOTAL_SIZE, 'bytes=-100');
    expect(result).toEqual({ start: 900, end: 999 });
  });

  it('should handle unsatisfiable ranges (start >= size)', () => {
    // bytes=1000-
    const result = parseHttpRange(TOTAL_SIZE, 'bytes=1000-');
    expect(result).toEqual({ start: 0, end: 0, error: true });
  });

  it('should handle malformed ranges by defaulting to full content', () => {
    // "malformed"
    const result = parseHttpRange(TOTAL_SIZE, 'malformed');
    expect(result).toEqual({ start: 0, end: TOTAL_SIZE - 1 });
  });

  it('should handle zero size file', () => {
    // Should be unsatisfiable if we ask for bytes=0- on a 0 byte file
    const result = parseHttpRange(0, 'bytes=0-');
    expect(result).toEqual({ start: 0, end: 0, error: true });
  });
});
