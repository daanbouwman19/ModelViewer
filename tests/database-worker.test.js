import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Worker } from 'worker_threads';
import path from 'path';
import fs from 'fs';

// Resolve the path to the worker script.
// Using a relative path to the project root.
const workerPath = path.resolve(process.cwd(), 'src/main/database-worker.js');

describe('Database Worker', () => {
  let worker;
  let dbPath;
  let tempDir;
  let messageId = 0;

  beforeEach(async () => {
    // Create a temporary directory for the test database
    const testDir = path.join(process.cwd(), 'tests', 'temp');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir);
    }
    tempDir = fs.mkdtempSync(path.join(testDir, 'test-db-'));
    dbPath = path.join(tempDir, 'test.sqlite');

    worker = new Worker(workerPath);

    // Wait for the worker to signal it's ready
    await new Promise((resolve) => {
      worker.once('message', (message) => {
        if (message.type === 'ready') {
          resolve();
        }
      });
    });
  });

  afterEach(async () => {
    if (worker) {
      await worker.terminate();
    }
    // Clean up the temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // Helper to send a message and get a reply
  const sendMessage = (type, payload) => {
    const id = messageId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Message ${id} (${type}) timed out`));
      }, 2000);

      const messageHandler = ({ id: responseId, result }) => {
        if (responseId === id) {
          worker.removeListener('message', messageHandler);
          clearTimeout(timeout);
          if (result && result.success) {
            resolve(result);
          } else {
            reject(new Error(result ? result.error : 'Unknown error'));
          }
        }
      };

      worker.on('message', messageHandler);
      worker.postMessage({ id, type, payload });
    });
  };

  it('should exist', () => {
    expect(worker).toBeDefined();
  });

  it('should initialize the database', async () => {
    const result = await sendMessage('init', { dbPath });
    expect(result.success).toBe(true);
  });

  it('should close the database', async () => {
    await sendMessage('init', { dbPath });
    const result = await sendMessage('close', {});
    expect(result.success).toBe(true);
  });

  it('should record a media view', async () => {
    await sendMessage('init', { dbPath });
    const result = await sendMessage('recordMediaView', {
      filePath: 'test/file.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('should get media view counts', async () => {
    await sendMessage('init', { dbPath });
    await sendMessage('recordMediaView', { filePath: 'test/file.jpg' });
    await sendMessage('recordMediaView', { filePath: 'test/file.jpg' });
    const result = await sendMessage('getMediaViewCounts', {
      filePaths: ['test/file.jpg'],
    });
    expect(result.success).toBe(true);
    expect(result.data['test/file.jpg']).toBe(2);
  });

  it('should cache models', async () => {
    await sendMessage('init', { dbPath });
    const models = [{ id: 1, name: 'test' }];
    const result = await sendMessage('cacheModels', {
      cacheKey: 'test-key',
      models,
    });
    expect(result.success).toBe(true);
  });

  it('should get cached models', async () => {
    await sendMessage('init', { dbPath });
    const models = [{ id: 1, name: 'test' }];
    await sendMessage('cacheModels', { cacheKey: 'test-key', models });
    const result = await sendMessage('getCachedModels', {
      cacheKey: 'test-key',
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(models);
  });

  it('should add a media directory', async () => {
    await sendMessage('init', { dbPath });
    const result = await sendMessage('addMediaDirectory', {
      directoryPath: '/test/directory',
    });
    expect(result.success).toBe(true);
  });

  it('should get media directories', async () => {
    await sendMessage('init', { dbPath });
    await sendMessage('addMediaDirectory', {
      directoryPath: '/test/directory',
    });
    const result = await sendMessage('getMediaDirectories', {});
    expect(result.success).toBe(true);
    expect(result.data).toEqual([{ path: '/test/directory', isActive: true }]);
  });

  it('should remove a media directory', async () => {
    await sendMessage('init', { dbPath });
    await sendMessage('addMediaDirectory', {
      directoryPath: '/test/directory',
    });
    const result = await sendMessage('removeMediaDirectory', {
      directoryPath: '/test/directory',
    });
    expect(result.success).toBe(true);
    const result2 = await sendMessage('getMediaDirectories', {});
    expect(result2.data).toEqual([]);
  });

  it('should set directory active state', async () => {
    await sendMessage('init', { dbPath });
    await sendMessage('addMediaDirectory', {
      directoryPath: '/test/directory',
    });
    const result = await sendMessage('setDirectoryActiveState', {
      directoryPath: '/test/directory',
      isActive: false,
    });
    expect(result.success).toBe(true);
    const result2 = await sendMessage('getMediaDirectories', {});
    expect(result2.data).toEqual([
      { path: '/test/directory', isActive: false },
    ]);
  });
});
