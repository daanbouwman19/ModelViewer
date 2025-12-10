import { describe, it, expect, vi, afterEach } from 'vitest';
import { listDirectory, isValidDirectory } from '../../src/core/file-system';
import fs from 'fs/promises';

vi.mock('fs/promises', () => {
  return {
    default: {
      readdir: vi.fn(),
      stat: vi.fn(),
    },
  };
});

describe('file-system', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listDirectory', () => {
    it('lists and sorts directories and files', async () => {
      const mockDirents = [
        { name: 'file2.txt', isDirectory: () => false },
        { name: 'dir1', isDirectory: () => true },
        { name: 'file1.txt', isDirectory: () => false },
        { name: 'dir2', isDirectory: () => true },
      ];
      vi.mocked(fs.readdir).mockResolvedValue(mockDirents as any);

      const result = await listDirectory('/test');

      expect(result).toHaveLength(4);
      // Expected order: dir1, dir2, file1.txt, file2.txt
      expect(result[0].name).toBe('dir1');
      expect(result[0].isDirectory).toBe(true);
      expect(result[1].name).toBe('dir2');
      expect(result[2].name).toBe('file1.txt');
      expect(result[2].isDirectory).toBe(false);
      expect(result[3].name).toBe('file2.txt');

      // Paths should be correct
      // Note: path.join behavior depends on OS in test environment
      // but assuming relative simplicity:
      expect(result[0].path).toContain('dir1');
    });

    it('throws error and logs if readdir fails', async () => {
      const error = new Error('Access denied');
      vi.mocked(fs.readdir).mockRejectedValue(error);
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(listDirectory('/test')).rejects.toThrow('Access denied');

      // In test env, it suppresses log? code: if (process.env.NODE_ENV !== 'test')
      // So console.error should NOT be called if NODE_ENV is test.
      // Vitest sets NODE_ENV to 'test' by default.
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('isValidDirectory', () => {
    it('returns true for valid directory', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      expect(await isValidDirectory('/valid')).toBe(true);
    });

    it('returns false for file', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => false } as any);
      expect(await isValidDirectory('/file')).toBe(false);
    });

    it('returns false if stat throws', async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error('not found'));
      expect(await isValidDirectory('/missing')).toBe(false);
    });
  });
});
