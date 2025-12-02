import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import fsPromises from 'fs/promises';
import { performFullMediaScan } from '../../src/main/media-scanner';

let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-scanner-test-'));
});

afterEach(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

// Helper function to create a directory structure
type DirStructure = {
  [key: string]: string | DirStructure;
};

const createDirStructure = (basePath: string, structure: DirStructure) => {
  for (const [name, content] of Object.entries(structure)) {
    const newPath = path.join(basePath, name);
    if (typeof content === 'object') {
      fs.mkdirSync(newPath, { recursive: true });
      createDirStructure(newPath, content);
    } else if (typeof content === 'string') {
      fs.writeFileSync(newPath, content);
    }
  }
};

describe('performFullMediaScan', () => {
  it('should create a nested album structure mirroring the filesystem', async () => {
    createDirStructure(testDir, {
      'root.jpg': '',
      album1: {
        'image1.png': '',
        'sub-album1a': {
          'image1a.jpg': '',
        },
      },
      album2: {
        'image2.png': '',
      },
    });

    const result = await performFullMediaScan([testDir]);
    const rootAlbum = result[0];

    expect(rootAlbum.name).toBe(path.basename(testDir));
    expect(rootAlbum.textures).toHaveLength(1); // root.jpg
    expect(rootAlbum.children).toHaveLength(2); // album1, album2

    const album1 = rootAlbum.children.find((c) => c.name === 'album1');
    expect(album1).toBeDefined();
    expect(album1!.textures).toHaveLength(1); // image1.png
    expect(album1!.children).toHaveLength(1); // sub-album1a

    const subAlbum1a = album1!.children[0];
    expect(subAlbum1a.name).toBe('sub-album1a');
    expect(subAlbum1a.textures).toHaveLength(1); // image1a.jpg
    expect(subAlbum1a.children).toHaveLength(0);

    const album2 = rootAlbum.children.find((c) => c.name === 'album2');
    expect(album2).toBeDefined();
    expect(album2!.textures).toHaveLength(1); // image2.png
    expect(album2!.children).toHaveLength(0);
  });

  it('should handle multiple base directories', async () => {
    const dir1 = path.join(testDir, 'source1');
    const dir2 = path.join(testDir, 'source2');
    fs.mkdirSync(dir1);
    fs.mkdirSync(dir2);

    createDirStructure(dir1, {
      albumA: { 'image1.jpg': '' },
    });
    createDirStructure(dir2, {
      albumB: { 'image2.jpg': '' },
    });

    const result = await performFullMediaScan([dir1, dir2]);

    expect(result).toHaveLength(2);
    const names = result.map((a) => a.name);
    expect(names).toContain('source1');
    expect(names).toContain('source2');

    const source1Album = result.find((a) => a.name === 'source1');
    expect(source1Album).toBeDefined();
    expect(source1Album!.children.length).toBe(1);
    expect(source1Album!.children[0].name).toBe('albumA');
  });

  it('should NOT merge root albums with the same name from different sources', async () => {
    const baseDir1 = path.join(testDir, 'base');
    const baseDir2 = path.join(testDir, 'another_parent', 'base');
    fs.mkdirSync(baseDir1, { recursive: true });
    fs.mkdirSync(baseDir2, { recursive: true });

    createDirStructure(baseDir1, {
      'image1.jpg': '',
      nested: { 'image_nested1.jpg': '' },
    });
    createDirStructure(baseDir2, {
      'image2.jpg': '',
    });

    const result = await performFullMediaScan([baseDir1, baseDir2]);

    // Expect two distinct root albums, not one merged one.
    expect(result).toHaveLength(2);

    const expectedPath1 = path.join(baseDir1, 'image1.jpg');
    const expectedPath2 = path.join(baseDir2, 'image2.jpg');

    const album1 = result.find((a) => a.textures[0]?.path === expectedPath1);
    const album2 = result.find((a) => a.textures[0]?.path === expectedPath2);

    expect(album1).toBeDefined();
    expect(album2).toBeDefined();

    // Check that both are named 'base' but are separate entities
    expect(album1!.name).toBe('base');
    expect(album2!.name).toBe('base');

    // Check content to ensure they are the correct, un-merged albums
    expect(album1!.children).toHaveLength(1);
    expect(album2!.children).toHaveLength(0);
  });

  it('should ignore empty directories at any level', async () => {
    createDirStructure(testDir, {
      album1: {
        'image1.png': '',
        'empty-sub-album': {},
      },
      'empty-album': {},
    });

    const result = await performFullMediaScan([testDir]);
    const rootAlbum = result[0];

    expect(rootAlbum.children).toHaveLength(1);
    const album1 = rootAlbum.children.find((c) => c.name === 'album1');
    expect(album1).toBeDefined();
    expect(album1!.children).toHaveLength(0);
  });

  it('should create an album if it only contains sub-albums with media', async () => {
    createDirStructure(testDir, {
      'parent-album': {
        'child-album': {
          'image.jpg': '',
        },
      },
    });

    const result = await performFullMediaScan([testDir]);
    const rootAlbum = result[0];

    expect(rootAlbum.children).toHaveLength(1);
    const parentAlbum = rootAlbum.children.find(
      (c) => c.name === 'parent-album',
    );
    expect(parentAlbum).toBeDefined();
    expect(parentAlbum!.textures).toHaveLength(0);
    expect(parentAlbum!.children).toHaveLength(1);
    expect(parentAlbum!.children[0].name).toBe('child-album');
  });

  it('should return an empty array if no media files are found', async () => {
    createDirStructure(testDir, {
      'document.txt': '',
      'empty-folder': {},
    });

    const result = await performFullMediaScan([testDir]);
    expect(result).toHaveLength(0);
  });

  it('should handle fs.access error (e.g., directory does not exist)', async () => {
    const nonExistentDir = path.join(testDir, 'non-existent');
    const validDir = path.join(testDir, 'valid');
    fs.mkdirSync(validDir, { recursive: true });
    createDirStructure(validDir, { 'img.jpg': '' });

    const result = await performFullMediaScan([nonExistentDir, validDir]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('valid');
  });

  it('should handle fs.readdir error in recursive scan', async () => {
    // We use a mock root dir that "exists" on disk so fs.access passes,
    // but fs.readdir behavior will be mocked.
    const rootDir = path.join(testDir, 'root');
    fs.mkdirSync(rootDir, { recursive: true });

    const spy = vi.spyOn(fsPromises, 'readdir');
    spy.mockImplementation(async (dirPath: fs.PathLike) => {
      // Normalize paths for comparison (handle potential trailing slashes or different separators)
      const p = path.resolve(String(dirPath));
      const r = path.resolve(rootDir);

      if (p === r) {
        // Return list of files/dirs for root
        return [
          { name: 'good-dir', isDirectory: () => true, isFile: () => false },
          { name: 'bad-dir', isDirectory: () => true, isFile: () => false },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any;
      }
      if (p.endsWith('good-dir')) {
        return [
          { name: 'image.jpg', isDirectory: () => false, isFile: () => true },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any;
      }
      if (p.endsWith('bad-dir')) {
        throw new Error('EACCES: permission denied');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return [] as any;
    });

    const result = await performFullMediaScan([rootDir]);

    // rootDir should be scanned. 'good-dir' should be a child. 'bad-dir' should be skipped (logged error, returned null).
    // So root has 1 child.
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('root');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].name).toBe('good-dir');
  });
});
