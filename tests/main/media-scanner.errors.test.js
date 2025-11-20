import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises
vi.mock('fs/promises', () => {
  return {
    default: {
      readdir: vi.fn(),
      access: vi.fn(),
    },
  };
});

import fs from 'fs/promises';
import { performFullMediaScan } from '../../src/main/media-scanner.js';

describe('Media Scanner Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle access errors gracefully for a specific directory', async () => {
    const badDir = '/bad/dir';
    const goodDir = '/good/dir';

    fs.access.mockImplementation(async (path) => {
      if (path === badDir) {
        throw new Error('Permission denied');
      }
      return Promise.resolve();
    });

    // Mock readdir for the good directory to return empty, so we don't need deeper mocking
    fs.readdir.mockResolvedValue([]);

    const result = await performFullMediaScan([badDir, goodDir]);

    // Should not throw, should return empty array because goodDir is empty and badDir failed
    expect(result).toEqual([]);
    expect(fs.access).toHaveBeenCalledTimes(2);
    expect(fs.access).toHaveBeenCalledWith(badDir);
    expect(fs.access).toHaveBeenCalledWith(goodDir);
  });

  it('should handle readdir errors gracefully inside scanDirectoryRecursive', async () => {
    const baseDir = '/base/dir';

    fs.access.mockResolvedValue(undefined);
    fs.readdir.mockRejectedValue(new Error('Read failure'));

    const result = await performFullMediaScan([baseDir]);

    expect(result).toEqual([]);
    expect(fs.readdir).toHaveBeenCalledWith(baseDir, { withFileTypes: true });
  });

  it('should handle errors during the entire scan process gracefully', async () => {
    // Simulate a catastrophic failure where map fails or something unexpected
    // Actually, Promise.all behavior with async map: if one promise rejects, Promise.all rejects immediately.
    // But performFullMediaScan wraps the inner logic in try/catch?
    // No, performFullMediaScan has a try/catch block around the whole Promise.all.

    // Let's try to make fs.access throw something that isn't caught by the inner try/catch?
    // The inner try/catch catches EVERYTHING from the async function.

    // Let's verify the outer try/catch block in performFullMediaScan
    // We can mock Promise.all to throw
    const originalAll = Promise.all;
    vi.spyOn(Promise, 'all').mockRejectedValue(
      new Error('Catastrophic failure'),
    );

    const result = await performFullMediaScan(['/dir']);

    expect(result).toEqual([]);

    Promise.all.mockRestore();
  });
});
