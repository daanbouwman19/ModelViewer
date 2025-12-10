import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listDirectory,
  isValidDirectory,
  listDrives,
} from '../../src/core/file-system';
import fs from 'fs/promises';
import { exec } from 'child_process';
import os from 'os';

vi.mock('fs/promises', () => {
  return {
    default: {
      readdir: vi.fn(),
      stat: vi.fn(),
    },
  };
});

vi.mock('child_process', () => {
  const exec = vi.fn();
  return {
    exec,
    default: { exec },
  };
});

// os mock removed

describe('file-system', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

    it('returns drives if path is ROOT', async () => {
      vi.spyOn(os, 'platform').mockReturnValue('linux');
      const result = await listDirectory('ROOT');
      expect(result[0].path).toBe('/');
    });
  });

  describe('listDrives', () => {
    it('returns root on non-Windows', async () => {
      vi.spyOn(os, 'platform').mockReturnValue('linux');
      const result = await listDrives();
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/');
      expect(result[0].name).toBe('Root');
    });

    it('returns drives on Windows', async () => {
      vi.spyOn(os, 'platform').mockReturnValue('win32');

      // Mock exec to simulate fsutil output
      (exec as any).mockImplementation((_cmd: string, callback: any) => {
        callback(null, { stdout: 'Drives: C:\\ D:\\' });
      });

      const result = await listDrives();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('C:');
      expect(result[0].path).toBe('C:\\');
      expect(result[1].name).toBe('D:');
      expect(result[1].path).toBe('D:\\');
    });

    it('returns fallback C: on Windows if exec fails', async () => {
      vi.spyOn(os, 'platform').mockReturnValue('win32');

      (exec as any).mockImplementation((_cmd: string, callback: any) => {
        callback(new Error('Command failed'));
      });

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await listDrives();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('C:');
      expect(consoleSpy).toHaveBeenCalled();
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
