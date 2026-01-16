import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performFullMediaScan } from '../../src/core/media-scanner';
import fs from 'fs/promises';

vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
    readdir: vi.fn(),
  },
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

  it('logs found files and stats in non-test env', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readdir).mockResolvedValue([
      {
        name: 'image.jpg',
        isFile: () => true,
        isDirectory: () => false,
      } as any,
    ]);

    await performFullMediaScan(['/base']);

    expect(consoleLogSpy).toHaveBeenCalled();
    // Verify specific logs if needed, but just calling is enough for coverage
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[MediaScanner\] Found file: .*image\.jpg/),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[MediaScanner] Folder: base - Files: 1'),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('root albums with 1 total files'),
    );

    consoleLogSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });
});
