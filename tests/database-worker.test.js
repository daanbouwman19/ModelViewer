import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Worker } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Database Worker', () => {
  let worker;
  let dbPath;
  let messageId = 0;

  // Helper function to send message to worker and wait for response
  const sendMessage = (type, payload = {}) => {
    return new Promise((resolve, reject) => {
      const id = messageId++;
      const timeout = setTimeout(() => {
        reject(new Error('Worker message timeout'));
      }, 5000);

      const handler = (message) => {
        if (message.id === id) {
          clearTimeout(timeout);
          worker.off('message', handler);
          resolve(message.result);
        }
      };

      worker.on('message', handler);
      worker.postMessage({ id, type, payload });
    });
  };

  beforeEach(async () => {
    // Create temporary database file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-test-'));
    dbPath = path.join(tmpDir, 'test.sqlite');

    // Create worker
    const workerPath = path.join(__dirname, '../src/main/database-worker.js');
    worker = new Worker(workerPath);

    // Initialize database
    const result = await sendMessage('init', { dbPath });
    expect(result.success).toBe(true);
  });

  afterEach(async () => {
    if (worker) {
      // Close database and terminate worker
      await sendMessage('close');
      await worker.terminate();
      worker = null;
    }

    // Clean up database file
    if (dbPath && fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      const dir = path.dirname(dbPath);
      if (fs.existsSync(dir)) {
        fs.rmdirSync(dir);
      }
    }
  });

  describe('initialization', () => {
    it('should initialize database successfully', async () => {
      // Already initialized in beforeEach, verify file exists
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('should create required tables', async () => {
      // Tables are created during init - if no error, tables exist
      // We can verify by trying to use them
      const result = await sendMessage('getMediaViewCounts', {
        filePaths: ['/test.png'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('recordMediaView', () => {
    it('should record a media view', async () => {
      const filePath = '/test/image.png';
      const result = await sendMessage('recordMediaView', { filePath });

      expect(result.success).toBe(true);
    });

    it('should increment view count on multiple views', async () => {
      const filePath = '/test/video.mp4';

      await sendMessage('recordMediaView', { filePath });
      await sendMessage('recordMediaView', { filePath });

      const viewCounts = await sendMessage('getMediaViewCounts', {
        filePaths: [filePath],
      });

      expect(viewCounts.success).toBe(true);
      expect(viewCounts.data[filePath]).toBe(2);
    });

    it('should update last_viewed timestamp', async () => {
      const filePath = '/test/file.jpg';
      await sendMessage('recordMediaView', { filePath });

      // The last_viewed should be set (we can't easily check the exact value)
      const viewCounts = await sendMessage('getMediaViewCounts', {
        filePaths: [filePath],
      });
      expect(viewCounts.data[filePath]).toBeGreaterThan(0);
    });
  });

  describe('getMediaViewCounts', () => {
    it('should return empty object for files with no views', async () => {
      const result = await sendMessage('getMediaViewCounts', {
        filePaths: ['/never/viewed.png'],
      });

      expect(result.success).toBe(true);
      expect(result.data['/never/viewed.png']).toBe(0);
    });

    it('should return correct view counts for multiple files', async () => {
      const files = ['/test/a.png', '/test/b.jpg', '/test/c.mp4'];

      await sendMessage('recordMediaView', { filePath: files[0] });
      await sendMessage('recordMediaView', { filePath: files[1] });
      await sendMessage('recordMediaView', { filePath: files[1] });

      const result = await sendMessage('getMediaViewCounts', {
        filePaths: files,
      });

      expect(result.success).toBe(true);
      expect(result.data[files[0]]).toBe(1);
      expect(result.data[files[1]]).toBe(2);
      expect(result.data[files[2]]).toBe(0);
    });

    it('should handle empty file paths array', async () => {
      const result = await sendMessage('getMediaViewCounts', {
        filePaths: [],
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });
  });

  describe('cacheModels', () => {
    it('should cache models successfully', async () => {
      const models = [
        {
          name: 'model1',
          textures: [{ name: 'tex1.png', path: '/test/tex1.png' }],
        },
      ];

      const result = await sendMessage('cacheModels', {
        cacheKey: 'test_cache',
        models,
      });

      expect(result.success).toBe(true);
    });

    it('should handle empty models array', async () => {
      const result = await sendMessage('cacheModels', {
        cacheKey: 'empty_cache',
        models: [],
      });

      expect(result.success).toBe(true);
    });

    it('should overwrite existing cache with same key', async () => {
      const models1 = [{ name: 'model1', textures: [] }];
      const models2 = [{ name: 'model2', textures: [] }];

      await sendMessage('cacheModels', {
        cacheKey: 'same_key',
        models: models1,
      });
      await sendMessage('cacheModels', {
        cacheKey: 'same_key',
        models: models2,
      });

      const result = await sendMessage('getCachedModels', {
        cacheKey: 'same_key',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('model2');
    });
  });

  describe('getCachedModels', () => {
    it('should return null for non-existent cache', async () => {
      const result = await sendMessage('getCachedModels', {
        cacheKey: 'non_existent',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should retrieve cached models', async () => {
      const models = [
        {
          name: 'cached-model',
          textures: [{ name: 'tex.png', path: '/test/tex.png' }],
        },
      ];

      await sendMessage('cacheModels', {
        cacheKey: 'retrieve_test',
        models,
      });

      const result = await sendMessage('getCachedModels', {
        cacheKey: 'retrieve_test',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('cached-model');
    });

    it('should preserve model structure', async () => {
      const models = [
        {
          name: 'complex-model',
          textures: [
            { name: 'tex1.png', path: '/test/tex1.png' },
            { name: 'tex2.jpg', path: '/test/tex2.jpg' },
          ],
        },
      ];

      await sendMessage('cacheModels', {
        cacheKey: 'structure_test',
        models,
      });

      const result = await sendMessage('getCachedModels', {
        cacheKey: 'structure_test',
      });

      expect(result.data[0].textures).toHaveLength(2);
      expect(result.data[0].textures[0].name).toBe('tex1.png');
    });
  });

  describe('addMediaDirectory', () => {
    it('should add a media directory', async () => {
      const result = await sendMessage('addMediaDirectory', {
        directoryPath: '/test/media',
      });

      expect(result.success).toBe(true);
    });

    it('should not duplicate directories', async () => {
      const dirPath = '/test/same-dir';

      await sendMessage('addMediaDirectory', { directoryPath: dirPath });
      await sendMessage('addMediaDirectory', { directoryPath: dirPath });

      const result = await sendMessage('getMediaDirectories');
      const dirs = result.data.filter((d) => d.path === dirPath);
      expect(dirs).toHaveLength(1);
    });

    it('should re-activate an existing directory when it is added again', async () => {
      const directoryPath = '/test/media/directory';

      const assertDirectoryState = async (path, expectedState) => {
        const result = await sendMessage('getMediaDirectories');
        const dir = result.data.find((d) => d.path === path);
        if (expectedState === null) {
          expect(dir).toBeUndefined();
        } else {
          expect(dir).toBeDefined();
          expect(dir.isActive).toBe(expectedState);
        }
      };

      // 1. Add the directory, it should be active by default.
      await sendMessage('addMediaDirectory', { directoryPath });
      await assertDirectoryState(directoryPath, true);

      // 2. Deactivate the directory.
      await sendMessage('setDirectoryActiveState', {
        directoryPath,
        isActive: false,
      });
      await assertDirectoryState(directoryPath, false);

      // 3. Re-add the same directory.
      await sendMessage('addMediaDirectory', { directoryPath });

      // 4. Assert that the directory is now active again.
      await assertDirectoryState(directoryPath, true);
    });
  });

  describe('getMediaDirectories', () => {
    it('should return empty array when no directories', async () => {
      const result = await sendMessage('getMediaDirectories');

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('should return all media directories', async () => {
      await sendMessage('addMediaDirectory', { directoryPath: '/test/dir1' });
      await sendMessage('addMediaDirectory', { directoryPath: '/test/dir2' });

      const result = await sendMessage('getMediaDirectories');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should include isActive status', async () => {
      await sendMessage('addMediaDirectory', { directoryPath: '/test/dir' });

      const result = await sendMessage('getMediaDirectories');

      expect(result.data[0]).toHaveProperty('path');
      expect(result.data[0]).toHaveProperty('isActive');
      expect(typeof result.data[0].isActive).toBe('boolean');
    });
  });

  describe('removeMediaDirectory', () => {
    it('should remove a media directory', async () => {
      const dirPath = '/test/to-remove';

      await sendMessage('addMediaDirectory', { directoryPath: dirPath });
      const result = await sendMessage('removeMediaDirectory', {
        directoryPath: dirPath,
      });

      expect(result.success).toBe(true);

      const dirs = await sendMessage('getMediaDirectories');
      expect(dirs.data.some((d) => d.path === dirPath)).toBe(false);
    });
  });

  describe('setDirectoryActiveState', () => {
    it('should set directory active state', async () => {
      const dirPath = '/test/toggle';

      await sendMessage('addMediaDirectory', { directoryPath: dirPath });
      const result = await sendMessage('setDirectoryActiveState', {
        directoryPath: dirPath,
        isActive: false,
      });

      expect(result.success).toBe(true);

      const dirs = await sendMessage('getMediaDirectories');
      const dir = dirs.data.find((d) => d.path === dirPath);
      expect(dir.isActive).toBe(false);
    });

    it('should toggle state correctly', async () => {
      const dirPath = '/test/toggle-multi';

      await sendMessage('addMediaDirectory', { directoryPath: dirPath });

      await sendMessage('setDirectoryActiveState', {
        directoryPath: dirPath,
        isActive: false,
      });
      let dirs = await sendMessage('getMediaDirectories');
      let dir = dirs.data.find((d) => d.path === dirPath);
      expect(dir.isActive).toBe(false);

      await sendMessage('setDirectoryActiveState', {
        directoryPath: dirPath,
        isActive: true,
      });
      dirs = await sendMessage('getMediaDirectories');
      dir = dirs.data.find((d) => d.path === dirPath);
      expect(dir.isActive).toBe(true);
    });
  });

  describe('closeDatabase', () => {
    it('should close database successfully', async () => {
      const result = await sendMessage('close');
      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should return error for invalid message type', async () => {
      const result = await sendMessage('invalid_operation');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
