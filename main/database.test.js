const path = require('path');
const fs = require('fs');

// Define mockTestUserDataPath globally for the test file
const mockTestUserDataPath = path.join(__dirname, 'test_user_data');
const dbPath = path.join(mockTestUserDataPath, 'media_slideshow_stats.sqlite');

// It's crucial that jest.mock is at the top level, before any imports
// that might use the mocked module (like './database' which uses 'electron').
jest.mock('electron', () => {
    const pathModule = require('path'); // Correctly aliased
    const fsModule = require('fs');
    // Ensure this path is consistent with mockTestUserDataPath
    const appPath = pathModule.join(__dirname, 'test_user_data'); // Use pathModule here
    if (!fsModule.existsSync(appPath)) {
        fsModule.mkdirSync(appPath, { recursive: true });
    }
    return {
        app: {
            getPath: jest.fn((name) => {
                if (name === 'userData') {
                    return appPath;
                }
                return pathModule.join(appPath, name); // And here
            }),
        },
    };
});

// Now, import the modules under test AFTER mocks are set up.
let database; // Will be re-required in beforeEach

describe('database.js', () => {
    beforeAll(() => {
        if (!fs.existsSync(mockTestUserDataPath)) {
            fs.mkdirSync(mockTestUserDataPath, { recursive: true });
        }
        process.env.NODE_ENV = 'test'; // Set for all tests
    });

    beforeEach(() => {
        // Reset modules to ensure a fresh state for database.js, especially its internal 'db' variable
        jest.resetModules();
        // Re-require database after resetting modules
        database = require('./database');

        // Clean up database file before each test
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }
        // Initialize the database for each test.
        database.initDatabase();
    });

    afterEach(async () => {
        if (database && typeof database.closeDatabase === 'function') {
            await database.closeDatabase();
        }
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }
    });

    afterAll(() => {
        if (fs.existsSync(mockTestUserDataPath)) {
            fs.rmSync(mockTestUserDataPath, { recursive: true, force: true });
        }
    });

    describe('initDatabase and getDb', () => {
        it('should initialize the database and create tables', () => {
            const db = database.getDb();
            expect(db).toBeDefined();
            expect(db.open).toBe(true);
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            expect(tables.map(t => t.name)).toContain('media_views');
            expect(tables.map(t => t.name)).toContain('app_cache');
        });

        it('should return the same db instance when getDb is called multiple times', () => {
            const db1 = database.getDb();
            const db2 = database.getDb();
            expect(db1).toBe(db2);
        });

        it('should re-initialize if db is closed and getDb is called', () => {
            let db = database.getDb();
            db.close();
            expect(db.open).toBe(false);

            const newDb = database.getDb();
            expect(newDb).toBeDefined();
            expect(newDb.open).toBe(true);
            expect(newDb).not.toBe(db);
        });
    });

    describe('generateFileId', () => {
        it('should generate a consistent MD5 hash for a file path', () => {
            const filePath = '/test/path/to/file.mp4';
            const fileId1 = database.generateFileId(filePath);
            const fileId2 = database.generateFileId(filePath);
            expect(fileId1).toBe(fileId2);
            expect(fileId1).toMatch(/^[a-f0-9]{32}$/);
        });
    });

    describe('recordMediaView and getMediaViewCounts', () => {
        it('should record a new media view and increment view count', async () => {
            const filePath = '/test/file1.mp4';
            await database.recordMediaView(filePath);
            let counts = await database.getMediaViewCounts([filePath]);
            expect(counts[filePath]).toBe(1);

            await database.recordMediaView(filePath);
            counts = await database.getMediaViewCounts([filePath]);
            expect(counts[filePath]).toBe(2);
        });

        it('should return 0 for files not viewed', async () => {
            const filePath1 = '/test/file1.mp4';
            const filePath2 = '/test/file2.obj';
            await database.recordMediaView(filePath1);
            const counts = await database.getMediaViewCounts([filePath1, filePath2]);
            expect(counts[filePath1]).toBe(1);
            expect(counts[filePath2]).toBe(0);
        });

        it('should handle empty array for getMediaViewCounts', async () => {
            const counts = await database.getMediaViewCounts([]);
            expect(counts).toEqual({});
        });
    });

    describe('cacheModels and getCachedModels', () => {
        it('should cache and retrieve models', async () => {
            const models = [{ id: 1, name: 'model1.obj' }, { id: 2, name: 'model2.stl' }];
            await database.cacheModels(models);
            const cachedModels = await database.getCachedModels();
            expect(cachedModels).toEqual(models);
        });

        it('should return null if no cache exists', async () => {
            const cachedModels = await database.getCachedModels();
            expect(cachedModels).toBeNull();
        });

        it('should overwrite existing cache', async () => {
            const oldModels = [{ id: 1, name: 'old_model.obj' }];
            await database.cacheModels(oldModels);
            const newModels = [{ id: 2, name: 'new_model.stl' }];
            await database.cacheModels(newModels);
            const cachedModels = await database.getCachedModels();
            expect(cachedModels).toEqual(newModels);
        });
    });

    describe('closeDatabase', () => {
        it('should close the database connection', () => {
            const db = database.getDb();
            expect(db.open).toBe(true);
            database.closeDatabase();
            expect(db.open).toBe(false);
        });

        it('getDb should re-open a closed database connection', () => {
            let db = database.getDb();
            expect(db.open).toBe(true);
            database.closeDatabase();
            expect(db.open).toBe(false);

            db = database.getDb();
            expect(db.open).toBe(true);
        });
    });
});
