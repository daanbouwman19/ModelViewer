import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  findAllMediaFiles,
  performFullMediaScan,
} from '../../src/main/media-scanner.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Media Scanner', () => {
  let testDir;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-scanner-test-'));
  });

  afterEach(() => {
    // Clean up test directory: ensure directories are writable before removal
    if (fs.existsSync(testDir)) {
      // Recursively attempt to make files/dirs writable so rmSync can delete them
      const chmodRecursive = (p) => {
        try {
          fs.chmodSync(p, 0o700);
        } catch (e) {
          // ignore chmod failures
        }
        try {
          const stat = fs.statSync(p);
          if (stat.isDirectory()) {
            const entries = fs.readdirSync(p);
            for (const ent of entries) {
              chmodRecursive(path.join(p, ent));
            }
          }
        } catch (e) {
          // ignore traversal errors
        }
      };

      chmodRecursive(testDir);
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('findAllMediaFiles', () => {
    it('should find image files in a directory', () => {
      // Create test files
      fs.writeFileSync(path.join(testDir, 'image1.png'), '');
      fs.writeFileSync(path.join(testDir, 'image2.jpg'), '');
      fs.writeFileSync(path.join(testDir, 'not-media.txt'), '');

      const result = findAllMediaFiles(testDir);

      expect(result).toHaveLength(2);
      expect(result.some((f) => f.name === 'image1.png')).toBe(true);
      expect(result.some((f) => f.name === 'image2.jpg')).toBe(true);
      expect(result.some((f) => f.name === 'not-media.txt')).toBe(false);
    });

    it('should find video files in a directory', () => {
      fs.writeFileSync(path.join(testDir, 'video1.mp4'), '');
      fs.writeFileSync(path.join(testDir, 'video2.webm'), '');

      const result = findAllMediaFiles(testDir);

      expect(result).toHaveLength(2);
      expect(result.some((f) => f.name === 'video1.mp4')).toBe(true);
      expect(result.some((f) => f.name === 'video2.webm')).toBe(true);
    });

    it('should recursively find files in subdirectories', () => {
      const subDir = path.join(testDir, 'subfolder');
      fs.mkdirSync(subDir);
      fs.writeFileSync(path.join(testDir, 'root.png'), '');
      fs.writeFileSync(path.join(subDir, 'nested.jpg'), '');

      const result = findAllMediaFiles(testDir);

      expect(result).toHaveLength(2);
      expect(result.some((f) => f.name === 'root.png')).toBe(true);
      expect(result.some((f) => f.name === 'nested.jpg')).toBe(true);
    });

    it('should handle empty directories', () => {
      const result = findAllMediaFiles(testDir);
      expect(result).toHaveLength(0);
    });

    it('should be case-insensitive for file extensions', () => {
      fs.writeFileSync(path.join(testDir, 'image.PNG'), '');
      fs.writeFileSync(path.join(testDir, 'video.MP4'), '');

      const result = findAllMediaFiles(testDir);

      expect(result).toHaveLength(2);
    });

    it('should return empty array for non-existent directory', () => {
      const result = findAllMediaFiles(path.join(testDir, 'non-existent'));
      expect(result).toHaveLength(0);
    });
  });

  describe('performFullMediaScan', () => {
    it('should scan multiple base directories', async () => {
      const dir1 = path.join(testDir, 'dir1');
      const dir2 = path.join(testDir, 'dir2');
      fs.mkdirSync(dir1);
      fs.mkdirSync(dir2);

      const album1 = path.join(dir1, 'album1');
      const album2 = path.join(dir2, 'album2');
      fs.mkdirSync(album1);
      fs.mkdirSync(album2);

      fs.writeFileSync(path.join(album1, 'image1.png'), '');
      fs.writeFileSync(path.join(album2, 'image2.jpg'), '');

      const result = await performFullMediaScan([dir1, dir2]);

      expect(result).toHaveLength(2);
      expect(result.some((m) => m.name === 'album1')).toBe(true);
      expect(result.some((m) => m.name === 'album2')).toBe(true);
    });

    it('should include files in root directory as an album', async () => {
      fs.writeFileSync(path.join(testDir, 'root-image.png'), '');

      const result = await performFullMediaScan([testDir]);

      expect(result).toHaveLength(1);
      const baseName = path.basename(testDir);
      expect(result[0].name).toBe(baseName);
      expect(result[0].textures).toHaveLength(1);
      expect(result[0].textures[0].name).toBe('root-image.png');
    });

    it('should merge albums with the same name from different directories', async () => {
      const dir1 = path.join(testDir, 'dir1');
      const dir2 = path.join(testDir, 'dir2');
      fs.mkdirSync(dir1);
      fs.mkdirSync(dir2);

      const album1a = path.join(dir1, 'shared-album');
      const album1b = path.join(dir2, 'shared-album');
      fs.mkdirSync(album1a);
      fs.mkdirSync(album1b);

      fs.writeFileSync(path.join(album1a, 'image1.png'), '');
      fs.writeFileSync(path.join(album1b, 'image2.jpg'), '');

      const result = await performFullMediaScan([dir1, dir2]);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('shared-album');
      expect(result[0].textures).toHaveLength(2);
    });

    it('should return empty array for non-existent directories', async () => {
      const result = await performFullMediaScan([
        path.join(testDir, 'non-existent'),
      ]);
      expect(result).toHaveLength(0);
    });

    it('should skip empty album folders', async () => {
      const emptyAlbum = path.join(testDir, 'empty-album');
      fs.mkdirSync(emptyAlbum);

      const result = await performFullMediaScan([testDir]);

      // Should not include the empty album
      expect(result.some((m) => m.name === 'empty-album')).toBe(false);
    });

    it('should organize files correctly in album structure', async () => {
      const albumDir = path.join(testDir, 'test-album');
      fs.mkdirSync(albumDir);
      fs.writeFileSync(path.join(albumDir, 'texture1.png'), '');
      fs.writeFileSync(path.join(albumDir, 'texture2.jpg'), '');

      const result = await performFullMediaScan([testDir]);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test-album');
      expect(result[0].textures).toHaveLength(2);
      expect(result[0].textures.every((t) => typeof t.name === 'string')).toBe(
        true,
      );
      expect(result[0].textures.every((t) => typeof t.path === 'string')).toBe(
        true,
      );
    });

    it('should handle mixed content (root files and album folders)', async () => {
      // Create root files
      fs.writeFileSync(path.join(testDir, 'root1.png'), '');
      fs.writeFileSync(path.join(testDir, 'root2.jpg'), '');

      // Create album folder
      const albumDir = path.join(testDir, 'album-folder');
      fs.mkdirSync(albumDir);
      fs.writeFileSync(path.join(albumDir, 'album-texture.png'), '');

      const result = await performFullMediaScan([testDir]);

      // Should have 2 albums: one for root files, one for the folder
      expect(result).toHaveLength(2);

      const rootAlbum = result.find((m) => m.name === path.basename(testDir));
      const folderAlbum = result.find((m) => m.name === 'album-folder');

      expect(rootAlbum).toBeDefined();
      expect(rootAlbum.textures).toHaveLength(2);

      expect(folderAlbum).toBeDefined();
      expect(folderAlbum.textures).toHaveLength(1);
    });

    it('should merge root files from different base directories with same name', async () => {
      // This tests line 92: when rootDirName already exists in albumsMap
      // Create two base directories with the SAME name in different parent dirs
      const parentDir1 = path.join(testDir, 'parent1');
      const parentDir2 = path.join(testDir, 'parent2');
      fs.mkdirSync(parentDir1);
      fs.mkdirSync(parentDir2);

      // Both have subdirectories with the same name "albums"
      const baseDir1 = path.join(parentDir1, 'albums');
      const baseDir2 = path.join(parentDir2, 'albums');
      fs.mkdirSync(baseDir1);
      fs.mkdirSync(baseDir2);

      // Put root files in both - these should merge under the name "albums"
      fs.writeFileSync(path.join(baseDir1, 'texture1.png'), '');
      fs.writeFileSync(path.join(baseDir2, 'texture2.jpg'), '');

      // Scan both base directories - they have the same basename "albums"
      const result = await performFullMediaScan([baseDir1, baseDir2]);

      // Should have ONE album named "albums" with merged textures from both dirs
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('albums');
      expect(result[0].textures.length).toBe(2);
      expect(result[0].textures.some((t) => t.name === 'texture1.png')).toBe(
        true,
      );
      expect(result[0].textures.some((t) => t.name === 'texture2.jpg')).toBe(
        true,
      );
    });

    it('should handle errors during scan gracefully', async () => {
      // Pass an invalid input that will cause an error in the try block
      const result = await performFullMediaScan(null);
      expect(result).toEqual([]);
    });

    it('should continue scanning even if a directory is unreadable', async () => {
      const dir1 = path.join(testDir, 'dir1');
      const unreadableDir = path.join(testDir, 'unreadable');
      const dir2 = path.join(testDir, 'dir2');
      fs.mkdirSync(dir1);
      fs.mkdirSync(unreadableDir, { mode: 0o000 }); // Make it unreadable
      fs.mkdirSync(dir2);

      fs.writeFileSync(path.join(dir1, 'image1.png'), '');
      fs.writeFileSync(path.join(dir2, 'image2.jpg'), '');

      const result = await performFullMediaScan([dir1, unreadableDir, dir2]);

      expect(result).toHaveLength(2);
      expect(result.some((m) => m.name === 'dir1')).toBe(true);
      expect(result.some((m) => m.name === 'dir2')).toBe(true);
    });
  });
});
