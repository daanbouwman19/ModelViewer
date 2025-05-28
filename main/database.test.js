const path = require('path');
// fs and os will be required inside the mock factory

// Mock Electron's app module
jest.mock('electron', () => {
  const actualPath = require('path');
  const actualOs = require('os');
  const actualFs = require('fs');
  let tempUserDataPath; // To store the path for the duration of the test suite

  // Helper to ensure tempUserDataPath is created only once per test file execution
  function getOrCreateTempUserDataPath() {
    if (!tempUserDataPath) {
      tempUserDataPath = actualPath.join(actualOs.tmpdir(), `test-user-data-${Date.now()}${Math.random().toString().slice(2)}`);
      if (!actualFs.existsSync(tempUserDataPath)) {
        actualFs.mkdirSync(tempUserDataPath, { recursive: true });
      }
    }
    return tempUserDataPath;
  }

  return {
    app: {
      getPath: jest.fn((name) => {
        if (name === 'userData') {
          return getOrCreateTempUserDataPath();
        }
        return ''; // Default for other paths
      }),
    },
    ipcMain: { // Mock ipcMain as it was before
      handle: jest.fn(),
    }
  };
}, { virtual: true }); // virtual mock for electron

// Dynamically require databaseFunctions AFTER mocks are set up
let databaseFunctions; 
let dbPath; // To store the path for cleanup

// Helper to get the actual db module after mocks
function requireDatabaseModule() {
  jest.resetModules(); // Important to get a fresh module with mocks applied
  
  // Now, electron.app.getPath() will use the consistent path from the mock factory.
  // We still need to get the path for dbPath for cleanup.
  const electron = require('electron'); // Get the mocked electron
  const userDataPath = electron.app.getPath('userData'); // This will call our mock
  const fs = require('fs'); // fs required for cleanup logic in afterAll and beforeEach

  dbPath = path.join(userDataPath, 'media_slideshow_stats.sqlite'); 

  // No need to re-mock electron.app.getPath here as the factory does it.
  // electron.app.getPath.mockImplementation((name) => {
  //     if (name === 'userData') return userDataPath; // This was part of the problem
  //     return '';
  // });

  databaseFunctions = require('./database.js');
  
  // For testing, we want to force database.js to use an in-memory db or a specific test file db
  // We can't directly change the dbPath inside database.js from here easily after it's initialized.
  // The module uses app.getPath('userData') on its first load.
  // The mock above handles this. Forcing :memory: requires changing database.js or a more complex mock.
  // The current mock will create a new test DB file in the temp dir.
}


