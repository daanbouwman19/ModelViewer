import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performFullMediaScan } from '../../src/core/media-scanner';
import fs from 'fs/promises';

vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
    readdir: vi.fn(),
  },
}));
vi.mock('../../src/core/constants', () => ({
  ALL_SUPPORTED_EXTENSIONS: ['.jpg', '.mp4'],
}));

describe('media-scanner coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('performFullMediaScan handles fs.access failure', async () => {
    vi.mocked(fs.access).mockRejectedValueOnce(new Error('Access denied'));
    const results = await performFullMediaScan(['/bad/dir']);
    expect(results).toEqual([]);
  });

  it('performFullMediaScan logs error in non-test env', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    vi.mocked(fs.access).mockRejectedValueOnce(new Error('Access denied'));

    await performFullMediaScan(['/bad/dir']);

    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('scanDirectoryRecursive handles fs.readdir failure', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined); // Base access ok
    vi.mocked(fs.readdir).mockRejectedValue(new Error('Read fail'));

    const results = await performFullMediaScan(['/base']);
    expect(results).toEqual([]);
  });

  it('scanDirectoryRecursive logs error in non-test env', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readdir).mockRejectedValue(new Error('Read fail'));

    await performFullMediaScan(['/base']);

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('filters out null albums (empty/unsupported dirs)', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    // Mock readdir to return empty or unsupported files
    vi.mocked(fs.readdir).mockResolvedValue([
      {
        name: 'ignored.txt',
        isFile: () => true,
        isDirectory: () => false,
      } as any,
    ]);

    const results = await performFullMediaScan(['/base']);
    expect(results).toEqual([]);
  });
});
