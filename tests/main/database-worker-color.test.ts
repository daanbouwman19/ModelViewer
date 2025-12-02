import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Worker } from 'worker_threads';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('Database Worker - Color Features', () => {
  let worker: Worker;
  let tmpDbPath: string;
  let messageId = 0;

  beforeEach(async () => {
    tmpDbPath = path.join(os.tmpdir(), `test-db-${Date.now()}.sqlite`);
    const workerPath = path.resolve(
      __dirname,
      '../../src/main/database-worker.ts',
    );

    // In Vitest, running TS directly is supported via configuration, but we might need
    // to rely on `execArgv` if the worker is spawned in a new process that doesn't share
    // the test runner's loader.
    // However, looking at the project structure, `electron-vite` is used.
    // Vitest uses `vite-node` or similar.
    // Let's try standard spawning. If it fails with "unknown extension", we need a loader.
    // The previous error was "Cannot find package 'tsx'".

    // Let's assume for now we can test this by importing the worker code directly if we refactor,
    // but refactoring is intrusive.

    // Alternative: Use the JS file if it exists? No, it's not built yet.

    // Let's try to pass the loader via execArgv if we can find where `tsx` or `ts-node` is.
    // But we don't have `tsx` in dependencies. We have `typescript` and `electron-vite`.

    // The previous test `database-worker.test.ts` uses:
    // worker = new Worker(path.resolve(__dirname, '../../src/main/database-worker.ts'));
    // Does it work? Let's assume it relies on Vitest's magic or the environment.
    // Wait, the error `Cannot find package 'tsx'` suggests something is trying to use it.
    // Did I add it? No.

    // Let's try to just use the worker without execArgv first, like the original test.
    worker = new Worker(workerPath);

    await new Promise<void>((resolve) => {
      // The worker sends 'ready' when it starts if parentPort is present.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onMessage = (msg: any) => {
        if (msg.type === 'ready') {
          worker.off('message', onMessage);
          resolve();
        }
      };
      worker.on('message', onMessage);
    });

    // Init DB
    await sendMessage('init', { dbPath: tmpDbPath });
  });

  afterEach(async () => {
    await worker.terminate();
    if (fs.existsSync(tmpDbPath)) {
      try {
        fs.unlinkSync(tmpDbPath);
      } catch {
        // ignore
      }
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sendMessage = (type: string, payload: any): Promise<any> => {
    const id = messageId++;
    return new Promise((resolve) => {
      worker.postMessage({ id, type, payload });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (msg: any) => {
        if (msg.id === id) {
          worker.off('message', handler);
          resolve(msg.result);
        }
      };
      worker.on('message', handler);
    });
  };

  it('should store and retrieve file colors', async () => {
    const filePath = '/path/to/image.jpg';
    const color = { hex: '#ff0000', r: 255, g: 0, b: 0 };

    // Set color
    const setRes = await sendMessage('setFileColor', { filePath, color });
    expect(setRes.success).toBe(true);

    // Get by color (exact match)
    const getRes = await sendMessage('getMediaByColor', {
      r: 255,
      g: 0,
      b: 0,
      threshold: 10,
    });
    expect(getRes.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getRes.data as any[]).toContain(filePath);
  });

  it('should filter by color threshold', async () => {
    const redFile = '/path/red.jpg';
    const blueFile = '/path/blue.jpg';

    await sendMessage('setFileColor', {
      filePath: redFile,
      color: { hex: '#ff0000', r: 255, g: 0, b: 0 },
    });
    await sendMessage('setFileColor', {
      filePath: blueFile,
      color: { hex: '#0000ff', r: 0, g: 0, b: 255 },
    });

    // Search for Red
    const redRes = await sendMessage('getMediaByColor', {
      r: 255,
      g: 0,
      b: 0,
      threshold: 50,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(redRes.data as any[]).toContain(redFile);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(redRes.data as any[]).not.toContain(blueFile);
  });

  it('should identify files missing color', async () => {
    const newFile = '/path/new.jpg';

    // Record view to add it to media_views
    await sendMessage('recordMediaView', { filePath: newFile });

    const missingRes = await sendMessage('getFilesMissingColor', {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(missingRes.data as any[]).toContain(newFile);

    // Now set color
    await sendMessage('setFileColor', {
      filePath: newFile,
      color: { hex: '#fff', r: 255, g: 255, b: 255 },
    });

    const missingRes2 = await sendMessage('getFilesMissingColor', {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(missingRes2.data as any[]).not.toContain(newFile);
  });
});
