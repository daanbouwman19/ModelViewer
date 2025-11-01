/**
 * @file Unit tests for the database management module with Worker Thread
 */
const path = require('path');

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

jest.mock('worker_threads');

let database;
let Worker;

describe('database.js with Worker Thread', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });

  describe('Successful Initialization', () => {
    beforeEach(async () => {
      jest.resetModules();
      const workerThreads = require('worker_threads');
      Worker = workerThreads.Worker;
      Worker.__resetStore();
      Worker.__resetConfig();

      database = require('../main/database.js');
      // Set shorter timeout for tests
      database.setOperationTimeout(1000);
      await database.initDatabase();
    });

    afterEach(async () => {
      // Reset config before closing to avoid timeout issues
      Worker.__resetConfig();
      await database.closeDatabase();
    });

    describe('initDatabase', () => {
      it('should initialize the database worker', async () => {
        const result = await database.getCachedModels();
        expect(result).toBeNull();
      });
    });

    describe('recordMediaView and getMediaViewCounts', () => {
      it('should record and retrieve view counts', async () => {
        const filePath = '/test/file.mp4';
        await database.recordMediaView(filePath);
        const counts = await database.getMediaViewCounts([filePath]);
        expect(counts[filePath]).toBe(1);
      });
    });

    describe('cacheModels and getCachedModels', () => {
      it('should cache and retrieve models', async () => {
        const models = [{ id: 1, name: 'model1.obj' }];
        await database.cacheModels(models);
        const cachedModels = await database.getCachedModels();
        expect(cachedModels).toEqual(models);
      });
    });

    describe('Error Handling', () => {
      describe('Worker Communication Timeout', () => {
        it('should handle timeout when worker does not respond', async () => {
          // After init succeeds, configure timeout for subsequent operations
          Worker.__setConfig({ shouldTimeout: true });

          // recordMediaView catches errors internally, so it won't throw
          await database.recordMediaView('/test/file.mp4');

          // Verify that the operation was attempted but failed (no view recorded)
          Worker.__resetConfig();
          const counts = await database.getMediaViewCounts(['/test/file.mp4']);
          expect(counts['/test/file.mp4']).toBe(0); // View should not have been recorded
        }, 5000);

        it('should handle timeout in getCachedModels', async () => {
          Worker.__setConfig({ shouldTimeout: true });

          const result = await database.getCachedModels();
          expect(result).toBeNull(); // Should return null on error

          Worker.__resetConfig();
        }, 5000);
      });

      describe('Worker Returns Error', () => {
        it('should handle error response from worker in recordMediaView', async () => {
          Worker.__setConfig({
            shouldReturnError: true,
            errorMessage: 'Database write failed',
          });

          // Should not throw but should handle gracefully
          await expect(
            database.recordMediaView('/test/file.mp4'),
          ).resolves.not.toThrow();

          Worker.__resetConfig();
        });

        it('should handle error response from worker in getMediaViewCounts', async () => {
          Worker.__setConfig({
            shouldReturnError: true,
            errorMessage: 'Failed to query database',
          });

          const result = await database.getMediaViewCounts(['/test/file.mp4']);
          expect(result).toEqual({}); // Should return empty object on error

          Worker.__resetConfig();
        });

        it('should handle error response from worker in cacheModels', async () => {
          Worker.__setConfig({
            shouldReturnError: true,
            errorMessage: 'Cache write failed',
          });

          const models = [{ id: 1, name: 'model1.obj' }];
          // Should not throw but handle gracefully
          await expect(database.cacheModels(models)).resolves.not.toThrow();

          Worker.__resetConfig();
        });

        it('should handle error response from worker in getCachedModels', async () => {
          Worker.__setConfig({
            shouldReturnError: true,
            errorMessage: 'Cache read failed',
          });

          const result = await database.getCachedModels();
          expect(result).toBeNull(); // Should return null on error

          Worker.__resetConfig();
        });
      });

      describe('Worker Crash/Exit', () => {
        it('should handle worker crash during operation', async () => {
          // Configure worker to crash on next message
          Worker.__setConfig({ shouldCrash: true });

          // Worker will crash when we try an operation
          const result = await database.getCachedModels();
          expect(result).toBeNull(); // Should return null on error
        });

        it('should handle unexpected worker exit gracefully', async () => {
          // Verify we can perform operations after a crash
          // (worker is recreated in beforeEach)
          const result = await database.getCachedModels();
          expect(result).toBeNull(); // Fresh worker, no cached data
        });
      });

      describe('Worker Not Initialized', () => {
        it('should handle operations gracefully when worker is not initialized', async () => {
          await database.closeDatabase();

          // recordMediaView should not throw (catches internally)
          await expect(
            database.recordMediaView('/test/file.mp4'),
          ).resolves.not.toThrow();

          // getMediaViewCounts should return empty object
          const counts = await database.getMediaViewCounts(['/test/file.mp4']);
          expect(counts).toEqual({});

          // cacheModels should not throw (catches internally)
          await expect(
            database.cacheModels([{ id: 1 }]),
          ).resolves.not.toThrow();

          // getCachedModels should return null
          const models = await database.getCachedModels();
          expect(models).toBeNull();
        });
      });

      describe('closeDatabase', () => {
        it('should handle closing the database when the worker is already closed', async () => {
          await database.closeDatabase();
          // Closing again should not throw an error
          await expect(database.closeDatabase()).resolves.not.toThrow();
        });
      });
    });
  });

  describe('Initialization Failure', () => {
    it('should handle worker initialization failure', async () => {
      jest.resetModules();
      const workerThreads = require('worker_threads');
      Worker = workerThreads.Worker;
      Worker.__setConfig({ shouldFailToInitialize: true });
      const db = require('../main/database.js');
      await expect(db.initDatabase()).rejects.toThrow(
        'Simulated initialization error',
      );
      Worker.__resetConfig();
    });
  });
});
