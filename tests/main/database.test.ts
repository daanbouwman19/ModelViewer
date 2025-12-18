import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from 'vitest';
import { EventEmitter } from 'events';

// Define types for mock data
interface MockAlbum {
  id: string;
  name: string;
  textures: { name: string; path: string }[];
  children: MockAlbum[];
}

interface MockDirectory {
  path: string;
  isActive: boolean;
}

interface MockDB {
  views: Record<string, number>;
  albums: MockAlbum[];
  albumsCached: boolean;
  directories: MockDirectory[];
}

// Store data in mock to simulate DB
const mockDb: MockDB = {
  views: {},
  albums: [],
  albumsCached: false,
  directories: [],
};

// Module-scoped variable to hold the latest mock worker instance
let mockWorkerInstance: MockWorker | null = null;
function setMockWorkerInstance(instance: MockWorker) {
  mockWorkerInstance = instance;
}

class MockWorker extends EventEmitter {
  terminate: Mock;
  postMessage: Mock;

  constructor() {
    super();
    this.terminate = vi.fn().mockResolvedValue(undefined);

    this.postMessage = vi.fn(
      (message: { id: string; type: string; payload: any }) => {
        const { id, type, payload } = message;
        let resultData: unknown = undefined;
        const success = true;

        if (type === 'init') {
          // success
        } else if (type === 'recordMediaView') {
          const filePath = payload.filePath;
          mockDb.views[filePath] = (mockDb.views[filePath] || 0) + 1;
        } else if (type === 'getMediaViewCounts') {
          const paths = payload.filePaths;
          const counts: Record<string, number> = {};
          paths.forEach((p: string) => {
            counts[p] = mockDb.views[p] || 0;
          });
          resultData = counts;
        } else if (type === 'cacheAlbums') {
          mockDb.albums = payload.albums;
          mockDb.albumsCached = true;
        } else if (type === 'getCachedAlbums') {
          // Return null only when there are no cached albums (initial state)
          // Return the actual array (even if empty) if cacheAlbums was called
          resultData = mockDb.albumsCached ? mockDb.albums : null;
        } else if (type === 'addMediaDirectory') {
          const dirObj = payload.directoryObj;
          const dirPath = typeof dirObj === 'string' ? dirObj : dirObj.path;
          mockDb.directories.push({
            path: dirPath,
            isActive: true,
          });
        } else if (type === 'getMediaDirectories') {
          resultData = mockDb.directories;
        } else if (type === 'removeMediaDirectory') {
          mockDb.directories = mockDb.directories.filter(
            (d: MockDirectory) => d.path !== payload.directoryPath,
          );
        } else if (type === 'setDirectoryActiveState') {
          const dir = mockDb.directories.find(
            (d: MockDirectory) => d.path === payload.directoryPath,
          );
          if (dir) dir.isActive = payload.isActive;
        } else if (type === 'close') {
          // success
        }

        // Simulate async response
        process.nextTick(() => {
          this.emit('message', {
            id: id,
            result: { success, data: resultData },
          });
        });
      },
    );
    setMockWorkerInstance(this);
  }

  // Helper methods
  simulateMessage(message: unknown) {
    this.emit('message', message);
  }

  simulateError(error: unknown) {
    this.emit('error', error);
  }

  simulateExit(code: number) {
    this.emit('exit', code);
  }
}

vi.mock('worker_threads', () => ({
  Worker: MockWorker,
  default: { Worker: MockWorker },
}));

import { createMockElectron } from './mocks/electron';

vi.mock('electron', () => createMockElectron());

