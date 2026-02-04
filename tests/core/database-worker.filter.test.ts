import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { parentPort } from 'worker_threads';

// Mock worker_threads using the __mocks__ file
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

describe('Database Worker Filter Optimization', () => {
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
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  };

  beforeEach(async () => {
    const testDir = path.join(process.cwd(), 'tests', 'temp');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    tempDir = fs.mkdtempSync(path.join(testDir, 'test-db-filter-'));
    dbPath = ':memory:';

    parentPort!.removeAllListeners('workerMessage');

    // Init DB
    await sendMessage('init', { dbPath });
  });

  afterEach(async () => {
    try {
      await sendMessage('close', {});
    } catch {
      // Ignore
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

  it('should filter out paths that are already success', async () => {
    const fileA = '/path/a.mp4';
    const fileB = '/path/b.mp4';
    const fileC = '/path/c.mp4';

    // Insert fileA as success
    await sendMessage('upsertMetadata', { filePath: fileA, status: 'success' });

    // Insert fileB as pending
    await sendMessage('upsertMetadata', { filePath: fileB, status: 'pending' });

    // fileC is not in DB

    const result = await sendMessage('filterProcessingNeeded', {
      filePaths: [fileA, fileB, fileC],
    });

    expect(result.success).toBe(true);
    const needed = result.data as string[];

    expect(needed).not.toContain(fileA); // Should be filtered out
    expect(needed).toContain(fileB); // Pending should remain
    expect(needed).toContain(fileC); // Missing should remain
  });

  it('should handle batching correctly', async () => {
    // Insert 1000 'success' files
    const filePaths: string[] = [];
    const payloads = [];
    for (let i = 0; i < 1000; i++) {
      const p = `/path/file${i}.mp4`;
      filePaths.push(p);
      payloads.push({ filePath: p, status: 'success' });
    }

    await sendMessage('bulkUpsertMetadata', payloads);

    // Query with 1005 files (5 new ones)
    const newFiles = ['/new1', '/new2', '/new3', '/new4', '/new5'];
    const allQuery = [...filePaths, ...newFiles];

    const result = await sendMessage('filterProcessingNeeded', {
      filePaths: allQuery,
    });

    expect(result.success).toBe(true);
    const needed = result.data as string[];
    expect(needed).toHaveLength(5);
    expect(needed).toEqual(expect.arrayContaining(newFiles));
  });

  it('should return empty array if all input files are success', async () => {
    const fileA = '/path/a.mp4';
    await sendMessage('upsertMetadata', { filePath: fileA, status: 'success' });

    const result = await sendMessage('filterProcessingNeeded', {
      filePaths: [fileA],
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('should return all files if none are success', async () => {
    const fileA = '/path/a.mp4';
    const fileB = '/path/b.mp4';

    const result = await sendMessage('filterProcessingNeeded', {
      filePaths: [fileA, fileB],
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([fileA, fileB]);
  });
});
