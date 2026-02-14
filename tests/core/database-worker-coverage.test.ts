
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Define the mock instance hoisted
const { mockDbInstance, mockStatement, mockMessageHandlerRef, mockPostMessageSpy } = vi.hoisted(() => {
    const stmt = {
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
        get: vi.fn(),
    };

    const instance = {
        pragma: vi.fn(),
        prepare: vi.fn().mockReturnValue(stmt),
        transaction: vi.fn((fn) => fn),
        close: vi.fn(),
    };

    const handlerRef = { handler: null as any };
    const spy = vi.fn();

    return {
        mockDbInstance: instance,
        mockStatement: stmt,
        mockMessageHandlerRef: handlerRef,
        mockPostMessageSpy: spy
    };
});

// Mock dependencies
vi.mock('worker_threads', async (importOriginal) => {
    const actual = await importOriginal<typeof import('worker_threads')>();
    const mock = {
        ...actual,
        parentPort: {
            on: vi.fn((event, handler) => {
                if (event === 'message') {
                    mockMessageHandlerRef.handler = handler;
                }
            }),
            postMessage: mockPostMessageSpy,
        },
        isMainThread: false,
    };
    return {
        ...mock,
        default: mock,
    };
});

vi.mock('better-sqlite3', () => {
  return {
    default: vi.fn(function() {
        return mockDbInstance;
    }),
  };
});

vi.mock('../../src/core/database-schema', () => ({
  initializeSchema: vi.fn(),
  migrateMediaDirectories: vi.fn(),
  migrateMediaMetadata: vi.fn(),
  createIndexes: vi.fn(),
}));

vi.mock('../../src/core/media-utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/core/media-utils')>();
    return {
        ...actual,
        isDrivePath: vi.fn((p) => p && p.startsWith('gdrive://')),
        getDriveId: vi.fn((p) => p.split('gdrive://')[1]),
    };
});

vi.mock('fs/promises', async () => {
    return {
        default: {
            stat: vi.fn((path) => {
                if (path === '/error/path') {
                    throw new Error('Unknown error');
                }
                if (path === '/enoent/path') {
                    const e: any = new Error('ENOENT');
                    e.code = 'ENOENT';
                    throw e;
                }
                return Promise.resolve({
                    size: 100,
                    mtime: new Date()
                });
            }),
        }
    };
});

import * as worker from '../../src/core/database-worker';
import Database from 'better-sqlite3';