describe('Database', () => {
  // Use a type that matches the exported module structure
  // Since we are dynamically importing, we can use `typeof import(...)` or `any` if necessary,
  // but let's try to be specific or use `unknown` if we just need to access methods known to exist.
  // Ideally, we import the type. But for now, let's use a loosely typed object or just `any` IS the problem.
  // We can use a mapped type of the module.

  let db: typeof import('../../src/main/database');

  beforeEach(async () => {
    // Reset mock DB state (keeping the same object reference)
    mockDb.views = {};
    mockDb.albums = [];
    mockDb.albumsCached = false;
    mockDb.directories = [];

    vi.resetModules();
    // Ensure mockWorkerInstance is reset implicitly by calls, or explicitly if needed, although new worker is created on initDatabase
    mockWorkerInstance = null;

    // Import fresh module
    db = await import('../../src/main/database');

    // Set a shorter timeout for tests
    db.setOperationTimeout(5000);
    // Initialize database before each test
    await db.initDatabase();
  });

  afterEach(async () => {
    // Close database after each test
    await db.closeDatabase();
  });

  describe('initDatabase', () => {
    it('should initialize the database successfully', async () => {
      // Database is already initialized in beforeEach
      // This test verifies no error was thrown
      expect(true).toBe(true);
    });

    it('should handle re-initialization', async () => {
      // Try to initialize again
      await expect(db.initDatabase()).resolves.not.toThrow();
    });
  });

  describe('recordMediaView', () => {
    it('should record a view for a media file', async () => {
      const filePath = '/test/path/image.png';

      await db.recordMediaView(filePath);

      const counts = await db.getMediaViewCounts([filePath]);
      expect(counts[filePath]).toBe(1);
    });

    it('should increment view count on multiple views', async () => {
      const filePath = '/test/path/video.mp4';

      await db.recordMediaView(filePath);
      await db.recordMediaView(filePath);
      await db.recordMediaView(filePath);

      const counts = await db.getMediaViewCounts([filePath]);
      expect(counts[filePath]).toBe(3);
    });

    it('should handle multiple different files', async () => {
      const file1 = '/test/file1.png';
      const file2 = '/test/file2.jpg';

      await db.recordMediaView(file1);
      await db.recordMediaView(file2);
      await db.recordMediaView(file1);

      const counts = await db.getMediaViewCounts([file1, file2]);
      expect(counts[file1]).toBe(2);
      expect(counts[file2]).toBe(1);
    });
  });

  describe('getMediaViewCounts', () => {
    it('should return empty object for empty array', async () => {
      const counts = await db.getMediaViewCounts([]);
      expect(counts).toEqual({});
    });

    it('should return 0 for files that have not been viewed', async () => {
      const counts = await db.getMediaViewCounts(['/test/never-viewed.png']);
      expect(counts['/test/never-viewed.png']).toBe(0);
    });

    it('should return correct counts for multiple files', async () => {
      const files = ['/test/a.png', '/test/b.jpg', '/test/c.mp4'];

      await db.recordMediaView(files[0]);
      await db.recordMediaView(files[1]);
      await db.recordMediaView(files[1]);

      const counts = await db.getMediaViewCounts(files);
      expect(counts[files[0]]).toBe(1);
      expect(counts[files[1]]).toBe(2);
      expect(counts[files[2]]).toBe(0);
    });

    it('should handle files with special characters in paths', async () => {
      const specialPath = '/test/file with spaces & symbols.png';

      await db.recordMediaView(specialPath);

      const counts = await db.getMediaViewCounts([specialPath]);
      expect(counts[specialPath]).toBe(1);
    });
  });

  describe('cacheAlbums', () => {
    it('should cache albums successfully', async () => {
      const albums = [
        {
          id: 'album1',
          name: 'album1',
          textures: [
            { name: 'texture1.png', path: '/test/album1/texture1.png' },
          ],
          children: [],
        },
        {
          id: 'album2',
          name: 'album2',
          textures: [
            { name: 'texture2.jpg', path: '/test/album2/texture2.jpg' },
          ],
          children: [],
        },
      ];

      await db.cacheAlbums(albums);

      const cached = await db.getCachedAlbums();
      expect(cached).toHaveLength(2);
      expect(cached![0].name).toBe('album1');
      expect(cached![1].name).toBe('album2');
    });

    it('should overwrite existing cache', async () => {
      const albums1 = [
        {
          id: 'album1',
          name: 'album1',
          textures: [{ name: 'tex1.png', path: '/test/tex1.png' }],
          children: [],
        },
      ];

      const albums2 = [
        {
          id: 'album2',
          name: 'album2',
          textures: [{ name: 'tex2.png', path: '/test/tex2.png' }],
          children: [],
        },
      ];

      await db.cacheAlbums(albums1);
      await db.cacheAlbums(albums2);

      const cached = await db.getCachedAlbums();
      expect(cached).toHaveLength(1);
      expect(cached![0].name).toBe('album2');
    });

    it('should handle empty albums array', async () => {
      await db.cacheAlbums([]);

      const cached = await db.getCachedAlbums();
      expect(cached).toEqual([]);
    });

    it('should preserve album structure', async () => {
      const albums = [
        {
          id: 'test-album',
          name: 'test-album',
          textures: [
            { name: 'texture1.png', path: '/test/texture1.png' },
            { name: 'texture2.jpg', path: '/test/texture2.jpg' },
          ],
          children: [],
        },
      ];

      await db.cacheAlbums(albums);

      const cached = await db.getCachedAlbums();
      expect(cached![0].textures).toHaveLength(2);
      expect(cached![0].textures[0].name).toBe('texture1.png');
      expect(cached![0].textures[0].path).toBe('/test/texture1.png');
    });
  });

  describe('getCachedAlbums', () => {
    it('should return null when no cache exists', async () => {
      const cached = await db.getCachedAlbums();
      expect(cached).toBeNull();
    });

    it('should retrieve cached albums', async () => {
      const albums = [
        {
          id: 'cached-album',
          name: 'cached-album',
          textures: [{ name: 'tex.png', path: '/test/tex.png' }],
          children: [],
        },
      ];

      await db.cacheAlbums(albums);
      const cached = await db.getCachedAlbums();

      expect(cached).toHaveLength(1);
      expect(cached![0].name).toBe('cached-album');
    });
  });

  describe('closeDatabase', () => {
    it('should close database without errors', async () => {
      await expect(db.closeDatabase()).resolves.not.toThrow();
    });

    it('should allow re-initialization after closing', async () => {
      await db.closeDatabase();
      await expect(db.initDatabase()).resolves.not.toThrow();
    });
  });

  describe('timeout handling', () => {
    it('should respect custom timeout settings', () => {
      db.setOperationTimeout(1000);
      // If this doesn't throw, the timeout was set successfully
      expect(true).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle multiple sequential operations gracefully', async () => {
      // Sequential execution to avoid transaction conflicts
      for (let i = 0; i < 10; i++) {
        await db.recordMediaView(`/test/file${i}.png`);
      }

      // Verify all were recorded
      const files = Array.from({ length: 10 }, (_, i) => `/test/file${i}.png`);
      const counts = await db.getMediaViewCounts(files);
      expect(Object.keys(counts)).toHaveLength(10);
    });

    it('should handle large batches of view counts', async () => {
      const files = Array.from({ length: 100 }, (_, i) => `/test/file${i}.png`);

      // Record views for some files
      for (let i = 0; i < 50; i++) {
        await db.recordMediaView(files[i]);
      }

      const counts = await db.getMediaViewCounts(files);
      expect(Object.keys(counts)).toHaveLength(100);
    });
  });

  describe('media directories', () => {
    it('should add and retrieve a media directory', async () => {
      const dirPath = '/test/media/directory';
      await db.addMediaDirectory(dirPath);
      const dirs = await db.getMediaDirectories();
      expect(dirs).toEqual([{ path: dirPath, isActive: true }]);
    });

    it('should add and remove a media directory', async () => {
      const dirPath = '/test/media/to-remove';
      await db.addMediaDirectory(dirPath);
      await db.removeMediaDirectory(dirPath);
      const dirs = await db.getMediaDirectories();
      expect(dirs).toEqual([]);
    });

    it('should set directory active state', async () => {
      const dirPath = '/test/media/toggle';
      await db.addMediaDirectory(dirPath);
      await db.setDirectoryActiveState(dirPath, false);
      let dirs = await db.getMediaDirectories();
      expect(dirs).toEqual([{ path: dirPath, isActive: false }]);
      await db.setDirectoryActiveState(dirPath, true);
      dirs = await db.getMediaDirectories();
      expect(dirs).toEqual([{ path: dirPath, isActive: true }]);
    });
  });

  describe('error handling for directory operations', () => {
    it('should handle errors when removing non-existent directory', async () => {
      // This should not throw, but we'll test that the operation completes
      await db.removeMediaDirectory('/non/existent/path');
      const dirs = await db.getMediaDirectories();
      expect(Array.isArray(dirs)).toBe(true);
    });

    it('should handle errors when setting active state on non-existent directory', async () => {
      // This should not throw, but we'll test that the operation completes
      await db.setDirectoryActiveState('/non/existent/path', false);
      const dirs = await db.getMediaDirectories();
      expect(Array.isArray(dirs)).toBe(true);
    });

    it('should handle gracefully when trying to record view without initialization', async () => {
      await db.closeDatabase();
      // recordMediaView should not throw, it handles errors gracefully
      await expect(
        db.recordMediaView('/test/path.jpg'),
      ).resolves.toBeUndefined();
    });

    it('should return empty object when trying to get view counts without initialization', async () => {
      await db.closeDatabase();
      // getMediaViewCounts returns empty object on error
      const result = await db.getMediaViewCounts(['/test/path.jpg']);
      expect(result).toEqual({});
    });
  });
});

