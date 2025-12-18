import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { parentPort } from 'worker_threads';
import Database from 'better-sqlite3';

// Mock worker_threads using the __mocks__ file logic
// In Vitest, we can just mock the module directly here or rely on __mocks__
// The original test mocked it and then imported the worker file to execute it in the main thread with mocked ports.
vi.mock('worker_threads');

// Import the worker once. It will attach the listener to the mocked parentPort.
// This executes the worker code in the context of the test runner.
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

interface SmartPlaylist {
  id: number;
  name: string;
  criteria: string;
}

describe('Database Worker (Integration)', () => {
  let dbPath: string;
  let tempDir: string;
  let messageId = 0;

  // Helper to send messages to the "worker" (which is running in this thread)
  const sendMessage = (
    type: string,
    payload: unknown,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> => {
    const id = messageId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
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

  beforeEach(async () => {
    // Setup temp directory
    const testDir = path.join(process.cwd(), 'tests', 'temp');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    tempDir = fs.mkdtempSync(path.join(testDir, 'test-db-'));
    dbPath = path.join(tempDir, 'test.sqlite');

    // Reset listeners
    parentPort!.removeAllListeners('workerMessage');
  });

  afterEach(async () => {
    // Attempt to close DB
    try {
      await sendMessage('close', {});
    } catch {
      // Ignore errors during cleanup
    }

    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

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

    it('should migrate old media_directories schema', async () => {
      // 1. Setup old schema manually using direct sqlite3
      const tempDb = new Database(dbPath);
      tempDb.exec(`
        CREATE TABLE media_directories (
          path TEXT UNIQUE,
          is_active INTEGER DEFAULT 1
        )
      `);
      tempDb
        .prepare(
          'INSERT INTO media_directories (path, is_active) VALUES (?, ?)',
        )
        .run('/old/path', 1);
      tempDb.close();

      // 2. Initialize via worker (triggers migration)
      const result = await sendMessage('init', { dbPath });
      expect(result.success).toBe(true);

      // 3. Verify migration
      const dirsResult = await sendMessage('getMediaDirectories', {});
      expect(dirsResult.success).toBe(true);
      const dirs = dirsResult.data as Directory[];
      expect(dirs).toHaveLength(1);
      expect(dirs[0].path).toBe('/old/path');
      expect(dirs[0].id).toBeDefined();
    });
  });

  describe('Media Views', () => {
    beforeEach(async () => {
      await sendMessage('init', { dbPath });
    });

    it('should record a media view and increment count', async () => {
      const filePath = path.join(tempDir, 'file.jpg');
      fs.writeFileSync(filePath, 'test data');

      // First view
      let result = await sendMessage('recordMediaView', { filePath });
      expect(result.success).toBe(true);

      // Second view
      await sendMessage('recordMediaView', { filePath });

      // Verify count
      result = await sendMessage('getMediaViewCounts', {
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

    it('should handle non-existent files gracefully', async () => {
      // generateFileId depends on file stats, so missing file triggers catch block
      const filePath = path.join(tempDir, 'non-existent.png');
      const result = await sendMessage('recordMediaView', { filePath });
      expect(result.success).toBe(true);

      const counts = await sendMessage('getMediaViewCounts', {
        filePaths: [filePath],
      });
      expect((counts.data as Record<string, number>)[filePath]).toBe(1);
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

    it('should cache and retrieve albums', async () => {
      const albums = [{ id: 1, name: 'test' }];
      const cacheKey = 'test-key';

      // Cache
      let result = await sendMessage('cacheAlbums', { cacheKey, albums });
      expect(result.success).toBe(true);

      // Retrieve
      result = await sendMessage('getCachedAlbums', { cacheKey });
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
      const cacheKey = 'same_key';

      await sendMessage('cacheAlbums', { cacheKey, albums: albums1 });
      await sendMessage('cacheAlbums', { cacheKey, albums: albums2 });

      const result = await sendMessage('getCachedAlbums', { cacheKey });
      expect(result.success).toBe(true);
      expect((result.data as { name: string }[])[0].name).toBe('album2');
    });
  });

  describe('Media Directories', () => {
    beforeEach(async () => {
      await sendMessage('init', { dbPath });
    });

    it('should manage media directories (add, get, remove)', async () => {
      // Add string path
      let result = await sendMessage('addMediaDirectory', {
        directoryObj: { path: '/test/directory' },
      });
      expect(result.success).toBe(true);

      // Add object path with name
      result = await sendMessage('addMediaDirectory', {
        directoryObj: { path: '/test/obj-dir', name: 'Custom Name' },
      });
      expect(result.success).toBe(true);

      // Get
      result = await sendMessage('getMediaDirectories', {});
      expect(result.success).toBe(true);
      const dirs = result.data as Directory[];
      expect(dirs).toHaveLength(2);

      const customDir = dirs.find((d) => d.path === '/test/obj-dir');
      expect(customDir?.name).toBe('Custom Name');
      expect(customDir?.isActive).toBe(true);

      // Remove
      result = await sendMessage('removeMediaDirectory', {
        directoryPath: '/test/directory',
      });
      expect(result.success).toBe(true);
      const resultAfterRemove = await sendMessage('getMediaDirectories', {});
      expect(resultAfterRemove.data).toHaveLength(1);
    });

    it('should not duplicate directories', async () => {
      const dirPath = '/test/same-dir';
      await sendMessage('addMediaDirectory', {
        directoryObj: { path: dirPath },
      });
      await sendMessage('addMediaDirectory', {
        directoryObj: { path: dirPath },
      });
      const result = await sendMessage('getMediaDirectories', {});
      const dirs = (result.data as Directory[]).filter(
        (d) => d.path === dirPath,
      );
      expect(dirs).toHaveLength(1);
    });

    it('should re-activate deactivated directories on add', async () => {
      const dirPath = '/test/reactivate';
      await sendMessage('addMediaDirectory', {
        directoryObj: { path: dirPath },
      });
      await sendMessage('setDirectoryActiveState', {
        directoryPath: dirPath,
        isActive: false,
      });
      await sendMessage('addMediaDirectory', {
        directoryObj: { path: dirPath },
      });

      const result = await sendMessage('getMediaDirectories', {});
      const dir = (result.data as Directory[]).find((d) => d.path === dirPath);
      expect(dir?.isActive).toBe(true);
    });

    it('should set directory active state', async () => {
      const dirPath = '/test/directory';
      await sendMessage('addMediaDirectory', {
        directoryObj: { path: dirPath },
      });
      const result = await sendMessage('setDirectoryActiveState', {
        directoryPath: dirPath,
        isActive: false,
      });
      expect(result.success).toBe(true);

      const result2 = await sendMessage('getMediaDirectories', {});
      const dir = (result2.data as Directory[]).find((d) => d.path === dirPath);
      expect(dir?.isActive).toBe(false);
    });
  });

  describe('Smart Playlists & Metadata', () => {
    beforeEach(async () => {
      await sendMessage('init', { dbPath });
    });

    it('should manage smart playlists (CRUD)', async () => {
      // Create
      const createRes = await sendMessage('createSmartPlaylist', {
        name: 'My List',
        criteria: '{}',
      });
      expect(createRes.success).toBe(true);
      const id = (createRes.data as SmartPlaylist).id;
      expect(id).toBeDefined();

      // Read
      let listRes = await sendMessage('getSmartPlaylists', {});
      expect(listRes.data).toHaveLength(1);
      expect((listRes.data as SmartPlaylist[])[0].name).toBe('My List');

      // Update
      await sendMessage('updateSmartPlaylist', {
        id,
        name: 'Updated',
        criteria: '{"a":1}',
      });
      listRes = await sendMessage('getSmartPlaylists', {});
      expect((listRes.data as SmartPlaylist[])[0].name).toBe('Updated');

      // Delete
      await sendMessage('deleteSmartPlaylist', { id });
      listRes = await sendMessage('getSmartPlaylists', {});
      expect(listRes.data).toHaveLength(0);
    });

    it('should handle metadata and ratings', async () => {
      const filePath = path.join(tempDir, 'meta.mp4');
      fs.writeFileSync(filePath, 'dummy data');

      // Upsert Metadata
      await sendMessage('upsertMetadata', { filePath, duration: 120 });

      // Set Rating
      await sendMessage('setRating', { filePath, rating: 5 });

      // Get Metadata
      const getRes = await sendMessage('getMetadata', {
        filePaths: [filePath],
      });
      const meta = (getRes.data as any)[filePath];
      expect(meta.duration).toBe(120);
      expect(meta.rating).toBe(5);
    });

    it('should handle partial metadata updates (COALESCE)', async () => {
      const filePath = path.join(tempDir, 'partial.mp4');
      fs.writeFileSync(filePath, 'dummy');

      // Initial
      await sendMessage('upsertMetadata', {
        filePath,
        duration: 100,
        size: 500,
        rating: 0,
      });

      // Partial Update 1
      await sendMessage('upsertMetadata', { filePath, duration: 200 });
      let res = await sendMessage('getMetadata', { filePaths: [filePath] });
      let meta = (res.data as any)[filePath];
      expect(meta.duration).toBe(200);
      expect(meta.size).toBe(500);

      // Partial Update 2
      await sendMessage('upsertMetadata', { filePath, rating: 4 });
      res = await sendMessage('getMetadata', { filePaths: [filePath] });
      meta = (res.data as any)[filePath];
      expect(meta.rating).toBe(4);
      expect(meta.duration).toBe(200);
    });

    it('should execute smart playlist criteria', async () => {
      const result = await sendMessage('executeSmartPlaylist', {
        criteria: '{}',
      });
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should return error for invalid upsert payload', async () => {
      const result = await sendMessage('upsertMetadata', { duration: 120 }); // Missing filePath
      expect(result.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should return error for unknown message type', async () => {
      const result = await sendMessage('unknownType', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown message type');
    });

    it('should catch top-level errors in message processing', async () => {
      // Trigger a TypeError by sending null payload for a handler that expects it
      const result = await sendMessage('recordMediaView', null);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    const operations = [
      { type: 'recordMediaView', payload: { filePath: '/test.png' } },
      { type: 'getMediaViewCounts', payload: { filePaths: [] } },
      { type: 'cacheAlbums', payload: { cacheKey: 'key', albums: [] } },
      { type: 'getCachedAlbums', payload: { cacheKey: 'key' } },
      {
        type: 'addMediaDirectory',
        payload: { directoryObj: { path: '/test' } },
      },
      { type: 'getMediaDirectories', payload: {} },
      { type: 'removeMediaDirectory', payload: { directoryPath: '/test' } },
      {
        type: 'setDirectoryActiveState',
        payload: { directoryPath: '/test', isActive: true },
      },
      { type: 'upsertMetadata', payload: { filePath: '/t' } },
      { type: 'setRating', payload: { filePath: '/t', rating: 5 } },
      { type: 'getMetadata', payload: { filePaths: [] } },
      { type: 'createSmartPlaylist', payload: { name: 'n', criteria: '' } },
      { type: 'getSmartPlaylists', payload: {} },
      { type: 'deleteSmartPlaylist', payload: { id: 1 } },
      {
        type: 'updateSmartPlaylist',
        payload: { id: 1, name: 'n', criteria: '' },
      },
      { type: 'executeSmartPlaylist', payload: {} },
    ];

    it.each(operations)(
      '$type should fail if database is not initialized',
      async ({ type, payload }) => {
        const result = await sendMessage(type, payload);
        expect(result.success).toBe(false);
        expect(result.error).toBe('Database not initialized');
      },
    );

    it.each(operations)(
      '$type should fail after database is closed',
      async ({ type, payload }) => {
        await sendMessage('init', { dbPath });
        await sendMessage('close', {});
        const result = await sendMessage(type, payload);
        expect(result.success).toBe(false);
        expect(result.error).toBe('Database not initialized');
      },
    );
  });
});