describe('Database Worker Coverage', () => {

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPostMessageSpy.mockClear();

    // Reset the statement mock to default state
    mockStatement.run.mockReset();
    mockStatement.all.mockReset();
    mockStatement.get.mockReset();

    mockStatement.all.mockReturnValue([]);

    // Reset transaction mock
    mockDbInstance.transaction.mockImplementation((fn: any) => fn);
    mockDbInstance.prepare.mockReturnValue(mockStatement);

    // Re-initialize DB
    const res = worker.initDatabase(':memory:');
    if (!res.success) {
        throw new Error('Failed to init DB in beforeEach');
    }
  });

  afterEach(() => {
    worker.closeDatabase();
  });

  it('initDatabase - handles initialization failure', () => {
    // Force constructor to throw
    (Database as any).mockImplementationOnce(function() {
      throw new Error('Init failed');
    });
    const result = worker.initDatabase(':memory:');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Init failed');
  });

  it('upsertMetadata - handles error', async () => {
    // We affect the cached statement
    mockStatement.run.mockImplementationOnce(() => { throw new Error('Insert failed'); });

    const result = await worker.upsertMetadata({ filePath: '/test.mp4' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Insert failed');
  });

  it('upsertMetadata - handles drive path', async () => {
      // Should generate ID from drive ID
      const result = await worker.upsertMetadata({ filePath: 'gdrive://fileid' });
      expect(result.success).toBe(true);
      expect(mockStatement.run).toHaveBeenCalled();
  });

  it('upsertMetadata - handles fs.stat error (non-ENOENT)', async () => {
      // Should log error and fallback to hashing path
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await worker.upsertMetadata({ filePath: '/error/path' });
      expect(result.success).toBe(true);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
  });

  it('setRating - handles error', async () => {
    mockStatement.run.mockImplementationOnce(() => { throw new Error('Update failed'); });

    const result = await worker.setRating('/test.mp4', 5);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Update failed');
  });

  it('updateWatchedSegments - handles error', async () => {
    mockStatement.run.mockImplementationOnce(() => { throw new Error('Update failed'); });

    const result = await worker.updateWatchedSegments('/test.mp4', '[]');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Update failed');
  });

  it('getAllMetadata - handles error', () => {
    mockStatement.all.mockImplementationOnce(() => { throw new Error('Query failed'); });

    const result = worker.getAllMetadata();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Query failed');
  });

  it('filterProcessingNeeded - handles error', async () => {
    mockStatement.all.mockImplementationOnce(() => { throw new Error('Query failed'); });

    const result = await worker.filterProcessingNeeded(['/test.mp4']);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Query failed');
  });

  it('filterProcessingNeeded - returns empty for empty input', async () => {
      const result = await worker.filterProcessingNeeded([]);
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
  });

  it('filterProcessingNeeded - handles large batch (simulated)', async () => {
      // Create array > 900 items
      const paths = Array.from({ length: 950 }, (_, i) => `/file${i}.mp4`);

      // Mock all to return nothing (all needed)
      mockStatement.all.mockReturnValue([]);

      const result = await worker.filterProcessingNeeded(paths);

      expect(result.success).toBe(true);
      expect((result.data as string[]).length).toBe(950);
      // Verify all was called at least twice (batching)
      expect(mockStatement.all.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('recordMediaView - handles transaction error', async () => {
    mockDbInstance.transaction.mockImplementationOnce(() => {
        return () => { throw new Error('Transaction failed'); };
    });

    const result = await worker.recordMediaView('/test.mp4');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Transaction failed');
  });

  it('getMediaViewCounts - handles error', async () => {
    mockStatement.all.mockImplementationOnce(() => { throw new Error('Query failed'); });

    const result = await worker.getMediaViewCounts(['/test.mp4']);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Query failed');
  });

  it('getMediaViewCounts - handles large batch', async () => {
      const paths = Array.from({ length: 950 }, (_, i) => `/file${i}.mp4`);

      // Mock all to return some counts
      mockStatement.all.mockReturnValue([
          { file_path: '/file0.mp4', view_count: 5 }
      ]);

      const result = await worker.getMediaViewCounts(paths);

      expect(result.success).toBe(true);
      const map = result.data as Record<string, number>;
      expect(map['/file0.mp4']).toBe(5);
      expect(map['/file949.mp4']).toBe(0); // Default
      // Verify batching calls
      expect(mockStatement.all.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('cacheAlbums - handles error', async () => {
    mockStatement.run.mockImplementationOnce(() => { throw new Error('Cache failed'); });

    const result = await worker.cacheAlbums('key', []);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Cache failed');
  });

  it('addMediaDirectory - handles error', () => {
    mockStatement.run.mockImplementationOnce(() => { throw new Error('Add failed'); });

    const result = worker.addMediaDirectory({ path: '/dir' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Add failed');
  });

  it('executeSmartPlaylist - handles invalid JSON', () => {
    const result = worker.executeSmartPlaylist('{ invalid json }');
    expect(result.success).toBe(false);
  });

  it('getRecentlyPlayed - handles error', () => {
    mockStatement.all.mockImplementationOnce(() => { throw new Error('Query failed'); });

    const result = worker.getRecentlyPlayed(10);
    expect(result.success).toBe(false);
  });

  it('bulkUpsertMetadata - handles error', async () => {
      mockDbInstance.transaction.mockImplementationOnce(() => {
          return () => { throw new Error('Bulk failed'); };
      });

      const result = await worker.bulkUpsertMetadata([{ filePath: '/test.mp4' }]);
      expect(result.success).toBe(false);
  });

  it('closeDatabase - handles error', () => {
     mockDbInstance.close.mockImplementationOnce(() => { throw new Error('Close failed'); });

     const result = worker.closeDatabase();
     expect(result.success).toBe(false);
     expect(result.error).toBe('Close failed');
  });

  // Switch case coverage
  it('message handler - handles unknown message type', async () => {
      const handler = mockMessageHandlerRef.handler;
      if (handler) {
          await handler({ id: 1, type: 'UNKNOWN_TYPE', payload: {} });
          expect(mockPostMessageSpy).toHaveBeenCalledWith({
              id: 1,
              result: { success: false, error: 'Unknown message type: UNKNOWN_TYPE' }
          });
      } else {
          throw new Error('messageHandler not captured');
      }
  });

  it('message handler - handles getPendingMetadata when DB not ready', async () => {
      // Force DB to be null by closing it
      worker.closeDatabase();
      const handler = mockMessageHandlerRef.handler;
      if (handler) {
          await handler({ id: 2, type: 'getPendingMetadata', payload: {} });
          expect(mockPostMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
              id: 2,
              result: { success: false, error: 'DB not ready' }
          }));
      }
  });

  it('message handler - handles error during processing', async () => {
      // Force an error in getAllMetadata
      mockStatement.all.mockImplementationOnce(() => { throw new Error('Processing failed'); });

      const handler = mockMessageHandlerRef.handler;
      if (handler) {
          await handler({ id: 3, type: 'getAllMetadata', payload: {} });
          expect(mockPostMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
              id: 3,
              result: { success: false, error: 'Processing failed' }
          }));
      }
  });
});
