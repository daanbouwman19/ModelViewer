import { describe, it, expect } from 'vitest';
import {
  formatTime,
  formatDurationForA11y,
} from '../../../src/renderer/utils/timeUtils';

describe('timeUtils', () => {
  describe('formatTime', () => {
    it('formats seconds to MM:SS', () => {
      expect(formatTime(0)).toBe('00:00');
      expect(formatTime(59)).toBe('00:59');
      expect(formatTime(60)).toBe('01:00');
      expect(formatTime(65)).toBe('01:05');
      expect(formatTime(599)).toBe('09:59');
    });

    it('formats seconds to HH:MM:SS when hours > 0', () => {
      expect(formatTime(3600)).toBe('1:00:00');
      expect(formatTime(3665)).toBe('1:01:05');
      expect(formatTime(7200)).toBe('2:00:00');
    });

    it('handles invalid inputs gracefully', () => {
      expect(formatTime(-1)).toBe('00:00');
      expect(formatTime(NaN)).toBe('00:00');
      expect(formatTime(Infinity)).toBe('00:00');
      expect(formatTime(undefined as any)).toBe('00:00');
    });

    it('handles decimal seconds by flooring', () => {
      // The implementation uses Math.floor, so 60.9 should be 01:00
      expect(formatTime(60.9)).toBe('01:00');
    });
  });

  describe('formatDurationForA11y', () => {
    it('formats 0 or invalid seconds', () => {
      expect(formatDurationForA11y(0)).toBe('0 seconds');
      expect(formatDurationForA11y(-10)).toBe('0 seconds');
      expect(formatDurationForA11y(NaN)).toBe('0 seconds');
    });

    it('formats seconds only', () => {
      expect(formatDurationForA11y(30)).toBe('30 seconds');
      expect(formatDurationForA11y(1)).toBe('1 second');
    });

    it('formats minutes and seconds', () => {
      expect(formatDurationForA11y(65)).toBe('1 minute 5 seconds');
      expect(formatDurationForA11y(120)).toBe('2 minutes');
    });

    it('formats hours, minutes, and seconds', () => {
      expect(formatDurationForA11y(3665)).toBe('1 hour 1 minute 5 seconds');
      expect(formatDurationForA11y(7200)).toBe('2 hours');
    });
  });
});
