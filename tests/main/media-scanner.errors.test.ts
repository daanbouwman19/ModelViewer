import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises
const { mockFs } = vi.hoisted(() => {
  return {
    mockFs: {
      access: vi.fn(),
      readdir: vi.fn(),
    },
  };
});

vi.mock('fs/promises', () => {
  return {
    default: mockFs,
    access: mockFs.access,
    readdir: mockFs.readdir,
  };
});

import { performFullMediaScan } from '../../src/core/media-scanner';

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

    mockFs.access.mockImplementation(async (path: any) => {
      if (path === badDir) {
        throw new Error('Permission denied');
      }
      return Promise.resolve();
    });

    // Mock readdir for the good directory to return empty, so we don't need deeper mocking
    mockFs.readdir.mockResolvedValue([]);

    const result = await performFullMediaScan([badDir, goodDir]);

    // Should not throw, should return empty array because goodDir is empty and badDir failed
    expect(result).toEqual([]);
    expect(mockFs.access).toHaveBeenCalledTimes(2);
    expect(mockFs.access).toHaveBeenCalledWith(badDir);
    expect(mockFs.access).toHaveBeenCalledWith(goodDir);
  });

  it('should handle readdir errors gracefully inside scanDirectoryRecursive', async () => {
    const baseDir = '/base/dir';

    mockFs.access.mockResolvedValue(undefined);
    mockFs.readdir.mockRejectedValue(new Error('Read failure'));

    const result = await performFullMediaScan([baseDir]);

    expect(result).toEqual([]);
    expect(mockFs.readdir).toHaveBeenCalledWith(baseDir, {
      withFileTypes: true,
    });
  });

  it('should handle errors during the entire scan process gracefully', async () => {
    const promiseAllSpy = vi
      .spyOn(Promise, 'all')
      .mockRejectedValue(new Error('Catastrophic failure'));

    const result = await performFullMediaScan(['/dir']);

    expect(result).toEqual([]);

    promiseAllSpy.mockRestore();
  });
});
