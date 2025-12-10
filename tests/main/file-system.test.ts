
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listDirectory, isValidDirectory } from '../../src/core/file-system';
import fs from 'fs/promises';
import path from 'path';

// Mock fs/promises
vi.mock('fs/promises', async () => {
  return {
    default: {
      readdir: vi.fn(),
      stat: vi.fn(),
    },
  };
});

describe('file-system.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listDirectory', () => {
    it('should list files and directories, sorted correctly', async () => {
      const mockItems = [
        { name: 'fileB.txt', isDirectory: () => false },
        { name: 'dirA', isDirectory: () => true },
        { name: 'fileA.txt', isDirectory: () => false },
        { name: 'dirB', isDirectory: () => true },
      ];

      vi.spyOn(fs, 'readdir').mockResolvedValue(mockItems as any);

      const result = await listDirectory('/test/path');

      expect(fs.readdir).toHaveBeenCalledWith('/test/path', {
        withFileTypes: true,
      });

      expect(result).toHaveLength(4);
      // Expected order: Directories (A-Z), then Files (A-Z)
      expect(result[0].name).toBe('dirA');
      expect(result[0].isDirectory).toBe(true);
      expect(result[1].name).toBe('dirB');
      expect(result[1].isDirectory).toBe(true);
      expect(result[2].name).toBe('fileA.txt');
      expect(result[2].isDirectory).toBe(false);
      expect(result[3].name).toBe('fileB.txt');
      expect(result[3].isDirectory).toBe(false);

      expect(result[0].path).toBe(path.join('/test/path', 'dirA'));
    });

    it('should throw and log error when readdir fails', async () => {
      const error = new Error('Permission denied');
      vi.spyOn(fs, 'readdir').mockRejectedValue(error);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Temporarily set NODE_ENV to something else to trigger the console.error logic
      // But wait, the code says: if (process.env.NODE_ENV !== 'test')
      // So in test env, it won't log.
      // To test the logging branch, I need to trick it.
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      await expect(listDirectory('/fail/path')).rejects.toThrow('Permission denied');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error listing directory /fail/path'),
        error,
      );

      process.env.NODE_ENV = originalEnv;
      consoleSpy.mockRestore();
    });

    it('should not log error in test environment', async () => {
        const error = new Error('Permission denied');
        vi.spyOn(fs, 'readdir').mockRejectedValue(error);
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(listDirectory('/fail/path')).rejects.toThrow('Permission denied');

        expect(consoleSpy).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
  });

  describe('isValidDirectory', () => {
    it('should return true for existing directory', async () => {
      vi.spyOn(fs, 'stat').mockResolvedValue({
        isDirectory: () => true,
      } as any);

      const result = await isValidDirectory('/valid/dir');
      expect(result).toBe(true);
      expect(fs.stat).toHaveBeenCalledWith('/valid/dir');
    });

    it('should return false for file', async () => {
      vi.spyOn(fs, 'stat').mockResolvedValue({
        isDirectory: () => false,
      } as any);

      const result = await isValidDirectory('/valid/file.txt');
      expect(result).toBe(false);
    });

    it('should return false when stat throws error', async () => {
      vi.spyOn(fs, 'stat').mockRejectedValue(new Error('ENOENT'));

      const result = await isValidDirectory('/nonexistent');
      expect(result).toBe(false);
    });
  });
});
