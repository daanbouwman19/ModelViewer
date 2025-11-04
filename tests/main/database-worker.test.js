import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Worker } from 'worker_threads';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const workerPath = path.resolve(process.cwd(), 'src/main/database-worker.js');

describe('Database Worker', () => {
  let worker;
  let dbPath;
  let tempDir;
  let messageId = 0;

  beforeEach(async () => {
    const testDir = path.join(process.cwd(), 'tests', 'temp');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    tempDir = fs.mkdtempSync(path.join(testDir, 'test-db-'));
    dbPath = path.join(tempDir, 'test.sqlite');

    worker = new Worker(workerPath);
    await new Promise((resolve) => {
      worker.once('message', (message) => {
        if (message.type === 'ready') {
          resolve();
        }
      });
    });
  });

  afterEach(async () => {
    if (worker) {
      await worker.terminate();
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const sendMessage = (type, payload) => {
    const id = messageId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Message ${id} (${type}) timed out`));
      }, 2000);

      const messageHandler = ({ id: responseId, result }) => {
        if (responseId === id) {
          worker.removeListener('message', messageHandler);
          clearTimeout(timeout);
          // For tests, we want to check the full result, not just success
          resolve(result);
        }
      };

      worker.on('message', messageHandler);
      worker.postMessage({ id, type, payload });
    });
  };

  describe('Initialization and Basic Operations', () => {
    it('should initialize the database', async () => {
      const result = await sendMessage('init', { dbPath });
      expect(result.success).toBe(true);
    });

    it('should handle re-initialization', async () => {
      await sendMessage('init', { dbPath });
      const newDbPath = path.join(tempDir, 'new.sqlite');
      const result = await sendMessage('init', { dbPath: newDbPath });
      expect(result.success).toBe(true);
    });

    it('should close the database', async () => {
      await sendMessage('init', { dbPath });
      const result = await sendMessage('close', {});
      expect(result.success).toBe(true);
    });
  });

  describe('Media Views', () => {
    beforeEach(async () => {
      await sendMessage('init', { dbPath });
    });

    it('should record a media view', async () => {
      const filePath = path.join(tempDir, 'file.jpg');
      fs.writeFileSync(filePath, 'test data');
      const result = await sendMessage('recordMediaView', { filePath });
      expect(result.success).toBe(true);
    });

    it('should increment view count', async () => {
      const filePath = path.join(tempDir, 'file.jpg');
      fs.writeFileSync(filePath, 'test data');
      await sendMessage('recordMediaView', { filePath });
      await sendMessage('recordMediaView', { filePath });
      const result = await sendMessage('getMediaViewCounts', {
        filePaths: [filePath],
      });
      expect(result.success).toBe(true);
      expect(result.data[filePath]).toBe(2);
    });

    it('should return zero for files with no views', async () => {
      const filePath = path.join(tempDir, 'never-viewed.png');
      fs.writeFileSync(filePath, 'never viewed');
      const result = await sendMessage('getMediaViewCounts', {
        filePaths: [filePath],
      });
      expect(result.success).toBe(true);
      expect(result.data[filePath]).toBe(0);
    });

    it('should handle special characters in file paths', async () => {
      const filePath = path.join(tempDir, 'file with spaces & chars!.png');
      fs.writeFileSync(filePath, 'special data');
      const result = await sendMessage('recordMediaView', { filePath });
      expect(result.success).toBe(true);
    });
  });

  describe('Model Caching', () => {
    beforeEach(async () => {
      await sendMessage('init', { dbPath });
    });

    it('should cache models', async () => {
      const models = [{ id: 1, name: 'test' }];
      const result = await sendMessage('cacheModels', {
        cacheKey: 'test-key',
        models,
      });
      expect(result.success).toBe(true);
    });

    it('should get cached models', async () => {
      const models = [{ id: 1, name: 'test' }];
      await sendMessage('cacheModels', { cacheKey: 'test-key', models });
      const result = await sendMessage('getCachedModels', {
        cacheKey: 'test-key',
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual(models);
    });

    it('should return null for non-existent cache', async () => {
      const result = await sendMessage('getCachedModels', {
        cacheKey: 'non-existent',
      });
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should overwrite existing cache', async () => {
      const models1 = [{ name: 'model1' }];
      const models2 = [{ name: 'model2' }];
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
      expect(result.data[0].name).toBe('model2');
    });
  });

  describe('Media Directories', () => {
    beforeEach(async () => {
      await sendMessage('init', { dbPath });
    });

    it('should add a media directory', async () => {
      const result = await sendMessage('addMediaDirectory', {
        directoryPath: '/test/directory',
      });
      expect(result.success).toBe(true);
    });

    it('should get media directories', async () => {
      await sendMessage('addMediaDirectory', {
        directoryPath: '/test/directory',
      });
      const result = await sendMessage('getMediaDirectories', {});
      expect(result.success).toBe(true);
      expect(result.data).toEqual([
        { path: '/test/directory', isActive: true },
      ]);
    });

    it('should not duplicate directories', async () => {
      const dirPath = '/test/same-dir';
      await sendMessage('addMediaDirectory', { directoryPath: dirPath });
      await sendMessage('addMediaDirectory', { directoryPath: dirPath });
      const result = await sendMessage('getMediaDirectories', {});
      const dirs = result.data.filter((d) => d.path === dirPath);
      expect(dirs).toHaveLength(1);
    });

    it('should re-activate deactivated directories on add', async () => {
      const dirPath = '/test/reactivate';
      await sendMessage('addMediaDirectory', { directoryPath: dirPath });
      await sendMessage('setDirectoryActiveState', {
        directoryPath: dirPath,
        isActive: false,
      });
      await sendMessage('addMediaDirectory', { directoryPath: dirPath });
      const result = await sendMessage('getMediaDirectories', {});
      const dir = result.data.find((d) => d.path === dirPath);
      expect(dir.isActive).toBe(true);
    });

    it('should remove a media directory', async () => {
      await sendMessage('addMediaDirectory', {
        directoryPath: '/test/directory',
      });
      const result = await sendMessage('removeMediaDirectory', {
        directoryPath: '/test/directory',
      });
      expect(result.success).toBe(true);
      const result2 = await sendMessage('getMediaDirectories', {});
      expect(result2.data).toEqual([]);
    });

    it('should set directory active state', async () => {
      await sendMessage('addMediaDirectory', {
        directoryPath: '/test/directory',
      });
      const result = await sendMessage('setDirectoryActiveState', {
        directoryPath: '/test/directory',
        isActive: false,
      });
      expect(result.success).toBe(true);
      const result2 = await sendMessage('getMediaDirectories', {});
      expect(result2.data).toEqual([
        { path: '/test/directory', isActive: false },
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should return error for unknown message type', async () => {
      const result = await sendMessage('unknownType', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown message type');
    });

    // Test operations before initialization
    describe('Operations before init', () => {
      const testCases = [
        { type: 'recordMediaView', payload: { filePath: '/test.png' } },
        { type: 'getMediaViewCounts', payload: { filePaths: [] } },
        { type: 'cacheModels', payload: { cacheKey: 'key', models: [] } },
        { type: 'getCachedModels', payload: { cacheKey: 'key' } },
        { type: 'addMediaDirectory', payload: { directoryPath: '/test' } },
        { type: 'getMediaDirectories', payload: {} },
        { type: 'removeMediaDirectory', payload: { directoryPath: '/test' } },
        {
          type: 'setDirectoryActiveState',
          payload: { directoryPath: '/test', isActive: true },
        },
      ];

      it.each(testCases)(
        '$type should fail gracefully',
        async ({ type, payload }) => {
          const result = await sendMessage(type, payload);
          expect(result.success).toBe(false);
          expect(result.error).toBe('Database not initialized');
        },
      );
    });

    // Test operations after closing the database
    describe('Operations after close', () => {
      beforeEach(async () => {
        await sendMessage('init', { dbPath });
        await sendMessage('close', {});
      });

      const testCases = [
        { type: 'recordMediaView', payload: { filePath: '/test.png' } },
        { type: 'getMediaViewCounts', payload: { filePaths: [] } },
        { type: 'addMediaDirectory', payload: { directoryPath: '/test' } },
      ];

      it.each(testCases)(
        '$type should fail gracefully',
        async ({ type, payload }) => {
          const result = await sendMessage(type, payload);
          expect(result.success).toBe(false);
          expect(result.error).toBe('Database not initialized');
        },
      );
    });
  });
});
