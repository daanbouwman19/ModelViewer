import { describe, it, expect } from 'vitest';
import { formatTime } from '../../../src/renderer/utils/timeUtils';

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
});
