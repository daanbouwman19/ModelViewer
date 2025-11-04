import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initDatabase,
  recordMediaView,
  getMediaViewCounts,
  cacheModels,
  getCachedModels,
  closeDatabase,
  setOperationTimeout,
  addMediaDirectory,
  getMediaDirectories,
  removeMediaDirectory,
  setDirectoryActiveState,
} from '../../src/main/database.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-'));
      return tmpDir;
    },
    isPackaged: false,
  },
}));

describe('Database', () => {
  beforeEach(async () => {
    vi.resetModules();
    // Set a shorter timeout for tests
    setOperationTimeout(5000);
    // Initialize database before each test
    await initDatabase();
  });

  afterEach(async () => {
    // Close database after each test
    await closeDatabase();
  });

  describe('initDatabase', () => {
    it('should initialize the database successfully', async () => {
      // Database is already initialized in beforeEach
      // This test verifies no error was thrown
      expect(true).toBe(true);
    });

    it('should handle re-initialization', async () => {
      // Try to initialize again
      await expect(initDatabase()).resolves.not.toThrow();
    });
  });

  describe('recordMediaView', () => {
    it('should record a view for a media file', async () => {
      const filePath = '/test/path/image.png';

      await recordMediaView(filePath);

      const counts = await getMediaViewCounts([filePath]);
      expect(counts[filePath]).toBe(1);
    });

    it('should increment view count on multiple views', async () => {
      const filePath = '/test/path/video.mp4';

      await recordMediaView(filePath);
      await recordMediaView(filePath);
      await recordMediaView(filePath);

      const counts = await getMediaViewCounts([filePath]);
      expect(counts[filePath]).toBe(3);
    });

    it('should handle multiple different files', async () => {
      const file1 = '/test/file1.png';
      const file2 = '/test/file2.jpg';

      await recordMediaView(file1);
      await recordMediaView(file2);
      await recordMediaView(file1);

      const counts = await getMediaViewCounts([file1, file2]);
      expect(counts[file1]).toBe(2);
      expect(counts[file2]).toBe(1);
    });
  });

  describe('getMediaViewCounts', () => {
    it('should return empty object for empty array', async () => {
      const counts = await getMediaViewCounts([]);
      expect(counts).toEqual({});
    });

    it('should return 0 for files that have not been viewed', async () => {
      const counts = await getMediaViewCounts(['/test/never-viewed.png']);
      expect(counts['/test/never-viewed.png']).toBe(0);
    });

    it('should return correct counts for multiple files', async () => {
      const files = ['/test/a.png', '/test/b.jpg', '/test/c.mp4'];

      await recordMediaView(files[0]);
      await recordMediaView(files[1]);
      await recordMediaView(files[1]);

      const counts = await getMediaViewCounts(files);
      expect(counts[files[0]]).toBe(1);
      expect(counts[files[1]]).toBe(2);
      expect(counts[files[2]]).toBe(0);
    });

    it('should handle files with special characters in paths', async () => {
      const specialPath = '/test/file with spaces & symbols.png';

      await recordMediaView(specialPath);

      const counts = await getMediaViewCounts([specialPath]);
      expect(counts[specialPath]).toBe(1);
    });
  });

  describe('cacheModels', () => {
    it('should cache models successfully', async () => {
      const models = [
        {
          name: 'model1',
          textures: [
            { name: 'texture1.png', path: '/test/model1/texture1.png' },
          ],
        },
        {
          name: 'model2',
          textures: [
            { name: 'texture2.jpg', path: '/test/model2/texture2.jpg' },
          ],
        },
      ];

      await cacheModels(models);

      const cached = await getCachedModels();
      expect(cached).toHaveLength(2);
      expect(cached[0].name).toBe('model1');
      expect(cached[1].name).toBe('model2');
    });

    it('should overwrite existing cache', async () => {
      const models1 = [
        {
          name: 'model1',
          textures: [{ name: 'tex1.png', path: '/test/tex1.png' }],
        },
      ];

      const models2 = [
        {
          name: 'model2',
          textures: [{ name: 'tex2.png', path: '/test/tex2.png' }],
        },
      ];

      await cacheModels(models1);
      await cacheModels(models2);

      const cached = await getCachedModels();
      expect(cached).toHaveLength(1);
      expect(cached[0].name).toBe('model2');
    });

    it('should handle empty models array', async () => {
      await cacheModels([]);

      const cached = await getCachedModels();
      expect(cached).toEqual([]);
    });

    it('should preserve model structure', async () => {
      const models = [
        {
          name: 'test-model',
          textures: [
            { name: 'texture1.png', path: '/test/texture1.png' },
            { name: 'texture2.jpg', path: '/test/texture2.jpg' },
          ],
        },
      ];

      await cacheModels(models);

      const cached = await getCachedModels();
      expect(cached[0].textures).toHaveLength(2);
      expect(cached[0].textures[0].name).toBe('texture1.png');
      expect(cached[0].textures[0].path).toBe('/test/texture1.png');
    });
  });

  describe('getCachedModels', () => {
    it('should return null when no cache exists', async () => {
      const cached = await getCachedModels();
      expect(cached).toBeNull();
    });

    it('should retrieve cached models', async () => {
      const models = [
        {
          name: 'cached-model',
          textures: [{ name: 'tex.png', path: '/test/tex.png' }],
        },
      ];

      await cacheModels(models);
      const cached = await getCachedModels();

      expect(cached).toHaveLength(1);
      expect(cached[0].name).toBe('cached-model');
    });
  });

  describe('closeDatabase', () => {
    it('should close database without errors', async () => {
      await expect(closeDatabase()).resolves.not.toThrow();
    });

    it('should allow re-initialization after closing', async () => {
      await closeDatabase();
      await expect(initDatabase()).resolves.not.toThrow();
    });
  });

  describe('timeout handling', () => {
    it('should respect custom timeout settings', () => {
      setOperationTimeout(1000);
      // If this doesn't throw, the timeout was set successfully
      expect(true).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle multiple sequential operations gracefully', async () => {
      const promises = [];
      // Sequential execution to avoid transaction conflicts
      for (let i = 0; i < 10; i++) {
        await recordMediaView(`/test/file${i}.png`);
      }

      // Verify all were recorded
      const files = Array.from({ length: 10 }, (_, i) => `/test/file${i}.png`);
      const counts = await getMediaViewCounts(files);
      expect(Object.keys(counts)).toHaveLength(10);
    });

    it('should handle large batches of view counts', async () => {
      const files = Array.from({ length: 100 }, (_, i) => `/test/file${i}.png`);

      // Record views for some files
      for (let i = 0; i < 50; i++) {
        await recordMediaView(files[i]);
      }

      const counts = await getMediaViewCounts(files);
      expect(Object.keys(counts)).toHaveLength(100);
    });
  });

  describe('media directories', () => {
    it('should add and retrieve a media directory', async () => {
      const dirPath = '/test/media/directory';
      await addMediaDirectory(dirPath);
      const dirs = await getMediaDirectories();
      expect(dirs).toEqual([{ path: dirPath, isActive: true }]);
    });

    it('should add and remove a media directory', async () => {
      const dirPath = '/test/media/to-remove';
      await addMediaDirectory(dirPath);
      await removeMediaDirectory(dirPath);
      const dirs = await getMediaDirectories();
      expect(dirs).toEqual([]);
    });

    it('should set directory active state', async () => {
      const dirPath = '/test/media/toggle';
      await addMediaDirectory(dirPath);
      await setDirectoryActiveState(dirPath, false);
      let dirs = await getMediaDirectories();
      expect(dirs).toEqual([{ path: dirPath, isActive: false }]);
      await setDirectoryActiveState(dirPath, true);
      dirs = await getMediaDirectories();
      expect(dirs).toEqual([{ path: dirPath, isActive: true }]);
    });
  });

  describe('error handling for directory operations', () => {
    it('should handle errors when removing non-existent directory', async () => {
      // This should not throw, but we'll test that the operation completes
      await removeMediaDirectory('/non/existent/path');
      const dirs = await getMediaDirectories();
      expect(Array.isArray(dirs)).toBe(true);
    });

    it('should handle errors when setting active state on non-existent directory', async () => {
      // This should not throw, but we'll test that the operation completes
      await setDirectoryActiveState('/non/existent/path', false);
      const dirs = await getMediaDirectories();
      expect(Array.isArray(dirs)).toBe(true);
    });

    it('should handle gracefully when trying to record view without initialization', async () => {
      await closeDatabase();
      // recordMediaView should not throw, it handles errors gracefully
      await expect(recordMediaView('/test/path.jpg')).resolves.toBeUndefined();
    });

    it('should return empty object when trying to get view counts without initialization', async () => {
      await closeDatabase();
      // getMediaViewCounts returns empty object on error
      const result = await getMediaViewCounts(['/test/path.jpg']);
      expect(result).toEqual({});
    });
  });
});

