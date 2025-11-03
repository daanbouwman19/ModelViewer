/**
 * Direct unit tests for database-worker functions
 * These tests import and test the functions directly to ensure proper coverage
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import * as dbFunctions from '../../src/main/database-worker-functions.js';

describe('Database Worker Functions', () => {
  let db;
  let dbPath;
  let tempDir;

  beforeEach(async () => {
    // Create temporary database file
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'function-test-'));
    dbPath = path.join(tempDir, 'test.sqlite');

    // Initialize database
    const result = await dbFunctions.initDatabase(
      sqlite3.Database,
      dbPath,
      null,
    );
    expect(result.success).toBe(true);
    db = result.db;
  });

  afterEach(async () => {
    if (db) {
      await dbFunctions.closeDatabase(db);
      db = null;
    }

    // Clean up database file
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('generateFileId', () => {
    it('should generate consistent MD5 hash for the same file', () => {
      const filePath = path.join(tempDir, 'file.png');
      fs.writeFileSync(filePath, 'some data');

      const hash1 = dbFunctions.generateFileId(filePath);
      const hash2 = dbFunctions.generateFileId(filePath);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(32);
    });

    it('should generate different hashes for different files', () => {
      const path1 = path.join(tempDir, 'file1.png');
      const path2 = path.join(tempDir, 'file2.png');

      fs.writeFileSync(path1, 'file content 1'); // Different content
      fs.writeFileSync(path2, 'file content 22'); // Different content and size

      const hash1 = dbFunctions.generateFileId(path1);
      const hash2 = dbFunctions.generateFileId(path2);

      expect(hash1).not.toBe(hash2);
    });

    it('should generate the same hash for the same file even if renamed', () => {
      const content = 'this is the same file';
      const path1 = path.join(tempDir, 'file.png');
      const path2 = path.join(tempDir, 'renamed-file.png');

      fs.writeFileSync(path1, content);

      const hash1 = dbFunctions.generateFileId(path1);
      fs.renameSync(path1, path2);
      const hash2 = dbFunctions.generateFileId(path2);

      expect(hash1).toBe(hash2);
    });

    it('should fall back to path hashing for non-existent files', () => {
      const filePath = '/non/existent/file.png';
      const hash = dbFunctions.generateFileId(filePath);
      const expectedHash = crypto
        .createHash('md5')
        .update(filePath)
        .digest('hex');
      expect(hash).toBe(expectedHash);
    });

    it('should fall back to path hashing for empty strings', () => {
      const hash = dbFunctions.generateFileId('');
      const expectedHash = crypto.createHash('md5').update('').digest('hex');
      expect(hash).toBe(expectedHash);
    });
  });

  describe('initDatabase', () => {
    it('should create all required tables', async () => {
      // Tables created in beforeEach, verify they exist by querying them
      const viewsResult = await dbFunctions.getMediaViewCounts(db, [
        '/test.png',
      ]);
      expect(viewsResult.success).toBe(true);

      const dirsResult = await dbFunctions.getMediaDirectories(db);
      expect(dirsResult.success).toBe(true);

      const cacheResult = await dbFunctions.getCachedModels(db, 'test');
      expect(cacheResult.success).toBe(true);
    });

    it('should handle re-initialization with existing db', async () => {
      const newDbPath = path.join(tempDir, 'test2.sqlite');

      const result = await dbFunctions.initDatabase(
        sqlite3.Database,
        newDbPath,
        db,
      );

      expect(result.success).toBe(true);
      expect(result.db).toBeDefined();

      // Update our reference and close it before cleanup
      db = result.db;
      await dbFunctions.closeDatabase(db);
    });

    it('should return error if database constructor fails', async () => {
      class MockDatabase {
        constructor(path, callback) {
          // This is how sqlite3 constructor can fail, by throwing.
          throw new Error('Failed to open');
        }
      }

      const result = await dbFunctions.initDatabase(MockDatabase, 'anypath');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to open');
      expect(result.db).toBeNull();
    });
  });

  describe('recordMediaView', () => {
    it('should record a new media view', async () => {
      const filePath = path.join(tempDir, 'image.png');
      fs.writeFileSync(filePath, 'image data');
      const result = await dbFunctions.recordMediaView(db, filePath);

      expect(result.success).toBe(true);

      const viewCounts = await dbFunctions.getMediaViewCounts(db, [filePath]);
      expect(viewCounts.data[filePath]).toBe(1);
    });

    it('should increment view count on multiple views', async () => {
      const filePath = path.join(tempDir, 'video.mp4');
      fs.writeFileSync(filePath, 'video data');

      await dbFunctions.recordMediaView(db, filePath);
      await dbFunctions.recordMediaView(db, filePath);
      await dbFunctions.recordMediaView(db, filePath);

      const viewCounts = await dbFunctions.getMediaViewCounts(db, [filePath]);
      expect(viewCounts.data[filePath]).toBe(3);
    });

    it('should handle null database', async () => {
      const result = await dbFunctions.recordMediaView(null, '/test.png');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database not initialized');
    });

    it('should handle special characters in file paths', async () => {
      const filePath = path.join(tempDir, 'file with spaces & special!.png');
      fs.writeFileSync(filePath, 'special data');
      const result = await dbFunctions.recordMediaView(db, filePath);

      expect(result.success).toBe(true);
    });
  });

  describe('getMediaViewCounts', () => {
    it('should return zero for files with no views', async () => {
      const filePath = path.join(tempDir, 'never-viewed.png');
      fs.writeFileSync(filePath, 'never viewed');

      const result = await dbFunctions.getMediaViewCounts(db, [filePath]);

      expect(result.success).toBe(true);
      expect(result.data[filePath]).toBe(0);
    });

    it('should return correct counts for multiple files', async () => {
      const files = [
        path.join(tempDir, 'a.png'),
        path.join(tempDir, 'b.jpg'),
        path.join(tempDir, 'c.mp4'),
      ];

      // Use different content to ensure different file IDs
      fs.writeFileSync(files[0], 'test data a');
      fs.writeFileSync(files[1], 'test data bb');
      fs.writeFileSync(files[2], 'test data ccc');

      await dbFunctions.recordMediaView(db, files[0]);
      await dbFunctions.recordMediaView(db, files[1]);
      await dbFunctions.recordMediaView(db, files[1]);

      const result = await dbFunctions.getMediaViewCounts(db, files);

      expect(result.data[files[0]]).toBe(1);
      expect(result.data[files[1]]).toBe(2);
      expect(result.data[files[2]]).toBe(0);
    });

    it('should handle empty array', async () => {
      const result = await dbFunctions.getMediaViewCounts(db, []);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it('should handle null database', async () => {
      const result = await dbFunctions.getMediaViewCounts(null, ['/test.png']);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it('should handle undefined filePaths', async () => {
      const result = await dbFunctions.getMediaViewCounts(db, undefined);

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

      const result = await dbFunctions.cacheModels(db, 'test_cache', models);

      expect(result.success).toBe(true);
    });

    it('should handle empty models array', async () => {
      const result = await dbFunctions.cacheModels(db, 'empty_cache', []);

      expect(result.success).toBe(true);
    });

    it('should overwrite existing cache', async () => {
      const models1 = [{ name: 'model1' }];
      const models2 = [{ name: 'model2' }];

      await dbFunctions.cacheModels(db, 'same_key', models1);
      await dbFunctions.cacheModels(db, 'same_key', models2);

      const result = await dbFunctions.getCachedModels(db, 'same_key');

      expect(result.data[0].name).toBe('model2');
    });

    it('should handle null database', async () => {
      const result = await dbFunctions.cacheModels(null, 'key', []);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database not initialized');
    });

    it('should handle complex model structures', async () => {
      const models = [
        {
          name: 'complex',
          textures: [
            { name: 'tex1.png', path: '/a/tex1.png', viewCount: 5 },
            { name: 'tex2.jpg', path: '/b/tex2.jpg', viewCount: 10 },
          ],
          metadata: { created: '2024-01-01', tags: ['test', 'model'] },
        },
      ];

      const result = await dbFunctions.cacheModels(db, 'complex', models);
      expect(result.success).toBe(true);

      const retrieved = await dbFunctions.getCachedModels(db, 'complex');
      expect(retrieved.data[0]).toEqual(models[0]);
    });
  });

  describe('getCachedModels', () => {
    it('should return null for non-existent cache', async () => {
      const result = await dbFunctions.getCachedModels(db, 'non_existent');

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should retrieve cached models', async () => {
      const models = [{ name: 'cached' }];

      await dbFunctions.cacheModels(db, 'retrieve_test', models);
      const result = await dbFunctions.getCachedModels(db, 'retrieve_test');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('cached');
    });

    it('should handle null database', async () => {
      const result = await dbFunctions.getCachedModels(null, 'key');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database not initialized');
    });
  });

  describe('addMediaDirectory', () => {
    it('should add a media directory', async () => {
      const result = await dbFunctions.addMediaDirectory(db, '/test/media');

      expect(result.success).toBe(true);
    });

    it('should not duplicate directories', async () => {
      const dirPath = '/test/same-dir';

      await dbFunctions.addMediaDirectory(db, dirPath);
      await dbFunctions.addMediaDirectory(db, dirPath);

      const result = await dbFunctions.getMediaDirectories(db);
      const dirs = result.data.filter((d) => d.path === dirPath);
      expect(dirs).toHaveLength(1);
    });

    it('should re-activate deactivated directories', async () => {
      const dirPath = '/test/reactivate';

      await dbFunctions.addMediaDirectory(db, dirPath);
      await dbFunctions.setDirectoryActiveState(db, dirPath, false);

      let dirs = await dbFunctions.getMediaDirectories(db);
      let dir = dirs.data.find((d) => d.path === dirPath);
      expect(dir.isActive).toBe(false);

      await dbFunctions.addMediaDirectory(db, dirPath);

      dirs = await dbFunctions.getMediaDirectories(db);
      dir = dirs.data.find((d) => d.path === dirPath);
      expect(dir.isActive).toBe(true);
    });

    it('should handle null database', async () => {
      const result = await dbFunctions.addMediaDirectory(null, '/test');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database not initialized');
    });
  });

  describe('getMediaDirectories', () => {
    it('should return empty array when no directories', async () => {
      const result = await dbFunctions.getMediaDirectories(db);

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('should return all media directories', async () => {
      await dbFunctions.addMediaDirectory(db, '/test/dir1');
      await dbFunctions.addMediaDirectory(db, '/test/dir2');
      await dbFunctions.addMediaDirectory(db, '/test/dir3');

      const result = await dbFunctions.getMediaDirectories(db);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
    });

    it('should include isActive status', async () => {
      await dbFunctions.addMediaDirectory(db, '/test/dir');

      const result = await dbFunctions.getMediaDirectories(db);

      expect(result.data[0]).toHaveProperty('path');
      expect(result.data[0]).toHaveProperty('isActive');
      expect(result.data[0].isActive).toBe(true);
    });

    it('should handle null database', async () => {
      const result = await dbFunctions.getMediaDirectories(null);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database not initialized');
    });
  });

  describe('removeMediaDirectory', () => {
    it('should remove a media directory', async () => {
      const dirPath = '/test/to-remove';

      await dbFunctions.addMediaDirectory(db, dirPath);
      const result = await dbFunctions.removeMediaDirectory(db, dirPath);

      expect(result.success).toBe(true);

      const dirs = await dbFunctions.getMediaDirectories(db);
      expect(dirs.data.some((d) => d.path === dirPath)).toBe(false);
    });

    it('should not error when removing non-existent directory', async () => {
      const result = await dbFunctions.removeMediaDirectory(db, '/nonexistent');

      expect(result.success).toBe(true);
    });

    it('should handle null database', async () => {
      const result = await dbFunctions.removeMediaDirectory(null, '/test');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database not initialized');
    });
  });

  describe('setDirectoryActiveState', () => {
    it('should set directory to inactive', async () => {
      const dirPath = '/test/toggle';

      await dbFunctions.addMediaDirectory(db, dirPath);
      const result = await dbFunctions.setDirectoryActiveState(
        db,
        dirPath,
        false,
      );

      expect(result.success).toBe(true);

      const dirs = await dbFunctions.getMediaDirectories(db);
      const dir = dirs.data.find((d) => d.path === dirPath);
      expect(dir.isActive).toBe(false);
    });

    it('should set directory to active', async () => {
      const dirPath = '/test/toggle2';

      await dbFunctions.addMediaDirectory(db, dirPath);
      await dbFunctions.setDirectoryActiveState(db, dirPath, false);
      await dbFunctions.setDirectoryActiveState(db, dirPath, true);

      const dirs = await dbFunctions.getMediaDirectories(db);
      const dir = dirs.data.find((d) => d.path === dirPath);
      expect(dir.isActive).toBe(true);
    });

    it('should handle null database', async () => {
      const result = await dbFunctions.setDirectoryActiveState(
        null,
        '/test',
        true,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database not initialized');
    });
  });

  describe('closeDatabase', () => {
    it('should close database successfully', async () => {
      const result = await dbFunctions.closeDatabase(db);

      expect(result.success).toBe(true);
      db = null; // Prevent double-close in afterEach
    });

    it('should handle closing null database', async () => {
      const result = await dbFunctions.closeDatabase(null);

      expect(result.success).toBe(true);
    });

    it('should handle error when closing', async () => {
      const mockDb = {
        close: vi.fn((callback) => {
          callback(new Error('Close failed'));
        }),
      };
      const result = await dbFunctions.closeDatabase(mockDb);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Close failed');
    });
  });

  describe('dbRun', () => {
    it('should execute SQL statements', async () => {
      await dbFunctions.dbRun(
        db,
        'CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY)',
      );

      // If no error thrown, the table was created
      expect(true).toBe(true);
    });

    it('should handle parameters', async () => {
      await dbFunctions.dbRun(
        db,
        'CREATE TABLE IF NOT EXISTS test_params (name TEXT)',
      );
      await dbFunctions.dbRun(db, 'INSERT INTO test_params (name) VALUES (?)', [
        'test_name',
      ]);

      const rows = await dbFunctions.dbAll(db, 'SELECT name FROM test_params');
      expect(rows[0].name).toBe('test_name');
    });

    it('should reject with an error for invalid SQL', async () => {
      await expect(dbFunctions.dbRun(db, 'INVALID SQL')).rejects.toThrow();
    });
  });

  describe('dbAll', () => {
    it('should retrieve all rows', async () => {
      await dbFunctions.dbRun(
        db,
        'CREATE TABLE IF NOT EXISTS test_all (value INTEGER)',
      );
      await dbFunctions.dbRun(db, 'INSERT INTO test_all VALUES (1), (2), (3)');

      const rows = await dbFunctions.dbAll(db, 'SELECT value FROM test_all');
      expect(rows).toHaveLength(3);
    });

    it('should return empty array for no results', async () => {
      const rows = await dbFunctions.dbAll(
        db,
        'SELECT * FROM media_views WHERE 1=0',
      );
      expect(rows).toHaveLength(0);
    });

    it('should reject with an error for invalid SQL', async () => {
      await expect(dbFunctions.dbAll(db, 'INVALID SQL')).rejects.toThrow();
    });
  });

  describe('dbGet', () => {
    it('should retrieve a single row', async () => {
      await dbFunctions.addMediaDirectory(db, '/test/single');

      const row = await dbFunctions.dbGet(
        db,
        'SELECT path FROM media_directories WHERE path = ?',
        ['/test/single'],
      );

      expect(row).toBeDefined();
      expect(row.path).toBe('/test/single');
    });

    it('should return undefined for no results', async () => {
      const row = await dbFunctions.dbGet(
        db,
        'SELECT * FROM media_views WHERE file_path = ?',
        ['nonexistent'],
      );

      expect(row).toBeUndefined();
    });

    it('should reject with an error for invalid SQL', async () => {
      await expect(dbFunctions.dbGet(db, 'INVALID SQL')).rejects.toThrow();
    });
  });

  describe('Error handling with a closed database', () => {
    beforeEach(async () => {
      // Directly close the database connection to trigger errors
      await dbFunctions.dbClose(db);
    });

    const testCases = [
      { funcName: 'recordMediaView', args: ['/test.png'] },
      { funcName: 'getMediaViewCounts', args: [['/test.png']] },
      { funcName: 'cacheModels', args: ['key', []] },
      { funcName: 'getCachedModels', args: ['key'] },
      { funcName: 'addMediaDirectory', args: ['/test'] },
      { funcName: 'getMediaDirectories', args: [] },
      { funcName: 'removeMediaDirectory', args: ['/test'] },
      { funcName: 'setDirectoryActiveState', args: ['/test', true] },
    ];

    it.each(testCases)('$funcName should fail', async ({ funcName, args }) => {
      const result = await dbFunctions[funcName](db, ...args);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
