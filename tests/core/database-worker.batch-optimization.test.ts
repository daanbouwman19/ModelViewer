import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';

// Mock worker_threads
vi.mock('worker_threads', () => ({
  parentPort: {
    on: vi.fn(),
    postMessage: vi.fn(),
  },
  default: {},
}));

import {
  initDatabase,
  closeDatabase,
  upsertMetadata,
  getMetadata,
  bulkUpsertMetadata,
} from '../../src/core/database-worker';

describe('database-worker batch optimization', () => {
  let dbPath: string;
  let statSpy: any;

  beforeEach(() => {
    dbPath = path.join(process.cwd(), `test-db-batch-${Date.now()}.sqlite`);
    initDatabase(dbPath);

    // Spy on fs.stat
    // Note: Since fs is imported as default from 'fs/promises', we spy on default export if possible.
    // However, fs/promises is usually a module.
    // Ideally we spy on fs.stat.
    // If this fails, we might need to spy on the module export.
    let statCounter = 0;
    statSpy = vi.spyOn(fs, 'stat').mockImplementation(
      async (p: any) =>
        ({
          size: 1000 + (p ? p.length : 0),
          // Ensure unique mtime to avoid ID collisions in tests
          mtime: new Date(Date.now() + statCounter++ * 1000),
          isFile: () => true,
        }) as any,
    );
  });

  afterEach(async () => {
    closeDatabase();
    if (statSpy) statSpy.mockRestore();

    // Clean up using actual fs
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
    vi.restoreAllMocks();
  });

  it('getMetadata: should skip fs.stat for files already in database', async () => {
    const file1 = '/path/to/existing1.mp4';
    const file2 = '/path/to/existing2.mp4';

    await upsertMetadata({ filePath: file1, size: 100 });
    await upsertMetadata({ filePath: file2, size: 200 });

    expect(statSpy).toHaveBeenCalledTimes(2);
    statSpy.mockClear();

    const result = await getMetadata([file1, file2]);

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty(file1);
    expect(result.data).toHaveProperty(file2);

    expect(statSpy).toHaveBeenCalledTimes(0);
  });

  it('getMetadata: should call fs.stat only for new files', async () => {
    const existing = '/path/to/existing.mp4';
    const newFile = '/path/to/new.mp4';

    await upsertMetadata({ filePath: existing, size: 100 });
    statSpy.mockClear();

    const result = await getMetadata([existing, newFile]);

    expect(result.success).toBe(true);

    expect(statSpy).toHaveBeenCalledTimes(1);
    expect(statSpy).toHaveBeenCalledWith(newFile);
  });

  it('bulkUpsertMetadata: should use batched ID lookup', async () => {
    const file1 = '/batch/1.mp4';
    const file2 = '/batch/2.mp4';

    await upsertMetadata({ filePath: file1 });
    statSpy.mockClear();

    const payloads = [
      { filePath: file1, rating: 5 },
      { filePath: file2, rating: 3 },
    ];

    const result = await bulkUpsertMetadata(payloads);
    expect(result.success).toBe(true);

    expect(statSpy).toHaveBeenCalledTimes(1);
    expect(statSpy).toHaveBeenCalledWith(file2);
  });

  it('generateFileIdsBatched handles batching correctly', async () => {
    const files = Array.from({ length: 60 }, (_, i) => `/batch/io/${i}.mp4`);

    const result = await getMetadata(files);
    expect(result.success).toBe(true);
    expect(statSpy).toHaveBeenCalledTimes(60);
  });

  it('generateFileIdsBatched handles exact batch size (900)', async () => {
    const files = Array.from({ length: 900 }, (_, i) => `/batch/full/${i}.mp4`);

    const result = await getMetadata(files);
    expect(result.success).toBe(true);
    expect(statSpy).toHaveBeenCalledTimes(900);
  });
});