interface WorkerMessage {
  id: string;
  type: string;
  payload: unknown;
}

describe('database.js additional coverage - uninitialized', () => {
  beforeEach(() => {
    vi.resetModules();
    mockWorkerInstance = null;
  });

  it('should reject if dbWorker is not initialized', async () => {
    const freshDb = await import('../../src/main/database');
    await expect(freshDb.addMediaDirectory('/test/path')).rejects.toThrow(
      'Database worker not initialized',
    );
  });
});

describe('Additional Function Coverage', () => {
  let db: typeof import('../../src/main/database');

  beforeEach(async () => {
    vi.resetModules();
    mockWorkerInstance = null;

    db = await import('../../src/main/database');
    await db.initDatabase();
  });

  afterEach(async () => {
    await db.closeDatabase();
  });

  it.each([
    {
      funcName: 'setRating',
      msgType: 'setRating',
      args: ['/file.mp4', 5],
      errorMsg: 'Rating error',
    },
    {
      funcName: 'upsertMetadata',
      msgType: 'upsertMetadata',
      args: ['/file.mp4', { size: 100 }],
      errorMsg: 'Metadata error',
    },
    {
      funcName: 'createSmartPlaylist',
      msgType: 'createSmartPlaylist',
      args: ['Test', '{}'],
      errorMsg: 'Create playlist error',
    },
    {
      funcName: 'updateSmartPlaylist',
      msgType: 'updateSmartPlaylist',
      args: [1, 'Test', '{}'],
      errorMsg: 'Update playlist error',
    },
    {
      funcName: 'deleteSmartPlaylist',
      msgType: 'deleteSmartPlaylist',
      args: [1],
      errorMsg: 'Delete playlist error',
    },
  ])(
    'should handle $funcName errors',
    async ({ funcName, msgType, args, errorMsg }) => {
      const fn = (db as any)[funcName];

      const originalPostMessage = mockWorkerInstance!.postMessage;
      mockWorkerInstance!.postMessage = vi.fn((message: WorkerMessage) => {
        if (message.type === msgType) {
          process.nextTick(() => {
            mockWorkerInstance!.simulateMessage({
              id: message.id,
              result: { success: false, error: errorMsg },
            });
          });
        } else {
          originalPostMessage.call(mockWorkerInstance, message);
        }
      });

      await expect(fn(...args)).rejects.toThrow(errorMsg);
      mockWorkerInstance!.postMessage = originalPostMessage;
    },
  );

  it('should return empty array on getSmartPlaylists error', async () => {
    const originalPostMessage = mockWorkerInstance!.postMessage;
    mockWorkerInstance!.postMessage = vi.fn((message: WorkerMessage) => {
      if (message.type === 'getSmartPlaylists') {
        process.nextTick(() => {
          mockWorkerInstance!.simulateMessage({
            id: message.id,
            result: { success: false, error: 'Get playlists error' },
          });
        });
      } else {
        originalPostMessage.call(mockWorkerInstance, message);
      }
    });

    const result = await db.getSmartPlaylists();
    expect(result).toEqual([]);
    mockWorkerInstance!.postMessage = originalPostMessage;
  });

  it('should return empty array on getAllMetadataAndStats error', async () => {
    const originalPostMessage = mockWorkerInstance!.postMessage;
    mockWorkerInstance!.postMessage = vi.fn((message: WorkerMessage) => {
      if (message.type === 'executeSmartPlaylist') {
        process.nextTick(() => {
          mockWorkerInstance!.simulateMessage({
            id: message.id,
            result: { success: false, error: 'Get metadata error' },
          });
        });
      } else {
        originalPostMessage.call(mockWorkerInstance, message);
      }
    });

    const result = await db.getAllMetadataAndStats();
    expect(result).toEqual([]);
    mockWorkerInstance!.postMessage = originalPostMessage;
  });

  it('should return empty object on getMetadata error', async () => {
    const originalPostMessage = mockWorkerInstance!.postMessage;
    mockWorkerInstance!.postMessage = vi.fn((message: WorkerMessage) => {
      if (message.type === 'getMetadata') {
        process.nextTick(() => {
          mockWorkerInstance!.simulateMessage({
            id: message.id,
            result: { success: false, error: 'Get metadata error' },
          });
        });
      } else {
        originalPostMessage.call(mockWorkerInstance, message);
      }
    });

    const result = await db.getMetadata(['/file.mp4']);
    expect(result).toEqual({});
    mockWorkerInstance!.postMessage = originalPostMessage;
  });

  it('logs an error when worker exits unexpectedly', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    expect(mockWorkerInstance).toBeDefined();
    expect(mockWorkerInstance).not.toBeNull();

    // Simulate an unexpected exit with a non-zero code
    mockWorkerInstance!.simulateExit(1);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[database.js] Database worker exited unexpectedly with code 1',
    );

    consoleErrorSpy.mockRestore();
  });

  it('logs a warning for recordMediaView errors in non-test environment', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    expect(mockWorkerInstance).toBeDefined();
    expect(mockWorkerInstance).not.toBeNull();

    const originalPostMessage = mockWorkerInstance!.postMessage;
    // Simulate a failure in worker communication for the recordMediaView call
    const postMessageSpy = vi
      .spyOn(mockWorkerInstance!, 'postMessage')
      .mockImplementation((message: any) => {
        if (message.type === 'recordMediaView') {
          throw new Error('Test worker error');
        }
        // Let other messages pass
        originalPostMessage.call(mockWorkerInstance, message);
      });

    await db.recordMediaView('/some/file.jpg');

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[database.js] Error recording media view: Test worker error',
    );

    // Cleanup
    postMessageSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('rejects pending messages when worker emits an error', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const addDirPromise = db.addMediaDirectory('/test/dir');
    const getViewCountsPromise = db.getMediaViewCounts(['/file.txt']);

    const testError = new Error('Test worker crash');
    mockWorkerInstance!.simulateError(testError);

    await expect(addDirPromise).rejects.toThrow(testError);
    await expect(getViewCountsPromise).resolves.toEqual({});

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[database.js] Database worker error:',
      testError,
    );

    consoleErrorSpy.mockRestore();
  });

  it('getMediaDirectories should return [] on falsy worker response', async () => {
    const originalPostMessage = mockWorkerInstance!.postMessage;
    const postMessageSpy = vi.spyOn(mockWorkerInstance!, 'postMessage');

    postMessageSpy.mockImplementation((message: any) => {
      if (message.type === 'getMediaDirectories') {
        mockWorkerInstance!.simulateMessage({
          id: message.id,
          result: { success: true, data: null },
        });
      } else {
        originalPostMessage.call(mockWorkerInstance, message);
      }
    });

    const directories = await db.getMediaDirectories();
    expect(directories).toEqual([]);
    postMessageSpy.mockRestore();
  });

  it('should handle errors when terminating the worker during close', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const terminateError = new Error('Failed to terminate');
    mockWorkerInstance!.terminate.mockRejectedValue(terminateError);

    await db.closeDatabase();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[database.js] Error closing database worker:',
      terminateError,
    );

    await expect(db.addMediaDirectory('/test/path')).rejects.toThrow(
      'Database worker not initialized',
    );

    consoleErrorSpy.mockRestore();
    await db.initDatabase();
  });

  it('sendMessageToWorker handles synchronous postMessage error', async () => {
    await db.closeDatabase();
    await db.initDatabase();

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    mockWorkerInstance!.postMessage.mockImplementation(() => {
      throw new Error('Sync postMessage error');
    });

    await expect(db.addMediaDirectory('/test')).rejects.toThrow(
      'Sync postMessage error',
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[database.js] Error posting message to worker: Sync postMessage error',
      ),
    );
    consoleErrorSpy.mockRestore();
  });

  it('closeDatabase logs warning if close message fails in non-test env', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    await db.closeDatabase();
    await db.initDatabase();

    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    mockWorkerInstance!.postMessage.mockImplementation((msg: any) => {
      if (msg.type === 'close') throw new Error('Close message failed');
    });

    await db.closeDatabase();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[database.js] Warning during worker shutdown:',
      expect.any(Error),
    );

    consoleWarnSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });
});
