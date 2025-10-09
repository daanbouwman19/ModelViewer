/**
 * @file Unit tests for the database management module (`database.js`).
 * These tests use a manual mock for `better-sqlite3` to ensure that the
 * database logic can be tested in isolation without any dependency on the
 * native module or the file system. The tests cover initialization,
 * data recording, data retrieval, and caching logic.
 */
const path = require('path');
const fs = require('fs');

const mockTestUserDataPathForTests = path.join(__dirname, 'test_user_data_tdt');

jest.mock('electron', () => {
  const pathModule = require('path');
  const appPath = mockTestUserDataPathForTests;
  return {
    app: {
      getPath: jest.fn((name) => {
        if (name === 'userData') {
          return appPath;
        }
        return pathModule.join(appPath, name);
      }),
    },
  };
});

let database;
let Database; // To hold the mock constructor

describe('database.js', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });

  beforeEach(() => {
    jest.resetModules(); // Reset modules to get a fresh mock instance.
    Database = require('better-sqlite3'); // Require the mock *after* reset.
    Database.__resetStore(); // Reset the mock's internal state.

    database = require('../main/database.js'); // Require the module under test.
    database.initDatabase(); // Initialize with the mocked dependencies.
  });

  afterEach(() => {
    database.closeDatabase();
  });

  describe('initDatabase and getDb', () => {
    it('should initialize the database and create tables', () => {
      const db = database.getDb();
      expect(db).not.toBeNull();
      expect(db.open).toBe(true);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all();
      expect(tables.map((t) => t.name)).toEqual(
        expect.arrayContaining(['media_views', 'app_cache']),
      );
    });

    it('should return the same db instance if getDb is called multiple times without closing', () => {
      const db1 = database.getDb();
      const db2 = database.getDb();
      expect(db1).toBe(db2); // Should be the exact same instance
    });

    it('should re-initialize and return a new instance if db is closed and getDb is called', () => {
      const dbInstance = database.getDb();
      expect(dbInstance.open).toBe(true);
      database.closeDatabase(); // Properly close via the module's function
      expect(dbInstance.open).toBe(false); // Verify it's closed

      const newDbInstance = database.getDb(); // Should trigger re-initialization
      expect(newDbInstance).toBeDefined();
      expect(newDbInstance.open).toBe(true);
      expect(newDbInstance).not.toBe(dbInstance); // Should be a new instance
    });

    it('initDatabase should close an existing connection before re-initializing', () => {
      const db1 = database.getDb();
      jest.spyOn(db1, 'close');
      database.initDatabase(); // Re-initialize
      expect(db1.close).toHaveBeenCalled();
      const db2 = database.getDb();
      expect(db2).not.toBe(db1);
      expect(db2.open).toBe(true);
    });

    it('initDatabase should handle failure when closing an existing connection', () => {
      const db1 = database.getDb();
      const closeError = new Error('Failed to close');
      jest.spyOn(db1, 'close').mockImplementation(() => {
        throw closeError;
      });
      console.error = jest.fn(); // Mock console.error to check for logging

      // Re-initializing should still proceed and create a new valid connection
      const newDb = database.initDatabase();
      expect(db1.close).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        '[database.js] Error closing existing DB connection:',
        closeError,
      );
      expect(newDb).not.toBe(db1);
      expect(newDb.open).toBe(true);
    });

    it('should throw if database creation fails', () => {
      database.closeDatabase();
      const constructorError = new Error('Constructor failed');
      Database.__setNextConstructorError(constructorError);
      expect(() => database.initDatabase()).toThrow(constructorError);
    });

    it('should throw if creating tables fails', () => {
      database.closeDatabase();
      const execError = new Error('Table creation failed');
      Database.__setNextExecError(execError);
      expect(() => database.initDatabase()).toThrow(execError);
    });

    it('getDb should return null if initialization fails critically (simulated)', () => {
      // Simulate app.getPath throwing an error
      const electron = require('electron');
      const originalGetPath = electron.app.getPath;
      electron.app.getPath = jest.fn(() => {
        throw new Error('Disk full');
      });

      database.closeDatabase(); // Ensure db is not initialized

      // Temporarily modify initDatabase to not re-throw for this specific test,
      // or ensure getDb handles the throw from initDatabase gracefully.
      // For simplicity, we'll rely on getDb's internal try-catch for initDatabase.
      const db = database.getDb();
      expect(db).toBeNull();

      electron.app.getPath = originalGetPath; // Restore original function
    });
  });

  describe('generateFileId', () => {
    it('should generate a consistent, non-empty MD5 hash for a file path', () => {
      const filePath = '/test/path/to/file.mp4';
      const fileId1 = database.generateFileId(filePath);
      const fileId2 = database.generateFileId(filePath);
      expect(fileId1).toBe(fileId2);
      expect(fileId1).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe('recordMediaView and getMediaViewCounts', () => {
    it('should record a new media view for a file not previously viewed', async () => {
      const filePath = '/test/new_file.mp4';
      await database.recordMediaView(filePath);
      const counts = await database.getMediaViewCounts([filePath]);
      expect(counts[filePath]).toBe(1);
    });

    it('should increment view count for an existing file', async () => {
      const filePath = '/test/existing_file.mov';
      await database.recordMediaView(filePath); // First view
      await database.recordMediaView(filePath); // Second view
      const counts = await database.getMediaViewCounts([filePath]);
      expect(counts[filePath]).toBe(2);
    });

    it('should correctly return view counts for multiple files, including unviewed ones', async () => {
      const filePathViewedOnce = '/test/viewed_once.jpeg';
      const filePathViewedTwice = '/test/viewed_twice.gif';
      const filePathNeverViewed = '/test/never_viewed.png';

      await database.recordMediaView(filePathViewedOnce);
      await database.recordMediaView(filePathViewedTwice);
      await database.recordMediaView(filePathViewedTwice);

      const counts = await database.getMediaViewCounts([
        filePathViewedOnce,
        filePathViewedTwice,
        filePathNeverViewed,
      ]);
      expect(counts[filePathViewedOnce]).toBe(1);
      expect(counts[filePathViewedTwice]).toBe(2);
      expect(counts[filePathNeverViewed]).toBe(0);
    });

    it('getMediaViewCounts should return an empty object if an empty array is passed', async () => {
      const counts = await database.getMediaViewCounts([]);
      expect(counts).toEqual({});
    });

    it('getMediaViewCounts should return an empty object if db is not available', async () => {
      database.closeDatabase(); // Set internal db to null
      const electron = require('electron'); // Get the mocked electron
      const originalGetPath = electron.app.getPath;
      electron.app.getPath = jest.fn(() => {
        throw new Error('Simulated disk error for getMediaViewCounts');
      });

      const counts = await database.getMediaViewCounts(['/test/somefile.mp4']);
      expect(counts).toEqual({});

      electron.app.getPath = originalGetPath; // Restore
      // No need to call database.initDatabase() here, beforeEach will handle it for the next test
    });

    it('recordMediaView should not throw if db is not available', async () => {
      database.closeDatabase();
      const electron = require('electron');
      const originalGetPath = electron.app.getPath;
      electron.app.getPath = jest.fn(() => {
        throw new Error('Simulated disk error for recordMediaView');
      });

      const filePath = '/test/somefile.mp4';
      await expect(database.recordMediaView(filePath)).resolves.not.toThrow();

      electron.app.getPath = originalGetPath;
      // No need to call database.initDatabase() here, beforeEach will handle it
    });

    it('should handle error during recordMediaView transaction', async () => {
      const queryError = new Error('Transaction failed');
      Database.__setNextQueryError(queryError);
      console.error = jest.fn();

      await database.recordMediaView('/test/fail.mp4');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error recording view'),
        queryError,
      );
    });

    it('should handle error during getMediaViewCounts query', async () => {
      const queryError = new Error('Select failed');
      Database.__setNextQueryError(queryError);
      console.error = jest.fn();

      const counts = await database.getMediaViewCounts(['/test/file.mp4']);
      expect(counts).toEqual({});
      expect(console.error).toHaveBeenCalledWith(
        '[database.js] Error fetching view counts from SQLite:',
        queryError,
      );
    });

    it('getMediaViewCounts should return empty object for null or undefined filePaths', async () => {
      expect(await database.getMediaViewCounts(null)).toEqual({});
      expect(await database.getMediaViewCounts(undefined)).toEqual({});
    });
  });

  describe('cacheModels and getCachedModels', () => {
    it('should correctly cache and retrieve models', async () => {
      const models = [
        { id: 1, name: 'model1.obj' },
        { id: 2, name: 'model2.stl' },
      ];
      await database.cacheModels(models);
      const cachedModels = await database.getCachedModels();
      expect(cachedModels).toEqual(models);
    });

    it('getCachedModels should return null if no cache exists', async () => {
      const cachedModels = await database.getCachedModels();
      expect(cachedModels).toBeNull();
    });

    it('cacheModels should overwrite existing cache', async () => {
      const oldModels = [{ id: 1, name: 'old_model.obj' }];
      await database.cacheModels(oldModels); // Cache initial models
      const newModels = [{ id: 2, name: 'new_model.stl' }];
      await database.cacheModels(newModels); // Cache new, overwriting models
      const cachedModels = await database.getCachedModels();
      expect(cachedModels).toEqual(newModels); // Should retrieve the new models
    });

    it('getCachedModels should return null if db is not available', async () => {
      database.closeDatabase();
      const electron = require('electron');
      const originalGetPath = electron.app.getPath;
      electron.app.getPath = jest.fn(() => {
        throw new Error('Simulated disk error for getCachedModels');
      });

      const models = await database.getCachedModels();
      expect(models).toBeNull();

      electron.app.getPath = originalGetPath;
      // No need to call database.initDatabase() here, beforeEach will handle it
    });

    it('cacheModels should not throw if db is not available', async () => {
      database.closeDatabase();
      const electron = require('electron');
      const originalGetPath = electron.app.getPath;
      electron.app.getPath = jest.fn(() => {
        throw new Error('Simulated disk error for cacheModels');
      });

      const modelsToCache = [{ id: 1, data: 'test' }];
      await expect(database.cacheModels(modelsToCache)).resolves.not.toThrow();

      electron.app.getPath = originalGetPath; // Restore
      // No need to call database.initDatabase() here, beforeEach will handle it
    });

    it('should handle error during cacheModels write', async () => {
      const queryError = new Error('Cache write failed');
      Database.__setNextQueryError(queryError);
      console.error = jest.fn();

      await database.cacheModels([{ id: 'fail' }]);
      expect(console.error).toHaveBeenCalledWith(
        '[database.js] Error caching file index to SQLite:',
        queryError,
      );
    });

    it('should handle error during getCachedModels read', async () => {
      const queryError = new Error('Cache read failed');
      Database.__setNextQueryError(queryError);
      console.error = jest.fn();

      const models = await database.getCachedModels();
      expect(models).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        '[database.js] Error reading file index from SQLite cache.',
        queryError,
      );
    });

    it('should return null if cached data is malformed JSON', async () => {
      const { FILE_INDEX_CACHE_KEY } = require('../main/constants');
      // Manually insert malformed data into the mock store
      const db = database.getDb();
      db.prepare(
        `INSERT OR REPLACE INTO app_cache (cache_key, cache_value, last_updated) VALUES (?, ?, ?)`,
      ).run(FILE_INDEX_CACHE_KEY, '{"bad json":', new Date().toISOString());
      console.error = jest.fn();

      const models = await database.getCachedModels();
      expect(models).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        '[database.js] Error reading file index from SQLite cache.',
        expect.any(SyntaxError),
      );
    });
  });

  describe('closeDatabase', () => {
    it('should close the database connection, and subsequent getDb calls reinitialize', () => {
      const dbInstance1 = database.getDb();
      expect(dbInstance1.open).toBe(true);

      database.closeDatabase();
      expect(dbInstance1.open).toBe(false); // Check if the specific instance is closed

      const dbInstance2 = database.getDb(); // Should reinitialize
      expect(dbInstance2).toBeDefined();
      expect(dbInstance2.open).toBe(true);
      expect(dbInstance2).not.toBe(dbInstance1); // Should be a new instance
    });

    it('should handle closing an already closed or uninitialized database without error', () => {
      database.closeDatabase(); // Close it once
      expect(() => database.closeDatabase()).not.toThrow(); // Close it again

      // Test closing when db is null internally (e.g., after init failed)
      // This requires more direct manipulation or specific mock if db instance isn't exposed
      // For now, multiple closes are tested.
    });

    it('should handle error when closing the database', () => {
      const closeError = new Error('Close failed');
      Database.__setNextCloseError(closeError);
      console.error = jest.fn();

      database.closeDatabase();
      expect(console.error).toHaveBeenCalledWith(
        '[database.js] Error closing DB connection:',
        closeError,
      );
      // The internal db variable should still be set to null
      const db = database.getDb();
      expect(db.open).toBe(true); // getDb re-initializes
    });
  });
});