describe('Database Functions', () => {
  beforeAll(() => {
    // This ensures that database.js uses a mocked path for its DB
    requireDatabaseModule();
  });

  beforeEach(async () => {
    // For file-based test DB, ensure a clean state
    // For ':memory:', this would mean re-initializing.
    // Since initDatabase creates tables IF NOT EXISTS, we can call it.
    // Or, delete the test DB file and re-init.
    if (dbPath && fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    // Re-initialize the database to ensure it's clean for each test, using the mocked path
    // This will create a new empty test DB file
    databaseFunctions.initDatabase(); 
  });

  afterAll(() => {
    // Clean up the temporary directory
    const electron = require('electron');
    const tempDir = electron.app.getPath('userData');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('initDatabase', () => {
    test('should create media_views and app_cache tables', () => {
      const db = databaseFunctions.initDatabase(); // initDatabase returns the db instance
      expect(db).not.toBeNull();

      const mediaViewsTableInfo = db.pragma(`table_info(media_views)`);
      expect(mediaViewsTableInfo.length).toBeGreaterThan(0);
      const appCacheTableInfo = db.pragma(`table_info(app_cache)`);
      expect(appCacheTableInfo.length).toBeGreaterThan(0);
    });
  });

  describe('generateFileId', () => {
    test('should generate a consistent MD5 hash', () => {
      const filePath = '/some/test/file.mp4';
      const id1 = databaseFunctions.generateFileId(filePath);
      const id2 = databaseFunctions.generateFileId(filePath);
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^[a-f0-9]{32}$/); // MD5 hex format
    });

    test('should generate different hashes for different paths', () => {
      const filePath1 = '/some/test/file1.mp4';
      const filePath2 = '/some/test/file2.mp4';
      const id1 = databaseFunctions.generateFileId(filePath1);
      const id2 = databaseFunctions.generateFileId(filePath2);
      expect(id1).not.toBe(id2);
    });
  });

  describe('View Counts (recordMediaView & getMediaViewCounts)', () => {
    test('should correctly record and retrieve view counts', async () => {
      const filePath1 = 'path/to/media1.jpg';
      const filePath2 = 'path/to/media2.png';

      await databaseFunctions.recordMediaView(filePath1);
      await databaseFunctions.recordMediaView(filePath1);
      await databaseFunctions.recordMediaView(filePath2);

      const counts = await databaseFunctions.getMediaViewCounts([filePath1, filePath2, 'path/to/unknown.gif']);
      expect(counts[filePath1]).toBe(2);
      expect(counts[filePath2]).toBe(1);
      expect(counts['path/to/unknown.gif']).toBe(0);
    });

    test('getMediaViewCounts should return empty for no paths or null DB', async () => {
        expect(await databaseFunctions.getMediaViewCounts([])).toEqual({});
        // More complex: testing with db forced to null after init.
        // For now, this covers the empty path list.
    });

    test('recordMediaView should update last_viewed timestamp', async () => {
        const filePath = 'path/to/timestamp_test.mov';
        const fileId = databaseFunctions.generateFileId(filePath);
        
        await databaseFunctions.recordMediaView(filePath);
        const db = databaseFunctions.initDatabase(); // get db instance
        const initialView = db.prepare('SELECT last_viewed FROM media_views WHERE file_path_hash = ?').get(fileId);
        const initialTimestamp = new Date(initialView.last_viewed).getTime();
        expect(initialTimestamp).toBeLessThanOrEqual(new Date().getTime());

        // Wait a bit to ensure timestamp can change
        await new Promise(resolve => setTimeout(resolve, 50)); 
        
        await databaseFunctions.recordMediaView(filePath);
        const updatedView = db.prepare('SELECT last_viewed FROM media_views WHERE file_path_hash = ?').get(fileId);
        const updatedTimestamp = new Date(updatedView.last_viewed).getTime();
        
        expect(updatedTimestamp).toBeGreaterThan(initialTimestamp);
    });
  });
  
  describe('Caching (cacheModels & getCachedModels)', () => {
    const { FILE_INDEX_CACHE_KEY } = require('./constants'); // For verification

    test('should cache and retrieve models correctly', async () => {
      const modelsToCache = [{ name: 'model1', textures: [{ path: 'path/to/tex1.png' }] }];
      await databaseFunctions.cacheModels(modelsToCache);

      const cachedModels = await databaseFunctions.getCachedModels();
      expect(cachedModels).toEqual(modelsToCache);
    });

    test('getCachedModels should return null if no cache exists', async () => {
      // Ensure cache is empty (new DB for this test or clear specific cache key)
      const db = databaseFunctions.initDatabase();
      db.prepare('DELETE FROM app_cache WHERE cache_key = ?').run(FILE_INDEX_CACHE_KEY);
      
      const models = await databaseFunctions.getCachedModels();
      expect(models).toBeNull();
    });

    test('cacheModels should update last_updated timestamp', async () => {
        const models1 = [{ name: 'modelA', textures: [] }];
        await databaseFunctions.cacheModels(models1);
        const db = databaseFunctions.initDatabase();
        const initialCacheEntry = db.prepare('SELECT last_updated FROM app_cache WHERE cache_key = ?').get(FILE_INDEX_CACHE_KEY);
        const initialTimestamp = new Date(initialCacheEntry.last_updated).getTime();

        await new Promise(resolve => setTimeout(resolve, 50));

        const models2 = [{ name: 'modelB', textures: [] }];
        await databaseFunctions.cacheModels(models2);
        const updatedCacheEntry = db.prepare('SELECT last_updated FROM app_cache WHERE cache_key = ?').get(FILE_INDEX_CACHE_KEY);
        const updatedTimestamp = new Date(updatedCacheEntry.last_updated).getTime();

        expect(updatedTimestamp).toBeGreaterThan(initialTimestamp);
    });
  });
});
