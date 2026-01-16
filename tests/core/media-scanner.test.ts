import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as mediaScanner from '../../src/core/media-scanner';
import fs from 'fs/promises';
import path from 'path';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    readdir: vi.fn(),
    access: vi.fn(),
  },
}));

// Mock google-drive-service
vi.mock('../../src/main/google-drive-service', () => ({
  listDriveFiles: vi.fn(),
}));

describe('MediaScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scans a directory structure correctly', async () => {
    // Setup mock file system
    const rootDir = path.join(path.sep, 'media');
    const subDir = path.join(rootDir, 'subdir');

    // rootDir contains: subdir (dir), image.jpg (file), video.mp4 (file), ignored.txt (file)
    // subDir contains: deep.png (file)

    const rootDirents = [
      { name: 'subdir', isDirectory: () => true, isFile: () => false },
      { name: 'image.jpg', isDirectory: () => false, isFile: () => true },
      { name: 'video.mp4', isDirectory: () => false, isFile: () => true },
      { name: 'ignored.txt', isDirectory: () => false, isFile: () => true },
    ];

    const subDirents = [
      { name: 'deep.png', isDirectory: () => false, isFile: () => true },
    ];

    vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
      // Normalize path separator for comparison
      if (dirPath === rootDir) return rootDirents as any;
      if (dirPath === subDir) return subDirents as any;
      return [];
    });

    vi.mocked(fs.access).mockResolvedValue(undefined);

    const result = await mediaScanner.performFullMediaScan([rootDir]);

    expect(result).toHaveLength(1);
    const rootAlbum = result[0];
    expect(rootAlbum.name).toBe('media');

    // Check root files
    expect(rootAlbum.textures).toHaveLength(2);
    expect(rootAlbum.textures.map((t) => t.name)).toEqual(
      expect.arrayContaining(['image.jpg', 'video.mp4']),
    );
    expect(rootAlbum.textures.map((t) => t.name)).not.toContain('ignored.txt');

    // Check children
    expect(rootAlbum.children).toHaveLength(1);
    const childAlbum = rootAlbum.children[0];
    expect(childAlbum.name).toBe('subdir');
    expect(childAlbum.textures).toHaveLength(1);
    expect(childAlbum.textures[0].name).toBe('deep.png');
  });

  it('handles empty directories (should return empty array if no media)', async () => {
    const rootDir = path.join(path.sep, 'empty');
    vi.mocked(fs.readdir).mockResolvedValue([]);
    vi.mocked(fs.access).mockResolvedValue(undefined);

    const result = await mediaScanner.performFullMediaScan([rootDir]);
    // performFullMediaScan filters null albums, and scanDirectoryRecursive returns null if empty
    expect(result).toHaveLength(0);
  });
});
