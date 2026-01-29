import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performFullMediaScan } from '../../src/core/media-scanner';

// Hoist the mock object so it can be referenced in the vi.mock factory
const { mockFs } = vi.hoisted(() => {
  return {
    mockFs: {
      access: vi.fn(),
      readdir: vi.fn(),
      stat: vi.fn(),
    },
  };
});

// Mock fs/promises using the hoisted object
vi.mock('fs/promises', () => {
  return {
    default: mockFs,
    access: mockFs.access,
    readdir: mockFs.readdir,
    stat: mockFs.stat,
  };
});

describe('media-scanner coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('performFullMediaScan handles fs.access failure', async () => {
    mockFs.access.mockRejectedValueOnce(new Error('Access denied'));
    const results = await performFullMediaScan(['/bad/dir']);
    expect(results).toEqual([]);
  });

  it('performFullMediaScan logs error in non-test env', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    mockFs.access.mockRejectedValueOnce(new Error('Access denied'));

    await performFullMediaScan(['/bad/dir']);

    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('scanDirectoryRecursive handles fs.readdir failure', async () => {
    mockFs.access.mockResolvedValue(undefined); // Base access ok
    mockFs.readdir.mockRejectedValue(new Error('Read fail'));

    const results = await performFullMediaScan(['/base']);
    expect(results).toEqual([]);
  });

  it('scanDirectoryRecursive logs error in non-test env', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    mockFs.access.mockResolvedValue(undefined);
    mockFs.readdir.mockRejectedValue(new Error('Read fail'));

    await performFullMediaScan(['/base']);

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('filters out null albums (empty/unsupported dirs)', async () => {
    mockFs.access.mockResolvedValue(undefined);
    // Mock readdir to return empty or unsupported files
    mockFs.readdir.mockResolvedValue([
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

    mockFs.access.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([
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
