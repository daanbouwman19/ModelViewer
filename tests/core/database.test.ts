import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { workerInstances } = vi.hoisted(() => ({
  workerInstances: [] as any[],
}));

vi.mock('worker_threads', async () => {
  const { EventEmitter } = await import('events');
  class MockWorker extends EventEmitter {
    postMessage = vi.fn((msg: any) => {
      // Auto-reply to close to prevent teardown hangs
      if (msg && msg.type === 'close') {
        setTimeout(() => {
          this.emit('message', { id: msg.id, result: { success: true } });
        }, 0);
      }
    });
    terminate = vi.fn().mockResolvedValue(undefined);
    constructor() {
      super();
      workerInstances.push(this);
    }
  }
  return {
    Worker: MockWorker,
    default: { Worker: MockWorker },
  };
});

// Mock console
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

import * as database from '../../src/core/database';

describe('Database Core Coverage', () => {
  let worker: any;

  // Helper to init database and get the worker instance
  const initDb = async () => {
    const initPromise = database.initDatabase(':memory:', 'worker.js');
    worker = workerInstances[0];
    // Wait for worker to be created
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Simulate init success
    const initMsg = worker.postMessage.mock.calls.find(
      (c: any) => c[0].type === 'init',
    )[0];
    worker.emit('message', { id: initMsg.id, result: { success: true } });
    await initPromise;
    return worker;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    workerInstances.length = 0;
    await database.closeDatabase();
  });

  afterEach(async () => {
    await database.closeDatabase();
  });

  it('initDatabase handles worker error event', async () => {
    worker = await initDb();
    worker.emit('error', new Error('Worker Error'));
  });

  it('sendMessageToWorker handles timeout', async () => {
    await initDb();
    database.setOperationTimeout(100);

    // Call an operation but don't reply from worker
    const opPromise = database.addMediaDirectory('test');
    await expect(opPromise).rejects.toThrow('Database operation timed out');
  });

  it('sendMessageToWorker handles worker postMessage exception', async () => {
    worker = await initDb();
    // Make postMessage throw
    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('Post failure');
    });

    await expect(database.addMediaDirectory('test')).rejects.toThrow(
      'Post failure',
    );
  });

  it('addMediaDirectory handles object payload', async () => {
    worker = await initDb();

    const promise = database.addMediaDirectory({
      path: '/path/to/obj',
      name: 'ObjDir',
    });

    // Wait for message
    await new Promise((resolve) => setTimeout(resolve, 0));
    const call = worker.postMessage.mock.calls.find(
      (c: any) => c[0].type === 'addMediaDirectory',
    );
    expect(call).toBeDefined();
    expect(call[0].payload.directoryObj).toEqual({
      path: '/path/to/obj',
      name: 'ObjDir',
    });

    worker.emit('message', { id: call[0].id, result: { success: true } });
    await promise;
  });

  it('handles worker exit with error code', async () => {
    worker = await initDb();
    worker.emit('exit', 1);
  });

  // --- Tests recovered from deleted tests/main/database.coverage.test.ts ---

  it('rejects if dbWorker is not initialized', async () => {
    await database.closeDatabase();
    await expect(database.addMediaDirectory('/test/path')).rejects.toThrow(
      'Database worker not initialized',
    );
  });

  it('handles setRating errors', async () => {
    worker = await initDb();
    worker.postMessage.mockImplementationOnce((msg: any) => {
      setTimeout(() => {
        worker.emit('message', {
          id: msg.id,
          result: { success: false, error: 'Rating error' },
        });
      }, 0);
    });
    await expect(database.setRating('/file.mp4', 5)).rejects.toThrow(
      'Rating error',
    );
  });

  it('handles upsertMetadata errors', async () => {
    worker = await initDb();
    worker.postMessage.mockImplementationOnce((msg: any) => {
      setTimeout(() => {
        worker.emit('message', {
          id: msg.id,
          result: { success: false, error: 'Metadata error' },
        });
      }, 0);
    });
    await expect(
      database.upsertMetadata('/file.mp4', { size: 100 }),
    ).rejects.toThrow('Metadata error');
  });

  it('handles createSmartPlaylist errors', async () => {
    worker = await initDb();
    worker.postMessage.mockImplementationOnce((msg: any) => {
      setTimeout(() => {
        worker.emit('message', {
          id: msg.id,
          result: { success: false, error: 'Create playlist error' },
        });
      }, 0);
    });
    await expect(database.createSmartPlaylist('Test', '{}')).rejects.toThrow(
      'Create playlist error',
    );
  });

  it('handles updateSmartPlaylist errors', async () => {
    worker = await initDb();
    worker.postMessage.mockImplementationOnce((msg: any) => {
      setTimeout(() => {
        worker.emit('message', {
          id: msg.id,
          result: { success: false, error: 'Update playlist error' },
        });
      }, 0);
    });
    await expect(database.updateSmartPlaylist(1, 'Test', '{}')).rejects.toThrow(
      'Update playlist error',
    );
  });

  it('handles deleteSmartPlaylist errors', async () => {
    worker = await initDb();
    worker.postMessage.mockImplementationOnce((msg: any) => {
      setTimeout(() => {
        worker.emit('message', {
          id: msg.id,
          result: { success: false, error: 'Delete playlist error' },
        });
      }, 0);
    });
    await expect(database.deleteSmartPlaylist(1)).rejects.toThrow(
      'Delete playlist error',
    );
  });

  it('returns empty array on getSmartPlaylists error', async () => {
    worker = await initDb();
    worker.postMessage.mockImplementationOnce((msg: any) => {
      setTimeout(() => {
        worker.emit('message', {
          id: msg.id,
          result: { success: false, error: 'Get playlists error' },
        });
      }, 0);
    });
    const result = await database.getSmartPlaylists();
    expect(result).toEqual([]);
  });

  it('returns empty array on getAllMetadataAndStats error', async () => {
    worker = await initDb();
    worker.postMessage.mockImplementationOnce((msg: any) => {
      setTimeout(() => {
        worker.emit('message', {
          id: msg.id,
          result: { success: false, error: 'Get metadata error' },
        });
      }, 0);
    });
    const result = await database.getAllMetadataAndStats();
    expect(result).toEqual([]);
  });

  it('returns empty object on getMetadata error', async () => {
    worker = await initDb();
    worker.postMessage.mockImplementationOnce((msg: any) => {
      setTimeout(() => {
        worker.emit('message', {
          id: msg.id,
          result: { success: false, error: 'Get metadata error' },
        });
      }, 0);
    });
    const result = await database.getMetadata(['/file.mp4']);
    expect(result).toEqual({});
  });

  it('getMediaViewCounts should return {} on worker error', async () => {
    worker = await initDb();
    const promise = database.getMediaViewCounts(['/path/to/file.png']);
    worker.emit('error', new Error('Worker crashed'));
    await expect(promise).resolves.toEqual({});
  });

  it('getMediaViewCounts should return {} on worker exit', async () => {
    worker = await initDb();
    const promise = database.getMediaViewCounts(['/path/to/file.png']);
    worker.emit('exit', 1);
    await expect(promise).resolves.toEqual({});
  });

  it('getMediaViewCounts should return {} on timeout', async () => {
    worker = await initDb();
    vi.useFakeTimers();
    database.setOperationTimeout(100);
    const promise = database.getMediaViewCounts(['/path/to/file.png']);
    vi.advanceTimersByTime(200);
    await expect(promise).resolves.toEqual({});
    vi.useRealTimers();
  });

  it('getMediaDirectories should return [] on falsy worker response', async () => {
    worker = await initDb();
    worker.postMessage.mockImplementationOnce((msg: any) => {
      setTimeout(() => {
        worker.emit('message', {
          id: msg.id,
          result: { success: true, data: null },
        });
      }, 0);
    });
    const result = await database.getMediaDirectories();
    expect(result).toEqual([]);
  });

  it('logs warning if close message fails in non-test env', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    worker = await initDb();

    worker.postMessage.mockImplementationOnce((msg: any) => {
      if (msg.type === 'close') throw new Error('Close message failed');
    });

    await database.closeDatabase();
    // Verification is just that it doesn't throw and maybe logs (spy already mocked)

    process.env.NODE_ENV = originalNodeEnv;
  });

  it('should handle errors when terminating the worker during close', async () => {
    worker = await initDb();
    worker.terminate.mockRejectedValueOnce(new Error('Failed to terminate'));
    await database.closeDatabase();
    // Should gracefully handle it
  });

  it('rejects pending messages when worker emits an error', async () => {
    worker = await initDb();
    const promise = database.addMediaDirectory('/test');
    worker.emit('error', new Error('Worker crashed'));
    await expect(promise).rejects.toThrow('Worker crashed');
  });
});
