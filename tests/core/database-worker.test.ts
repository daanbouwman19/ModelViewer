import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { parentPort } from 'worker_threads';

// Mock worker_threads using the __mocks__ file
vi.mock('worker_threads');

// Import the worker once. It will attach the listener to the mocked parentPort.
import '../../src/core/database-worker';

interface WorkerMessage {
  id: number;
  result?: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
}

interface Directory {
  id: string;
  path: string;
  type: string;
  name: string;
  isActive: boolean;
}

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

  const sendMessage = (
    type: string,
    payload: unknown,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> => {
    const id = messageId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Clean up listener on timeout
        parentPort!.off('workerMessage', messageHandler);
        reject(new Error(`Message ${id} (${type}) timed out`));
      }, 2000);

      const messageHandler = (message: WorkerMessage) => {
        if (message.id === id) {
          parentPort!.off('workerMessage', messageHandler);
          clearTimeout(timeout);
          resolve(
            message.result as {
              success: boolean;
              data?: unknown;
              error?: string;
            },
          );
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
      expect((result.data as Record<string, number>)[filePath]).toBe(2);
    });

    it('should return zero for files with no views', async () => {
      const filePath = path.join(tempDir, 'never-viewed.png');
      fs.writeFileSync(filePath, 'never viewed');
      const result = await sendMessage('getMediaViewCounts', {
        filePaths: [filePath],
      });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, number>)[filePath]).toBe(0);
    });

    it('should handle special characters in file paths', async () => {
      const filePath = path.join(tempDir, 'file with spaces & chars!.png');
      fs.writeFileSync(filePath, 'special data');
      const result = await sendMessage('recordMediaView', { filePath });
      expect(result.success).toBe(true);
    });

    it('should handle non-existent files (fallback ID generation)', async () => {
      const filePath = path.join(tempDir, 'non-existent.png');
      // Do NOT create the file.
      // this should trigger the catch block in generateFileId
      const result = await sendMessage('recordMediaView', { filePath });
      expect(result.success).toBe(true);

      const counts = await sendMessage('getMediaViewCounts', {
        filePaths: [filePath],
      });
      expect((counts.data as any)[filePath]).toBe(1);
    });

    it('should generate ID from path for GDrive files', async () => {
      const filePath = 'gdrive://12345';
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
      expect((result.data as { name: string }[])[0].name).toBe('album2');
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
      // New structure validation
      const dirs = result.data as Directory[];
      expect(dirs).toHaveLength(1);
      expect(dirs[0].path).toBe('/test/directory');
      expect(dirs[0].isActive).toBe(true);
      expect(dirs[0].type).toBe('local'); // Default
      expect(dirs[0].id).toBeDefined();
    });

    it('should not duplicate directories', async () => {
      const dirPath = '/test/same-dir';
      await sendMessage('addMediaDirectory', { directoryPath: dirPath });
      await sendMessage('addMediaDirectory', { directoryPath: dirPath });
      const result = await sendMessage('getMediaDirectories', {});
      const dirs = (result.data as Directory[]).filter(
        (d) => d.path === dirPath,
      );
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
      const dir = (result.data as Directory[]).find((d) => d.path === dirPath);
      expect(dir?.isActive).toBe(true);
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
      const dirPath = '/test/directory';
      await sendMessage('addMediaDirectory', {
        directoryPath: dirPath,
      });
      const result = await sendMessage('setDirectoryActiveState', {
        directoryPath: dirPath,
        isActive: false,
      });
      expect(result.success).toBe(true);
      const result2 = await sendMessage('getMediaDirectories', {});
      const dir = (result2.data as Directory[]).find((d) => d.path === dirPath);
      expect(dir).toBeDefined();
      expect(dir!.isActive).toBe(false);
    });
  });

  describe('Smart Playlists & Metadata', () => {
    beforeEach(async () => {
      await sendMessage('init', { dbPath });
    });

    it('should create and retrieve smart playlists', async () => {
      const result = await sendMessage('createSmartPlaylist', {
        name: 'My List',
        criteria: '{}',
      });
      expect(result.success).toBe(true);
      expect((result.data as any).id).toBeDefined();

      const listResult = await sendMessage('getSmartPlaylists', {});
      expect(listResult.success).toBe(true);
      expect(listResult.data).toHaveLength(1);
      expect((listResult.data as any)[0].name).toBe('My List');
    });

    it('should update and delete smart playlists', async () => {
      const createRes = await sendMessage('createSmartPlaylist', {
        name: 'Temp',
        criteria: '{}',
      });
      const id = (createRes.data as any).id;

      await sendMessage('updateSmartPlaylist', {
        id,
        name: 'Updated',
        criteria: '{"a":1}',
      });
      const listRes = await sendMessage('getSmartPlaylists', {});
      expect((listRes.data as any)[0].name).toBe('Updated');

      await sendMessage('deleteSmartPlaylist', { id });
      const emptyRes = await sendMessage('getSmartPlaylists', {});
      expect(emptyRes.data).toHaveLength(0);
    });

    it('should handle metadata and ratings', async () => {
      const filePath = path.join(tempDir, 'meta.mp4');
      fs.writeFileSync(filePath, 'dummy data');

      // Upsert
      const upsertRes = await sendMessage('upsertMetadata', {
        filePath,
        duration: 120,
      });
      expect(upsertRes.success).toBe(true);

      // Rate
      await sendMessage('setRating', { filePath, rating: 5 });

      // Get Metadata
      const getRes = await sendMessage('getMetadata', {
        filePaths: [filePath],
      });
      const meta = (getRes.data as any)[filePath];
      expect(meta.duration).toBe(120);
      expect(meta.rating).toBe(5);
    });

    it('should handle partial updates (COALESCE logic)', async () => {
      const filePath = path.join(tempDir, 'partial.mp4');
      fs.writeFileSync(filePath, 'dummy');

      // Initial insert
      await sendMessage('upsertMetadata', {
        filePath,
        duration: 100,
        size: 500,
        rating: 0,
      });

      // Partial update 1: change duration only
      await sendMessage('upsertMetadata', { filePath, duration: 200 });
      let res = await sendMessage('getMetadata', { filePaths: [filePath] });
      let meta = (res.data as any)[filePath];
      expect(meta.duration).toBe(200);
      expect(meta.size).toBe(500); // Should remain
      expect(meta.rating).toBe(0);

      // Partial update 2: change rating only
      await sendMessage('upsertMetadata', { filePath, rating: 4 });
      res = await sendMessage('getMetadata', { filePaths: [filePath] });
      meta = (res.data as any)[filePath];
      expect(meta.rating).toBe(4);
      expect(meta.duration).toBe(200); // Should remain
    });

    it('should fail gracefully when upsertMetadata receives invalid payload', async () => {
      // payload missing filePath
      const result = await sendMessage('upsertMetadata', { duration: 120 });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle setRating message', async () => {
      const filePath = path.join(tempDir, 'rated.mp4');
      fs.writeFileSync(filePath, 'dummy');

      const result = await sendMessage('setRating', { filePath, rating: 4 });
      expect(result.success).toBe(true);
    });

    it('should handle getMetadata message', async () => {
      const filePath = path.join(tempDir, 'meta.mp4');
      fs.writeFileSync(filePath, 'dummy');
      await sendMessage('upsertMetadata', { filePath, duration: 100 });

      const result = await sendMessage('getMetadata', {
        filePaths: [filePath],
      });
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should handle executeSmartPlaylist message', async () => {
      const result = await sendMessage('executeSmartPlaylist', {
        criteria: '{}',
      });
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
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
        async ({ type, payload }: { type: string; payload: unknown }) => {
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
        async ({ type, payload }: { type: string; payload: unknown }) => {
          const result = await sendMessage(type, payload);
          expect(result.success).toBe(false);
          expect(result.error).toBe('Database not initialized');
        },
      );
    });

    it('should catch top-level errors in message processing', async () => {
      // Trigger a TypeError by sending missing payload for a handler that expects it
      // 'recordMediaView' accesses payload.filePath immediately
      const result = await sendMessage('recordMediaView', null);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