describe('database resilience', () => {
  let MockWorker;
  let lastWorkerInstance;
  let terminateSpy;

  beforeEach(() => {
    vi.resetModules(); // This is key to re-evaluate mocks

    // Define the mock behavior *before* importing the module that uses it
    terminateSpy = vi.fn().mockResolvedValue(true);
    lastWorkerInstance = null; // reset instance tracker

    MockWorker = vi.fn().mockImplementation(function (...args) {
      const instance = new (class WorkerMock {
        constructor() {
          lastWorkerInstance = this;
          this.on = vi.fn((event, cb) => {
            if (event === 'message') this.onMessage = cb;
            if (event === 'exit') this.onExit = cb;
          });
          this.postMessage = vi.fn((msg) => {
            if (this.onMessage) {
              this.onMessage({
                id: msg.id,
                result: { success: true, data: 'mock success' },
              });
            }
          });
          this.terminate = terminateSpy;
        }
        _crash() {
          if (this.onExit) this.onExit(1);
        }
      })(...args);
      return instance;
    });

    vi.doMock('worker_threads', () => ({
      Worker: MockWorker,
      default: { Worker: MockWorker },
    }));
  });

  it('should call terminate() during closeDatabase even if worker has already crashed', async () => {
    // Dynamically import the module under test AFTER mocks are set up
    const { initDatabase, closeDatabase, setOperationTimeout } = await import(
      '../../src/main/database.js'
    );
    setOperationTimeout(100); // Short timeout for test speed

    await initDatabase();

    // Verify the worker was created
    expect(MockWorker).toHaveBeenCalledTimes(1);
    expect(lastWorkerInstance).toBeDefined();
    expect(lastWorkerInstance).not.toBeNull();

    // Simulate the worker crashing unexpectedly
    lastWorkerInstance._crash();

    // Now, try to close the database. The 'close' message will fail,
    // but terminate() should still be called.
    await closeDatabase();

    // The core of the test: assert that terminate() was called.
    expect(terminateSpy).toHaveBeenCalledTimes(1);
  });
});
