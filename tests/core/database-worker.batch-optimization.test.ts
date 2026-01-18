import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

// Hoist the mock function so it can be used in vi.mock
const { mockStat } = vi.hoisted(() => {
  return { mockStat: vi.fn() };
});

// Mock fs/promises
vi.mock('fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    default: {
      ...actual,
      stat: mockStat,
    },
    stat: mockStat,
  };
});

import {
  initDatabase,
  closeDatabase,
  upsertMetadata,
  getMetadata,
  bulkUpsertMetadata,
} from '../../src/core/database-worker';

// Mock worker_threads
vi.mock('worker_threads', () => ({
  parentPort: {
    on: vi.fn(),
    postMessage: vi.fn(),
  },
  default: {},
}));

describe('database-worker batch optimization', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(process.cwd(), `test-db-batch-${Date.now()}.sqlite`);
    initDatabase(dbPath);
    mockStat.mockClear();
    // Use implementation that varies by path to ensure unique fileIds
    mockStat.mockImplementation(async (p: any) => ({
      size: 1000 + (p ? p.length : 0),
      mtime: new Date(),
      isFile: () => true,
    }));
  });

  afterEach(async () => {
    closeDatabase();
    // Clean up using actual fs
    const realFs =
      await vi.importActual<typeof import('fs/promises')>('fs/promises');
    try {
      await realFs.unlink(dbPath);
    } catch {
      // ignore
    }
    try {
      await realFs.unlink(`${dbPath}-wal`);
      await realFs.unlink(`${dbPath}-shm`);
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
  });

  it('getMetadata: should skip fs.stat for files already in database', async () => {
    const file1 = '/path/to/existing1.mp4';
    const file2 = '/path/to/existing2.mp4';

    // 1. Seed database
    // This will call fs.stat internally as they are new
    await upsertMetadata({ filePath: file1, size: 100 });
    await upsertMetadata({ filePath: file2, size: 200 });

    expect(mockStat).toHaveBeenCalledTimes(2);
    mockStat.mockClear();

    // 2. Fetch metadata for existing files
    const result = await getMetadata([file1, file2]);

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty(file1);
    expect(result.data).toHaveProperty(file2);

    // CRITICAL CHECK: fs.stat should NOT have been called
    expect(mockStat).toHaveBeenCalledTimes(0);
  });

  it('getMetadata: should call fs.stat only for new files', async () => {
    const existing = '/path/to/existing.mp4';
    const newFile = '/path/to/new.mp4';

    await upsertMetadata({ filePath: existing, size: 100 });
    mockStat.mockClear();

    // Fetch mixed
    const result = await getMetadata([existing, newFile]);

    expect(result.success).toBe(true);

    // Should call stat ONLY for newFile
    expect(mockStat).toHaveBeenCalledTimes(1);
    expect(mockStat).toHaveBeenCalledWith(newFile);
  });

  it('bulkUpsertMetadata: should use batched ID lookup', async () => {
    const file1 = '/batch/1.mp4';
    const file2 = '/batch/2.mp4';

    await upsertMetadata({ filePath: file1 });
    mockStat.mockClear();

    // Bulk upsert mixed
    const payloads = [
      { filePath: file1, rating: 5 },
      { filePath: file2, rating: 3 },
    ];

    const result = await bulkUpsertMetadata(payloads);
    expect(result.success).toBe(true);

    // Should only stat file2
    expect(mockStat).toHaveBeenCalledTimes(1);
    expect(mockStat).toHaveBeenCalledWith(file2);
  });

  it('generateFileIdsBatched handles batching correctly', async () => {
    const files = Array.from({ length: 60 }, (_, i) => `/batch/io/${i}.mp4`);

    const result = await getMetadata(files);
    expect(result.success).toBe(true);
    // All new, so all stat
    expect(mockStat).toHaveBeenCalledTimes(60);
  });

  it('generateFileIdsBatched handles exact batch size (900)', async () => {
    // 900 items to trigger the "full batch" branch
    const files = Array.from({ length: 900 }, (_, i) => `/batch/full/${i}.mp4`);

    // We expect it to NOT crash and to attempt to stat all of them (since they are new)
    const result = await getMetadata(files);
    expect(result.success).toBe(true);
    expect(mockStat).toHaveBeenCalledTimes(900);
  });
});
