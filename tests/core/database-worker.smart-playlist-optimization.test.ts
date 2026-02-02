import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { parentPort } from 'worker_threads';

// Mock worker_threads
vi.mock('worker_threads');

// Import the worker once. It will attach the listener to the mocked parentPort.
import '../../src/core/database-worker';

interface WorkerMessage {
  id: number;
  result?: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
}

describe('Database Worker Optimization', () => {
  let dbPath: string;
  let tempDir: string;
  let messageId = 0;

  const safeCleanup = async () => {
    for (let i = 0; i < 10; i++) {
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
        return;
      } catch (e) {
        if (i === 9) console.warn(`Failed to clean up temp dir ${tempDir}:`, e);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  };

  beforeEach(async () => {
    const testDir = path.join(process.cwd(), 'tests', 'temp');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    tempDir = fs.mkdtempSync(path.join(testDir, 'test-db-opt-'));
    dbPath = ':memory:';

    parentPort!.removeAllListeners('workerMessage');
  });

  afterEach(async () => {
    try {
      await sendMessage('close', {});
    } catch {
      // Ignore errors during cleanup
    }
    await safeCleanup();
  });

  const sendMessage = (
    type: string,
    payload: unknown,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> => {
    const id = messageId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        parentPort!.off('workerMessage', messageHandler);
        reject(new Error(`Message ${id} (${type}) timed out`));
      }, 2000);

      const messageHandler = (message: WorkerMessage) => {
        if (message.id === id) {
          parentPort!.off('workerMessage', messageHandler);
          clearTimeout(timeout);
          resolve(
            message.result as {
              success: boolean;
              data?: unknown;
              error?: string;
            },
          );
        }
      };

      parentPort!.on('workerMessage', messageHandler);
      parentPort!.emit('message', { id, type, payload });
    });
  };

  it('executeSmartPlaylist should NOT return heavy fields (watched_segments, size, created_at)', async () => {
    await sendMessage('init', { dbPath });
    const filePath = path.join(tempDir, 'heavy.mp4');
    fs.writeFileSync(filePath, 'data');

    const heavyData = JSON.stringify(Array(100).fill({ start: 0, end: 10 }));

    // Insert full metadata
    await sendMessage('upsertMetadata', {
      filePath,
      duration: 100,
      size: 999999,
      rating: 5,
      createdAt: new Date().toISOString(),
      status: 'success',
      watchedSegments: heavyData,
    });

    const result = await sendMessage('executeSmartPlaylist', {
      criteria: '{}',
    });
    expect(result.success).toBe(true);

    const items = result.data as any[];
    expect(items.length).toBe(1);
    const item = items[0];

    // Check that necessary fields ARE present
    expect(item.file_path).toBe(filePath);
    expect(item.duration).toBe(100);
    expect(item.rating).toBe(5);

    // Check that heavy/unused fields are NOT present
    expect(item.watched_segments).toBeUndefined();
    expect(item.size).toBeUndefined();

    // created_at should be present
    expect(item.created_at).toBeDefined();
  });
});
