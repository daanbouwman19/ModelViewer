import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
// Import dependencies to mock
import fs from 'fs/promises';
import { performFullMediaScan } from '../../src/core/media-scanner';
import * as driveService from '../../src/main/google-drive-service';

// Mock dependencies
const { mockFs } = vi.hoisted(() => {
  const mockFs = {
    access: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
  };
  return { mockFs };
});

vi.mock('fs/promises', () => ({
  default: mockFs,
  access: mockFs.access,
  readdir: mockFs.readdir,
  stat: mockFs.stat,
}));

vi.mock('../../src/main/google-drive-service', () => ({
  listDriveFiles: vi.fn(),
}));

describe('Media Scanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should scan local directories recursively', async () => {
    const rootDir = '/test/media';
    const subDir = path.join(rootDir, 'subdir');
    const imageFile = 'image.jpg';
    const videoFile = 'video.mp4';

    // Mock fs structure
    mockFs.access.mockResolvedValue(undefined); // Access ok

    // Mock readdir for root
    mockFs.readdir.mockResolvedValueOnce([
      { name: 'subdir', isDirectory: () => true, isFile: () => false },
      { name: imageFile, isDirectory: () => false, isFile: () => true },
    ]);

    // Mock readdir for subdir
    mockFs.readdir.mockResolvedValueOnce([
      { name: videoFile, isDirectory: () => false, isFile: () => true },
    ]);

    const result = await performFullMediaScan([rootDir]);

    expect(result).toHaveLength(1);
    const rootAlbum = result[0];
    expect(rootAlbum.name).toBe('media');
    expect(rootAlbum.textures).toHaveLength(1);
    expect(rootAlbum.textures[0].name).toBe(imageFile);

    expect(rootAlbum.children).toHaveLength(1);
    const childAlbum = rootAlbum.children[0];
    expect(childAlbum.name).toBe('subdir');
    expect(childAlbum.textures).toHaveLength(1);
    expect(childAlbum.textures[0].name).toBe(videoFile);
  });

  it('should scan google drive folders', async () => {
    const drivePath = 'gdrive://folder-id';
    const mockAlbum = {
      name: 'Drive Folder',
      textures: [{ name: 'file.jpg', path: 'gdrive://f1' }],
      children: [],
    };

    (driveService.listDriveFiles as any).mockResolvedValue(mockAlbum);

    const result = await performFullMediaScan([drivePath]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(mockAlbum);
    expect(driveService.listDriveFiles).toHaveBeenCalledWith('folder-id');
  });

  it('should handle scan errors gracefully', async () => {
    mockFs.access.mockRejectedValue(new Error('Access denied'));
    const result = await performFullMediaScan(['/bad/path']);
    expect(result).toEqual([]);
  });

  it('should handle drive scan errors gracefully', async () => {
    (driveService.listDriveFiles as any).mockRejectedValue(new Error('Network error'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await performFullMediaScan(['gdrive://bad-id']);

    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error scanning Google Drive folder'), expect.anything());
    consoleSpy.mockRestore();
  });

  // Coverage tests
  it('should ignore unsupported files', async () => {
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([
      { name: 'text.txt', isDirectory: () => false, isFile: () => true },
    ]);

    const result = await performFullMediaScan(['/test']);
    // Should be empty or null if no media found.
    // performFullMediaScan filters nulls.
    // scanDirectoryRecursive returns null if no textures/children.
    expect(result).toEqual([]);
  });

  it('should handle readdir errors', async () => {
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readdir.mockRejectedValue(new Error('Read error'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await performFullMediaScan(['/test']);

    expect(result).toEqual([]);
    consoleSpy.mockRestore();
  });
});
