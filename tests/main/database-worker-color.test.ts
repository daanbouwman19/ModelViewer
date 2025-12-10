import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { parentPort } from 'worker_threads';

vi.mock('worker_threads');

// Import the worker code directly.
// In Vitest, this will execute the code in the same process/context as the test,
// allowing us to assert on the behavior using the mocked parentPort.
import '../../src/core/database-worker';

describe('Database Worker - Color Features', () => {
  let tmpDbPath: string;
  let messageId = 0;

  // Helper to send message and wait for response
  const sendMessage = (
    type: string,
    payload: unknown,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> => {
    const id = messageId++;
    return new Promise((resolve) => {
      const handler = (msg: any) => {
        if (msg.id === id) {
          parentPort!.off('workerMessage', handler);
          resolve(msg.result);
        }
      };
      parentPort!.on('workerMessage', handler);
      parentPort!.emit('message', { id, type, payload });
    });
  };

  beforeEach(async () => {
    tmpDbPath = path.join(os.tmpdir(), `test-db-${Date.now()}.sqlite`);

    // Initialize DB
    await sendMessage('init', { dbPath: tmpDbPath });
  });

  afterEach(async () => {
    await sendMessage('close', {});
    if (fs.existsSync(tmpDbPath)) {
      try {
        fs.unlinkSync(tmpDbPath);
      } catch {
        // ignore
      }
    }
  });

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

    // Record view to add it to media_views (which is where candidates come from?)
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
