import { describe, it, expect } from 'vitest';
import { ConcurrencyLimiter } from '../../../src/core/utils/concurrency-limiter';

describe('ConcurrencyLimiter', () => {
  it('should limit concurrency', async () => {
    const maxConcurrency = 2;
    const limiter = new ConcurrencyLimiter(maxConcurrency);
    let activeCount = 0;
    let maxActiveSeen = 0;

    const task = async () => {
      activeCount++;
      maxActiveSeen = Math.max(maxActiveSeen, activeCount);
      await new Promise((resolve) => setTimeout(resolve, 50));
      activeCount--;
    };

    // Run 10 tasks concurrently
    const promises = Array.from({ length: 10 }).map(() =>
      limiter.run(task)
    );

    await Promise.all(promises);

    expect(maxActiveSeen).toBeLessThanOrEqual(maxConcurrency);
  });

  it('should process all tasks', async () => {
    const limiter = new ConcurrencyLimiter(2);
    const results: number[] = [];

    const task = (id: number) => async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return id;
    };

    const promises = [1, 2, 3, 4, 5].map((id) =>
      limiter.run(task(id)).then((res) => results.push(res))
    );

    await Promise.all(promises);

    expect(results).toHaveLength(5);
    expect(results.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('should handle errors correctly', async () => {
    const limiter = new ConcurrencyLimiter(1);
    const errorTask = async () => {
      throw new Error('Task failed');
    };

    await expect(limiter.run(errorTask)).rejects.toThrow('Task failed');

    // Ensure subsequent tasks can still run
    const successTask = async () => 'success';
    const result = await limiter.run(successTask);
    expect(result).toBe('success');
  });
});
