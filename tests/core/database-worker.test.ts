import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { parentPort } from 'worker_threads';
import Database from 'better-sqlite3';

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

  const safeCleanup = async () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };

  beforeEach(async () => {
    const testDir = path.join(process.cwd(), 'tests', 'temp');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    tempDir = fs.mkdtempSync(path.join(testDir, 'test-db-'));
    // Use in-memory DB by default for speed
    dbPath = ':memory:';

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

    await safeCleanup();
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
      // For re-init test, we can use another in-memory DB or a file.
      // Since it tests changing path, we can use a new path (memory or file).
      // Let's use file to be distinct.
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
      // Migration test requires persistent file to setup old schema first
      const migrationDbPath = path.join(tempDir, 'migration_old_schema.sqlite');

      // 1. Setup old schema manually
      const tempDb = new Database(migrationDbPath);
      tempDb
        .prepare(
          `
        CREATE TABLE media_directories (
          path TEXT UNIQUE,
          is_active INTEGER DEFAULT 1
        )
      `,
        )
        .run();
      tempDb
        .prepare(
          'INSERT INTO media_directories (path, is_active) VALUES (?, ?)',
        )
        .run('/old/path', 1);
      tempDb.close();

      // 2. Initialize via worker (triggers migration)
      const result = await sendMessage('init', { dbPath: migrationDbPath });
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

    it('should NOT call fs.stat during getMediaViewCounts (Optimization Verification)', async () => {
      const filePath = path.join(tempDir, 'opt-test.jpg');
      fs.writeFileSync(filePath, 'data');
      await sendMessage('recordMediaView', { filePath });

      const statSpy = vi.spyOn(fs.promises, 'stat');
      const result = await sendMessage('getMediaViewCounts', {
        filePaths: [filePath],
      });

      expect(result.success).toBe(true);
      expect((result.data as any)[filePath]).toBe(1);
      expect(statSpy).not.toHaveBeenCalled();
    });

    it('should NOT call fs.stat during recordMediaView if file is already in DB (Optimization)', async () => {
      const filePath = path.join(tempDir, 'opt-record-test.jpg');
      fs.writeFileSync(filePath, 'data');

      // First call - should call fs.stat (and insert into DB)
      const res1 = await sendMessage('recordMediaView', { filePath });
      expect(res1.success).toBe(true);

      // Verify DB has the record
      const counts = await sendMessage('getMediaViewCounts', {
        filePaths: [filePath],
      });
      expect((counts.data as any)[filePath]).toBe(1);

      // Remove the file to prove we don't touch it again
      fs.unlinkSync(filePath);

      // Second call - should SUCCEED using cached ID from DB, avoiding fs.stat (which would fail)
      const res2 = await sendMessage('recordMediaView', { filePath });
      expect(res2.success).toBe(true);

      // Verify count incremented
      const counts2 = await sendMessage('getMediaViewCounts', {
        filePaths: [filePath],
      });
      expect((counts2.data as any)[filePath]).toBe(2);
    });

    it('should update file path in DB when file is renamed and played', async () => {
      const oldPath = path.join(tempDir, 'old.jpg');
      const newPath = path.join(tempDir, 'new.jpg');
      fs.writeFileSync(oldPath, 'content');

      // 1. Play at old path
      await sendMessage('recordMediaView', { filePath: oldPath });
      let counts = await sendMessage('getMediaViewCounts', {
        filePaths: [oldPath],
      });
      expect((counts.data as any)[oldPath]).toBe(1);

      // 2. Rename file (simulate OS rename)
      fs.renameSync(oldPath, newPath);

      // 3. Play at new path
      // This should update the DB entry for the file ID to point to newPath
      await sendMessage('recordMediaView', { filePath: newPath });

      // 4. Verify lookup by new path works
      counts = await sendMessage('getMediaViewCounts', {
        filePaths: [newPath],
      });
      expect((counts.data as any)[newPath]).toBe(2); // Count should transfer and increment
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

    it('should add a media directory (string path)', async () => {
      const result = await sendMessage('addMediaDirectory', {
        directoryObj: { path: '/test/directory' },
      });
      expect(result.success).toBe(true);
    });

    it('should add a media directory (object payload)', async () => {
      const result = await sendMessage('addMediaDirectory', {
        directoryObj: {
          path: '/test/obj-dir',
          name: 'Custom Name',
        },
      });
      expect(result.success).toBe(true);

      const listRes = await sendMessage('getMediaDirectories', {});
      const dir = (listRes.data as Directory[]).find(
        (d) => d.path === '/test/obj-dir',
      );
      expect(dir).toBeDefined();
      expect(dir!.name).toBe('Custom Name');
    });

    it('should get media directories', async () => {
      await sendMessage('addMediaDirectory', {
        directoryObj: { path: '/test/directory' },
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

    it('should remove a media directory', async () => {
      await sendMessage('addMediaDirectory', {
        directoryObj: { path: '/test/directory' },
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
        directoryObj: { path: dirPath },
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

    it('should add a media directory with explicit ID and type', async () => {
      const id = 'custom-id';
      const type = 'google_drive';
      const result = await sendMessage('addMediaDirectory', {
        directoryObj: { path: '/drive/path', id, type },
      });
      expect(result.success).toBe(true);
      const listRes = await sendMessage('getMediaDirectories', {});
      const dir = (listRes.data as Directory[]).find((d) => d.id === id);
      expect(dir).toBeDefined();
      expect(dir!.type).toBe(type);
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

    it('should handle getAllMetadataStats message and return only stats', async () => {
      const filePath = path.join(tempDir, 'stats.mp4');
      fs.writeFileSync(filePath, 'dummy');
      // Insert full metadata
      await sendMessage('upsertMetadata', {
        filePath,
        duration: 100,
        size: 5000,
        rating: 3,
        status: 'success',
        watchedSegments: '[]',
      });

      const result = await sendMessage('getAllMetadataStats', {});
      expect(result.success).toBe(true);
      const data = result.data as Record<string, any>;
      const item = data[filePath];

      expect(item).toBeDefined();
      expect(item.duration).toBe(100);
      expect(item.rating).toBe(3);

      // Verify heavy fields are NOT returned
      expect(item.size).toBeUndefined();
      expect(item.watchedSegments).toBeUndefined();
      expect(item.status).toBeUndefined();
    });

    it('should handle executeSmartPlaylist message', async () => {
      const result = await sendMessage('executeSmartPlaylist', {
        criteria: '{}',
      });
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should handle bulkUpsertMetadata', async () => {
      const filePath = path.join(tempDir, 'bulk.mp4');
      fs.writeFileSync(filePath, 'bulk data');
      const result = await sendMessage('bulkUpsertMetadata', [
        { filePath, duration: 300 },
      ]);
      expect(result.success).toBe(true);

      const getRes = await sendMessage('getMetadata', {
        filePaths: [filePath],
      });
      expect((getRes.data as any)[filePath].duration).toBe(300);
    });

    it('should not insert any data if ID generation fails for one item (atomic preparation)', async () => {
      const filePath = path.join(tempDir, 'rollback.mp4');
      fs.writeFileSync(filePath, 'rollback data');

      // This fails during generateFileId (Promise.all), so the transaction never starts.
      // It still demonstrates atomic preparation: if one ID fails, no transaction is executed.
      const result = await sendMessage('bulkUpsertMetadata', [
        { filePath, duration: 100 },
        { filePath: undefined as any, duration: 200 },
      ]);
      expect(result.success).toBe(false);

      // Verify first item was NOT saved
      const getRes = await sendMessage('getMetadata', {
        filePaths: [filePath],
      });
      expect((getRes.data as any)[filePath]).toBeUndefined();
    });

    it('should handle migrations for media_metadata missing columns', async () => {
      // This test requires file persistence because it creates a DB with old schema on disk,
      // closes it, and then expects the worker to open it and migrate it.
      const migDbPath = path.join(
        tempDir,
        `mig-test-${Math.random().toString(36).substring(7)}.sqlite`,
      );

      // Setup DB without the new columns
      const tempDb = new Database(migDbPath);
      tempDb
        .prepare(
          `
        CREATE TABLE media_metadata (
          file_path_hash TEXT PRIMARY KEY,
          duration REAL
        )
      `,
        )
        .run();
      tempDb.close();

      const result = await sendMessage('init', { dbPath: migDbPath });
      expect(result.success, `Init failed: ${result.error}`).toBe(true);

      // Verify columns added
      const filePath = path.join(tempDir, 'migrated.mp4');
      fs.writeFileSync(filePath, 'migrated');
      await sendMessage('upsertMetadata', {
        filePath,
        status: 'completed',
        size: 1024,
      });

      const getRes = await sendMessage('getMetadata', {
        filePaths: [filePath],
      });
      const meta = (getRes.data as any)[filePath];
      expect(meta.status).toBe('completed');
      expect(meta.size).toBe(1024);
    });
  });

  describe('Smart playlists, settings, and pending metadata', () => {
    beforeEach(async () => {
      await sendMessage('init', { dbPath });
    });

    it('should create, update, list, and delete smart playlists', async () => {
      const createResult = await sendMessage('createSmartPlaylist', {
        name: 'My Playlist',
        criteria: '{"rating":5}',
      });
      expect(createResult.success).toBe(true);
      const createdId = (createResult.data as { id: number }).id;
      expect(createdId).toBeDefined();

      const listResult = await sendMessage('getSmartPlaylists', {});
      expect(listResult.success).toBe(true);
      const playlists = listResult.data as Array<{ id: number; name: string }>;
      expect(playlists.length).toBeGreaterThan(0);

      const updateResult = await sendMessage('updateSmartPlaylist', {
        id: createdId,
        name: 'Updated Playlist',
        criteria: '{"rating":4}',
      });
      expect(updateResult.success).toBe(true);

      const deleteResult = await sendMessage('deleteSmartPlaylist', {
        id: createdId,
      });
      expect(deleteResult.success).toBe(true);
    });

    it('should save and retrieve settings', async () => {
      const saveResult = await sendMessage('saveSetting', {
        key: 'theme',
        value: 'dark',
      });
      expect(saveResult.success).toBe(true);

      const getResult = await sendMessage('getSetting', { key: 'theme' });
      expect(getResult.success).toBe(true);
      expect(getResult.data).toBe('dark');

      const missingResult = await sendMessage('getSetting', {
        key: 'missing-key',
      });
      expect(missingResult.success).toBe(true);
      expect(missingResult.data).toBeNull();
    });

    it('should return recently played items', async () => {
      const filePath = path.join(tempDir, 'recent.mp4');
      fs.writeFileSync(filePath, 'recent data');

      await sendMessage('recordMediaView', { filePath });

      const recentResult = await sendMessage('getRecentlyPlayed', { limit: 5 });
      expect(recentResult.success).toBe(true);
      const rows = recentResult.data as Array<{ file_path: string }>;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].file_path).toBe(filePath);
    });

    it('should return pending metadata file paths', async () => {
      const filePath = path.join(tempDir, 'pending.mp4');
      fs.writeFileSync(filePath, 'pending');

      await sendMessage('upsertMetadata', { filePath });

      const pendingResult = await sendMessage('getPendingMetadata', {});
      expect(pendingResult.success).toBe(true);
      const pending = pendingResult.data as string[];
      expect(pending).toContain(filePath);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await sendMessage('init', { dbPath });
    });

    it('generateFileId handles filesystem errors other than ENOENT', async () => {
      // Create a directory where the file should be, making stat return an error (or similar)
      const folderPath = path.join(tempDir, 'not-a-file');
      fs.mkdirSync(folderPath);

      // recordMediaView on a directory might work or fail depending on OS,
      // but we want to hit the console.error line in database-worker.ts line 45-50.
      const result = await sendMessage('recordMediaView', {
        filePath: folderPath,
      });
      expect(result.success).toBe(true);
    });

    it('getMetadata with empty array', async () => {
      const result = await sendMessage('getMetadata', { filePaths: [] });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it('getMediaViewCounts with empty/null array', async () => {
      const result1 = await sendMessage('getMediaViewCounts', {
        filePaths: [],
      });
      expect(result1.success).toBe(true);

      const result2 = await sendMessage('getMediaViewCounts', {
        filePaths: null,
      });
      expect(result2.success).toBe(true);
    });

    it('addMediaDirectory with defaults', async () => {
      const result = await sendMessage('addMediaDirectory', {
        directoryObj: { path: '/default/test' },
      });
      expect(result.success).toBe(true);

      const listRes = await sendMessage('getMediaDirectories', {});
      const dir = (listRes.data as any[]).find(
        (d) => d.path === '/default/test',
      );
      expect(dir.id).toBeDefined();
      expect(dir.name).toBe('test');
    });

    it('cacheAlbums error handling', async () => {
      // Force error by closing DB then calling cacheAlbums
      await sendMessage('close', {});
      const result = await sendMessage('cacheAlbums', {
        cacheKey: 'k',
        albums: {},
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Database not initialized');
    });

    it('should handle getPendingMetadata', async () => {
      await sendMessage('init', { dbPath });
      const filePath = path.join(tempDir, 'pending.mp4');
      fs.writeFileSync(filePath, 'pending');

      // Insert with pending status
      await sendMessage('upsertMetadata', {
        filePath,
        status: 'pending',
      });

      const result = await sendMessage('getPendingMetadata', {});
      expect(result.success).toBe(true);
      expect(result.data).toContain(filePath);
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

      it.each(testCases)(
        '$type should fail gracefully',
        async ({ type, payload }: { type: string; payload: unknown }) => {
          const result = await sendMessage(type, payload);
          expect(result.success).toBe(false);
          expect(result.error).toBe('Database not initialized');
        },
      );
    });

    it('getPendingMetadata should return DB not ready before init', async () => {
      const result = await sendMessage('getPendingMetadata', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('DB not ready');
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
        {
          type: 'addMediaDirectory',
          payload: { directoryObj: { path: '/test' } },
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

    it('should catch top-level errors in message processing', async () => {
      // Trigger a TypeError by sending missing payload for a handler that expects it
      // 'recordMediaView' accesses payload.filePath immediately
      const result = await sendMessage('recordMediaView', null);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
