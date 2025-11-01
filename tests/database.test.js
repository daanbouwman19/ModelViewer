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

  beforeEach(async () => {
    jest.resetModules();
    const workerThreads = require('worker_threads');
    Worker = workerThreads.Worker;
    Worker.__resetStore();

    database = require('../main/database.js');
    await database.initDatabase();
  });

  afterEach(async () => {
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
});
