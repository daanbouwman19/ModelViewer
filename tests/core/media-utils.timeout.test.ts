// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { runFFmpeg } from '../../src/core/media-utils';

describe('Security: Process Timeouts', () => {
  it('should timeout when a process runs too long', async () => {
    // This command sleeps for 5 seconds
    const cmd = 'node';
    const args = ['-e', 'setTimeout(() => {}, 5000)'];

    // We set a short timeout of 1000ms
    const timeoutMs = 1000;

    const start = Date.now();

    // We expect this to fail with a timeout error
    await expect(runFFmpeg(cmd, args, timeoutMs)).rejects.toThrow(/timed out/);

    const duration = Date.now() - start;

    // It should take roughly 1000ms, definitely less than 5000ms
    expect(duration).toBeLessThan(4000);
  });
});
