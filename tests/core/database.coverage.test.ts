import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

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
  beforeEach(async () => {
    vi.clearAllMocks();
    workerInstances.length = 0;
    await database.closeDatabase();
  });

  afterEach(async () => {
    await database.closeDatabase();
  });

  async function initTestDb() {
    const initPromise = database.initDatabase(':memory:', 'worker.js');
    const worker = workerInstances[0];
    // worker.postMessage is synchronous, no need to wait
    const initMsg = worker.postMessage.mock.calls[0][0];
    worker.emit('message', { id: initMsg.id, result: { success: true } });
    await initPromise;
    return worker;
  }

  it('initDatabase handles worker error event', async () => {
    // Provide absolute path to satisfy Node.js Worker/checks even if mocked
    const workerPath = path.resolve(__dirname, 'worker.js');
    const promise = database.initDatabase(':memory:', workerPath);

    // Simulate init success to resolve the promise
    const worker = workerInstances[0];
    expect(worker).toBeDefined();

    const postMessageSpy = worker.postMessage;
    // Removed unnecessary setTimeout

    expect(postMessageSpy).toHaveBeenCalled();
    const initMsg = postMessageSpy.mock.calls[0][0];

    worker.emit('message', {
      id: initMsg.id,
      result: { success: true },
    });

    await promise;

    // Now trigger error
    worker.emit('error', new Error('Worker Error'));
  });

  it('sendMessageToWorker handles timeout', async () => {
    await initTestDb();

    vi.useFakeTimers();
    try {
      // Set timeout
      const timeoutMs = 5000;
      database.setOperationTimeout(timeoutMs);

      // Call an operation but don't reply from worker
      // use addMediaDirectory which throws
      const opPromise = database.addMediaDirectory('test');

      // Attach handler before advancing time to avoid unhandled rejection warning
      const expectPromise = expect(opPromise).rejects.toThrow(
        'Worker operation timed out',
      );

      // Advance time
      await vi.advanceTimersByTimeAsync(timeoutMs + 100);

      // Wait for timeout
      await expectPromise;
    } finally {
      vi.useRealTimers();
    }
  });

  it('sendMessageToWorker handles worker postMessage exception', async () => {
    const worker = await initTestDb();

    // Make postMessage throw
    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('Post failure');
    });

    // use addMediaDirectory which throws on error
    await expect(database.addMediaDirectory('test')).rejects.toThrow(
      'Post failure',
    );
  });

  it('addMediaDirectory handles object payload', async () => {
    const worker = await initTestDb();

    const promise = database.addMediaDirectory({
      path: '/path/to/obj',
      name: 'ObjDir',
    });

    // Removed unnecessary setTimeout
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
    // Emit exit with code 1
    (await initTestDb()).emit('exit', 1);
  });

  it('removeMediaDirectory handles error', async () => {
    const worker = await initTestDb();

    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('Worker communication error');
    });

    await expect(database.removeMediaDirectory('/path')).rejects.toThrow();
  });

  it('setDirectoryActiveState handles error', async () => {
    const worker = await initTestDb();

    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('Worker communication error');
    });

    await expect(
      database.setDirectoryActiveState('/path', true),
    ).rejects.toThrow();
  });

  it('bulkUpsertMetadata handles error', async () => {
    const worker = await initTestDb();

    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('Worker communication error');
    });

    await expect(
      database.bulkUpsertMetadata([{ filePath: '/path' }]),
    ).rejects.toThrow();
  });

  it('updateSmartPlaylist validates input', async () => {
    await expect(database.updateSmartPlaylist(1, '', '{}')).rejects.toThrow(
      'Invalid playlist name',
    );
    await expect(database.updateSmartPlaylist(1, 'Name', '')).rejects.toThrow(
      'Invalid playlist criteria',
    );
    await expect(
      database.updateSmartPlaylist(1, 'Name', 'invalid-json'),
    ).rejects.toThrow('Criteria must be valid JSON');
  });

  it('saveSetting/getSetting handles success and error', async () => {
    const worker = await initTestDb();

    // saveSetting success
    const savePromise = database.saveSetting('key', 'value');
    // Removed unnecessary setTimeout
    const saveMsg = worker.postMessage.mock.calls.find(
      (c: any) => c[0].type === 'saveSetting',
    );
    expect(saveMsg).toBeDefined();
    worker.emit('message', {
      id: saveMsg[0].id,
      result: { success: true },
    });
    await savePromise;

    // saveSetting error
    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('Err');
    });
    await expect(database.saveSetting('key', 'val')).rejects.toThrow();

    // getSetting success
    const getPromise = database.getSetting('key');
    // Removed unnecessary setTimeout
    const getMsg = worker.postMessage.mock.calls.find(
      (c: any) => c[0].type === 'getSetting',
    );
    expect(getMsg).toBeDefined();
    worker.emit('message', {
      id: getMsg[0].id,
      result: { success: true, data: 'value' },
    });
    expect(await getPromise).toBe('value');

    // getSetting error
    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('Err');
    });
    expect(await database.getSetting('key')).toBeNull();
  });

  it('getRecentlyPlayed handles success and error', async () => {
    const worker = await initTestDb();

    // Success
    const promise = database.getRecentlyPlayed(10);
    // Removed unnecessary setTimeout
    const msg = worker.postMessage.mock.calls.find(
      (c: any) => c[0].type === 'getRecentlyPlayed',
    );
    expect(msg).toBeDefined();
    expect(msg[0].payload.limit).toBe(10);
    worker.emit('message', {
      id: msg[0].id,
      result: { success: true, data: [] },
    });
    await expect(promise).resolves.toEqual([]);

    // Error
    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('Err');
    });
    await expect(database.getRecentlyPlayed(10)).rejects.toThrow('Err');
  });

  it('getPendingMetadata handles success and error', async () => {
    const worker = await initTestDb();

    // Success
    const promise = database.getPendingMetadata();
    // Removed unnecessary setTimeout
    const msg = worker.postMessage.mock.calls.find(
      (c: any) => c[0].type === 'getPendingMetadata',
    );
    expect(msg).toBeDefined();
    worker.emit('message', {
      id: msg[0].id,
      result: { success: true, data: ['/file'] },
    });
    await expect(promise).resolves.toEqual(['/file']);

    // Error
    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('Err');
    });
    await expect(database.getPendingMetadata()).resolves.toEqual([]);
  });
});
