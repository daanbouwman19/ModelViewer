import { describe, it, expect } from 'vitest';
import { ConcurrencyLimiter } from '../../../src/core/utils/concurrency-limiter';

// Helper to create a controlled promise
function createDeferred() {
  let resolve: (value: void | PromiseLike<void>) => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve: resolve! };
}

describe('ConcurrencyLimiter', () => {
  it('should limit concurrency', async () => {
    const maxConcurrency = 2;
    const limiter = new ConcurrencyLimiter(maxConcurrency);
    let activeCount = 0;

    // Create deferreds to control task completion
    const deferreds = [createDeferred(), createDeferred(), createDeferred()];
    const taskStarted = [false, false, false];

    const task = (index: number) => async () => {
      taskStarted[index] = true;
      activeCount++;
      await deferreds[index].promise;
      activeCount--;
    };

    // Start 3 tasks (max is 2)
    const p0 = limiter.run(task(0));
    const p1 = limiter.run(task(1));
    const p2 = limiter.run(task(2));

    // Yield to allow tasks to start
    await new Promise((r) => setTimeout(r, 0));

    // First two should be running
    expect(activeCount).toBe(2);
    expect(taskStarted[0]).toBe(true);
    expect(taskStarted[1]).toBe(true);
    // Third should be queued
    expect(taskStarted[2]).toBe(false);

    // Finish first task
    deferreds[0].resolve();
    await p0;

    // Yield to allow queued task to start
    await new Promise((r) => setTimeout(r, 0));

    // Third should have started now
    expect(taskStarted[2]).toBe(true);
    // Active count should still be 2 (since index 0 finished, index 2 started)
    expect(activeCount).toBe(2);

    // Finish remaining
    deferreds[1].resolve();
    deferreds[2].resolve();

    await Promise.all([p1, p2]);
    expect(activeCount).toBe(0);
  });

  it('should process all tasks', async () => {
    const limiter = new ConcurrencyLimiter(2);
    const results: number[] = [];

    const task = (id: number) => async () => {
      // No wall-clock delay needed, just async boundary
      await Promise.resolve();
      return id;
    };

    const promises = [1, 2, 3, 4, 5].map((id) =>
      limiter.run(task(id)).then((res) => results.push(res)),
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
