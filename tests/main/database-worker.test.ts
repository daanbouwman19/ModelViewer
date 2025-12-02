import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { parentPort } from 'worker_threads';

// Mock worker_threads using the __mocks__ file
vi.mock('worker_threads');

// Import the worker once. It will attach the listener to the mocked parentPort.
import '../../src/main/database-worker.js';

describe('Database Worker', () => {
  let dbPath: string;
  let tempDir: string;
  let messageId = 0;

  beforeEach(async () => {
    const testDir = path.join(process.cwd(), 'tests', 'temp');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    tempDir = fs.mkdtempSync(path.join(testDir, 'test-db-'));
    dbPath = path.join(tempDir, 'test.sqlite');

    // We don't remove listeners because the worker's listener must remain.
    // We only need to ensure we don't have stale 'workerMessage' listeners from previous tests.
    parentPort!.removeAllListeners('workerMessage');
  });

  afterEach(async () => {
    // Send close message to ensure DB is closed and file can be cleaned up
    try {
      await sendMessage('close', {});
    } catch {
      // Ignore errors during cleanup
    }

    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sendMessage = (type: string, payload: any): Promise<any> => {
    const id = messageId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Clean up listener on timeout
        parentPort!.off('workerMessage', messageHandler);
        reject(new Error(`Message ${id} (${type}) timed out`));
      }, 2000);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageHandler = (message: any) => {
        if (message.id === id) {
          parentPort!.off('workerMessage', messageHandler);
          clearTimeout(timeout);
          resolve(message.result);
        }
      };

      parentPort!.on('workerMessage', messageHandler);
      parentPort!.emit('message', { id, type, payload });
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

  describe('Album Caching', () => {
    beforeEach(async () => {
      await sendMessage('init', { dbPath });
    });

    it('should cache albums', async () => {
      const albums = [{ id: 1, name: 'test' }];
      const result = await sendMessage('cacheAlbums', {
        cacheKey: 'test-key',
        albums,
      });
      expect(result.success).toBe(true);
    });

    it('should get cached albums', async () => {
      const albums = [{ id: 1, name: 'test' }];
      await sendMessage('cacheAlbums', { cacheKey: 'test-key', albums });
      const result = await sendMessage('getCachedAlbums', {
        cacheKey: 'test-key',
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual(albums);
    });

    it('should return null for non-existent cache', async () => {
      const result = await sendMessage('getCachedAlbums', {
        cacheKey: 'non-existent',
      });
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should overwrite existing cache', async () => {
      const albums1 = [{ name: 'album1' }];
      const albums2 = [{ name: 'album2' }];
      await sendMessage('cacheAlbums', {
        cacheKey: 'same_key',
        albums: albums1,
      });
      await sendMessage('cacheAlbums', {
        cacheKey: 'same_key',
        albums: albums2,
      });
      const result = await sendMessage('getCachedAlbums', {
        cacheKey: 'same_key',
      });
      expect(result.success).toBe(true);
      expect(result.data[0].name).toBe('album2');
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dirs = result.data.filter((d: any) => d.path === dirPath);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dir = result.data.find((d: any) => d.path === dirPath);
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
        { type: 'cacheAlbums', payload: { cacheKey: 'key', albums: [] } },
        { type: 'getCachedAlbums', payload: { cacheKey: 'key' } },
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async ({ type, payload }: any) => {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async ({ type, payload }: any) => {
          const result = await sendMessage(type, payload);
          expect(result.success).toBe(false);
          expect(result.error).toBe('Database not initialized');
        },
      );
    });
  });
});
