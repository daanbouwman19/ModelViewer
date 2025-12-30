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
  beforeEach(async () => {
    vi.clearAllMocks();
    workerInstances.length = 0;
    await database.closeDatabase();
  });

  afterEach(async () => {
    await database.closeDatabase();
  });

  it('initDatabase handles worker error event', async () => {
    const promise = database.initDatabase(':memory:', 'worker.js');

    // Simulate init success to resolve the promise
    const worker = workerInstances[0];
    expect(worker).toBeDefined();

    const postMessageSpy = worker.postMessage;
    // Wait for postMessage to be called
    await new Promise((resolve) => setTimeout(resolve, 10));

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
    // Init
    const initPromise = database.initDatabase(':memory:', 'worker.js');
    const worker = workerInstances[0];
    await new Promise((resolve) => setTimeout(resolve, 10));
    const initMsg = worker.postMessage.mock.calls[0][0];
    worker.emit('message', { id: initMsg.id, result: { success: true } });
    await initPromise;

    // Set short timeout
    database.setOperationTimeout(100);

    // Call an operation but don't reply from worker
    // use addMediaDirectory which throws
    const opPromise = database.addMediaDirectory('test');

    // Wait for timeout
    await expect(opPromise).rejects.toThrow('Database operation timed out');
  });

  it('sendMessageToWorker handles worker postMessage exception', async () => {
    // Init
    const initPromise = database.initDatabase(':memory:', 'worker.js');
    const worker = workerInstances[0];
    await new Promise((resolve) => setTimeout(resolve, 10));
    const initMsg = worker.postMessage.mock.calls[0][0];
    worker.emit('message', { id: initMsg.id, result: { success: true } });
    await initPromise;

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
    // Init
    const initPromise = database.initDatabase(':memory:', 'worker.js');
    const worker = workerInstances[0];
    await new Promise((resolve) => setTimeout(resolve, 10));
    const initMsg = worker.postMessage.mock.calls[0][0];
    worker.emit('message', { id: initMsg.id, result: { success: true } });
    await initPromise;

    const promise = database.addMediaDirectory({
      path: '/path/to/obj',
      name: 'ObjDir',
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
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
    // Init
    const initPromise = database.initDatabase(':memory:', 'worker.js');
    const worker = workerInstances[0];
    await new Promise((resolve) => setTimeout(resolve, 10));
    const initMsg = worker.postMessage.mock.calls[0][0];
    worker.emit('message', { id: initMsg.id, result: { success: true } });
    await initPromise;

    // Emit exit with code 1
    worker.emit('exit', 1);
  });

  it('removeMediaDirectory handles error', async () => {
    // Init
    const initPromise = database.initDatabase(':memory:', 'worker.js');
    const worker = workerInstances[0];
    await new Promise((resolve) => setTimeout(resolve, 10));
    const initMsg = worker.postMessage.mock.calls[0][0];
    worker.emit('message', { id: initMsg.id, result: { success: true } });
    await initPromise;

    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('Worker communication error');
    });

    await expect(database.removeMediaDirectory('/path')).rejects.toThrow();
  });

  it('setDirectoryActiveState handles error', async () => {
    // Init
    const initPromise = database.initDatabase(':memory:', 'worker.js');
    const worker = workerInstances[0];
    await new Promise((resolve) => setTimeout(resolve, 10));
    const initMsg = worker.postMessage.mock.calls[0][0];
    worker.emit('message', { id: initMsg.id, result: { success: true } });
    await initPromise;

    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('Worker communication error');
    });

    await expect(
      database.setDirectoryActiveState('/path', true),
    ).rejects.toThrow();
  });

  it('bulkUpsertMetadata handles error', async () => {
    // Init
    const initPromise = database.initDatabase(':memory:', 'worker.js');
    const worker = workerInstances[0];
    await new Promise((resolve) => setTimeout(resolve, 10));
    const initMsg = worker.postMessage.mock.calls[0][0];
    worker.emit('message', { id: initMsg.id, result: { success: true } });
    await initPromise;

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
    // Init
    const initPromise = database.initDatabase(':memory:', 'worker.js');
    const worker = workerInstances[0];
    await new Promise((resolve) => setTimeout(resolve, 10));
    const initMsg = worker.postMessage.mock.calls[0][0];
    worker.emit('message', { id: initMsg.id, result: { success: true } });
    await initPromise;

    // saveSetting success
    const savePromise = database.saveSetting('key', 'value');
    await new Promise((resolve) => setTimeout(resolve, 10));
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

    // Restore mock
    worker.postMessage.mockImplementation(() => {
      // do nothing
    });

    // getSetting success
    const getPromise = database.getSetting('key');
    await new Promise((resolve) => setTimeout(resolve, 10));
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
    // Init
    const initPromise = database.initDatabase(':memory:', 'worker.js');
    const worker = workerInstances[0];
    await new Promise((resolve) => setTimeout(resolve, 10));
    const initMsg = worker.postMessage.mock.calls[0][0];
    worker.emit('message', { id: initMsg.id, result: { success: true } });
    await initPromise;

    // Success
    const promise = database.getRecentlyPlayed(10);
    await new Promise((resolve) => setTimeout(resolve, 10));
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
    await expect(database.getRecentlyPlayed(10)).resolves.toEqual([]);
  });

  it('getPendingMetadata handles success and error', async () => {
    // Init
    const initPromise = database.initDatabase(':memory:', 'worker.js');
    const worker = workerInstances[0];
    await new Promise((resolve) => setTimeout(resolve, 10));
    const initMsg = worker.postMessage.mock.calls[0][0];
    worker.emit('message', { id: initMsg.id, result: { success: true } });
    await initPromise;

    // Success
    const promise = database.getPendingMetadata();
    await new Promise((resolve) => setTimeout(resolve, 10));
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
