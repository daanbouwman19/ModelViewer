import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Worker } from 'worker_threads';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

// Helper to get absolute path to worker
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerPath = path.resolve(__dirname, '../../src/core/database-worker.ts');

describe('database-worker integration coverage', () => {
  let worker: Worker;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = path.join(process.cwd(), `test-db-${Date.now()}-${Math.random().toString(36).substring(7)}.sqlite`);

    // We need to run the TS worker. Since we are in a test env that supports TS (via vitest/tsx),
    // we might need to use execArgv to handle imports if we were running plain node.
    // But specific to this project configuration, let's try running it.
    // If it fails due to TS, we might need a loader.
    // Assuming the project uses tsx or similar loader for tests.

    worker = new Worker(workerPath, {
        execArgv: ['--import', 'tsx/esm']
    });

    await new Promise<void>((resolve, reject) => {
      worker.on('message', (msg) => {
        if (msg.type === 'ready') resolve();
      });
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
      });
    });

    // Init DB
    await sendMessage(worker, 'init', { dbPath });
  });

  afterEach(async () => {
    if (worker) {
      await worker.terminate();
    }
    try {
      await fs.unlink(dbPath);
    } catch {
      // ignore
    }
    try {
        await fs.unlink(`${dbPath}-wal`);
        await fs.unlink(`${dbPath}-shm`);
    } catch {
        // ignore
    }
  });

  function sendMessage(worker: Worker, type: string, payload: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substring(7);
      const handler = (msg: any) => {
        if (msg.id === id) {
          worker.off('message', handler);
          worker.off('error', errorHandler);
          if (msg.result.success) {
            resolve(msg.result.data);
          } else {
            reject(new Error(msg.result.error));
          }
        }
      };
      const errorHandler = (err: Error) => {
        worker.off('message', handler);
        worker.off('error', errorHandler);
        reject(err);
      };

      worker.on('message', handler);
      worker.on('error', errorHandler);
      worker.postMessage({ id, type, payload });
    });
  }

  it('getAllMediaViewCounts returns empty object when no views exist', async () => {
    const result = await sendMessage(worker, 'getAllMediaViewCounts');
    expect(result).toEqual({});
  });

  it('getAllMediaViewCounts returns correct counts', async () => {
    await sendMessage(worker, 'recordMediaView', { filePath: '/vid1.mp4' });
    await sendMessage(worker, 'recordMediaView', { filePath: '/vid1.mp4' }); // count 2
    await sendMessage(worker, 'recordMediaView', { filePath: '/vid2.mp4' }); // count 1

    const result = await sendMessage(worker, 'getAllMediaViewCounts');
    expect(result).toEqual({
      '/vid1.mp4': 2,
      '/vid2.mp4': 1,
    });
  });

  it('getAllMetadata returns empty object when no metadata exists', async () => {
    const result = await sendMessage(worker, 'getAllMetadata');
    expect(result).toEqual({});
  });

  it('getAllMetadata returns correct metadata map', async () => {
    await sendMessage(worker, 'upsertMetadata', {
        filePath: '/vid1.mp4',
        duration: 100,
        size: 5000
    });

    await sendMessage(worker, 'upsertMetadata', {
        filePath: '/vid2.mp4',
        rating: 5
    });

    const result = await sendMessage(worker, 'getAllMetadata');

    expect(result['/vid1.mp4']).toMatchObject({
        file_path: '/vid1.mp4',
        duration: 100,
        size: 5000
    });
    expect(result['/vid2.mp4']).toMatchObject({
        file_path: '/vid2.mp4',
        rating: 5
    });
  });

  // Note: We can't easily test "Database not initialized" here because we init in beforeEach.
  // But this covers the happy paths which are the new code.
});
