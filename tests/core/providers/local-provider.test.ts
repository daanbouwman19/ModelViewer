import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { LocalFileSystemProvider } from '../../../src/core/providers/local-provider';
import { listDirectory } from '../../../src/core/file-system';
import { getMimeType, isDrivePath } from '../../../src/core/media-utils';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

vi.mock('../../../src/core/file-system', () => ({
  listDirectory: vi.fn(),
}));

// Mock isDrivePath and getMimeType
vi.mock('../../../src/core/media-utils', () => ({
  getMimeType: vi.fn(),
  isDrivePath: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    createReadStream: vi.fn(),
    default: {
      ...actual,
      createReadStream: vi.fn(),
    },
  };
});

vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
    realpath: vi.fn(),
  },
}));

describe('LocalFileSystemProvider', () => {
  let provider: LocalFileSystemProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new LocalFileSystemProvider();
    // Default implementation for isDrivePath in tests
    (isDrivePath as Mock).mockImplementation((path: string) =>
      path.startsWith('gdrive://'),
    );
  });

  describe('canHandle', () => {
    it('returns true for local paths', () => {
      expect(provider.canHandle('/path/to/file')).toBe(true);
      expect(isDrivePath).toHaveBeenCalledWith('/path/to/file');
    });

    it('returns false for gdrive paths', () => {
      expect(provider.canHandle('gdrive://file')).toBe(false);
      expect(isDrivePath).toHaveBeenCalledWith('gdrive://file');
    });
  });

  describe('listDirectory', () => {
    it('calls listDirectory', async () => {
      (listDirectory as Mock).mockResolvedValue([]);
      await provider.listDirectory('/path');
      expect(listDirectory).toHaveBeenCalledWith('/path');
    });
  });

  describe('getMetadata', () => {
    it('returns metadata', async () => {
      const stats = { size: 100, mtime: new Date('2021-01-01') };
      (fsPromises.stat as Mock).mockResolvedValue(stats);
      (getMimeType as Mock).mockReturnValue('text/plain');

      const meta = await provider.getMetadata('/file.txt');

      expect(fsPromises.stat).toHaveBeenCalledWith('/file.txt');
      expect(getMimeType).toHaveBeenCalledWith('/file.txt');
      expect(meta).toEqual({
        size: 100,
        mimeType: 'text/plain',
        lastModified: stats.mtime,
      });
    });
  });

  describe('getStream', () => {
    it('returns stream', async () => {
      const mockStream = {};
      (fs.createReadStream as Mock).mockReturnValue(mockStream);

      const result = await provider.getStream('/file.txt', {
        start: 0,
        end: 10,
      });

      expect(fs.createReadStream).toHaveBeenCalledWith('/file.txt', {
        start: 0,
        end: 10,
      });
      expect(result.stream).toBe(mockStream);
    });
  });

  describe('getParent', () => {
    it('returns parent directory', async () => {
      // Here we rely on path loaded in enviroment, assuming posix like or windows depending on where tests run.
      // Vitest runs in node, so path depends on OS. But we can verify logic generally.
      // Or we can assume / separators for tests if we use posix paths in args.
      // path.dirname('/a/b') -> '/a' usually.

      const res = await provider.getParent('/a/b/c');
      expect(res).toBe(path.dirname('/a/b/c'));
    });

    it('returns null if root', async () => {
      // const root = path.parse(process.cwd()).root;
      // Testing exact root equality might be flaky cross-platform.
      // Let's use known behavior: dirname of '/' is '/'.
      // If we pass '/', dirname returns '/'.
      // Code: if (parent === filePath) return null;

      // Linux:
      const res = await provider.getParent('/');
      expect(res).toBeNull();
    });

    it('returns null if empty', async () => {
      const res = await provider.getParent('');
      expect(res).toBeNull();
    });
  });

  describe('resolvePath', () => {
    it('resolves real path', async () => {
      (fsPromises.realpath as Mock).mockResolvedValue('/real/path');
      const res = await provider.resolvePath('/symlink');
      expect(res).toBe('/real/path');
    });

    it('fallbacks to path.resolve', async () => {
      (fsPromises.realpath as Mock).mockRejectedValue(new Error('Fail'));
      const res = await provider.resolvePath('/some/path');
      // path.resolve depends on cwd
      expect(res).toBe(path.resolve('/some/path'));
    });
  });

  describe('getThumbnailStream', () => {
    it('returns null', async () => {
      const res = await provider.getThumbnailStream('/path');
      expect(res).toBeNull();
    });
  });
});
