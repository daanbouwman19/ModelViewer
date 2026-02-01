import { describe, it, expect, vi } from 'vitest';
import { callWithRetry } from '../../../src/core/utils/async-utils';

describe('async-utils', () => {
  describe('callWithRetry', () => {
    it('should return result immediately if function succeeds', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await callWithRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      const result = await callWithRetry(fn, {
        retries: 3,
        initialDelay: 10,
        onRetry,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('should fail after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      const onRetry = vi.fn();

      await expect(
        callWithRetry(fn, {
          retries: 2,
          initialDelay: 1,
          onRetry,
        }),
      ).rejects.toThrow('fail');

      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it('should not retry if shouldRetry returns false', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      const shouldRetry = vi.fn().mockReturnValue(false);

      await expect(
        callWithRetry(fn, {
          retries: 3,
          initialDelay: 1,
          shouldRetry,
        }),
      ).rejects.toThrow('fail');

      expect(fn).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalledWith(new Error('fail'));
    });

    it('should pass correct delays to onRetry', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      const onRetry = vi.fn();

      try {
        await callWithRetry(fn, {
          retries: 2,
          initialDelay: 100,
          factor: 2,
          onRetry,
        });
      } catch {}

      expect(onRetry).toHaveBeenNthCalledWith(1, expect.anything(), 2, 100);
      expect(onRetry).toHaveBeenNthCalledWith(2, expect.anything(), 1, 200);
    });
  });
});
