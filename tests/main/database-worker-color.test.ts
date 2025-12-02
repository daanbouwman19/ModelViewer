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

    worker = new Worker(workerPath);

    await new Promise<void>((resolve) => {
      const onMessage = (msg: unknown) => {
        const typedMsg = msg as { type: string };
        if (typedMsg.type === 'ready') {
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

  interface WorkerResponse {
    id: number;
    result: {
      success: boolean;
      data?: unknown;
      error?: string;
    };
  }

  const sendMessage = (type: string, payload: unknown): Promise<{ success: boolean; data?: unknown; error?: string }> => {
    const id = messageId++;
    return new Promise((resolve) => {
      worker.postMessage({ id, type, payload });
      const handler = (msg: unknown) => {
        const typedMsg = msg as WorkerResponse;
        if (typedMsg.id === id) {
          worker.off('message', handler);
          resolve(typedMsg.result);
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
    expect(getRes.data as string[]).toContain(filePath);
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
    expect(redRes.data as string[]).toContain(redFile);
    expect(redRes.data as string[]).not.toContain(blueFile);
  });

  it('should identify files missing color', async () => {
    const newFile = '/path/new.jpg';

    // Record view to add it to media_views
    await sendMessage('recordMediaView', { filePath: newFile });

    const missingRes = await sendMessage('getFilesMissingColor', {});
    expect(missingRes.data as string[]).toContain(newFile);

    // Now set color
    await sendMessage('setFileColor', {
      filePath: newFile,
      color: { hex: '#fff', r: 255, g: 255, b: 255 },
    });

    const missingRes2 = await sendMessage('getFilesMissingColor', {});
    expect(missingRes2.data as string[]).not.toContain(newFile);
  });
});
