import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import {
  initDatabase,
  closeDatabase,
  getAllMediaViewCounts,
  getAllMetadata,
  recordMediaView,
  upsertMetadata,
  getMetadata,
} from '../../src/core/database-worker';

// Mock worker_threads since we are importing the worker file which has side effects (parentPort usage)
vi.mock('worker_threads', () => ({
  parentPort: {
    on: vi.fn(),
    postMessage: vi.fn(),
  },
  default: {},
}));

const tempDbPath = path.join(__dirname, 'temp_coverage.db');

describe('database-worker coverage (exported functions)', () => {
  beforeEach(() => {
    // Ensure clean state
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch (e) {
        // Ignore errors if file is locked (should not happen with proper closeDatabase)
      }
    }
    // Initialize with file-based DB to allow multi-connection testing (corruption)
    initDatabase(tempDbPath);
  });

  afterEach(() => {
    closeDatabase();
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch (e) {
        console.warn('Failed to cleanup temp DB:', e);
      }
    }
    vi.restoreAllMocks();
  });

  it('getAllMediaViewCounts returns empty object when no views exist', () => {
    const result = getAllMediaViewCounts();
    expect(result).toEqual({ success: true, data: {} });
  });

  it('getAllMediaViewCounts returns correct counts', async () => {
    await recordMediaView('/vid1.mp4');
    await recordMediaView('/vid1.mp4');
    await recordMediaView('/vid2.mp4');

    const result = getAllMediaViewCounts();
    expect(result).toEqual({
      success: true,
      data: {
        '/vid1.mp4': 2,
        '/vid2.mp4': 1,
      },
    });
  });

  it('getAllMetadata returns empty object when no metadata exists', () => {
    const result = getAllMetadata();
    expect(result).toEqual({ success: true, data: {} });
  });

  it('getAllMetadata returns correct metadata map', async () => {
    await upsertMetadata({
      filePath: '/vid1.mp4',
      duration: 100,
      size: 5000,
    });

    await upsertMetadata({
      filePath: '/vid2.mp4',
      rating: 5,
    });

    const result = getAllMetadata();
    const data = result.data as any;

    expect(data['/vid1.mp4']).toMatchObject({
      filePath: '/vid1.mp4',
      duration: 100,
      size: 5000,
    });
    expect(data['/vid2.mp4']).toMatchObject({
      filePath: '/vid2.mp4',
      rating: 5,
    });
  });

  it('handles database initialization errors for getAll functions', () => {
    // Close DB first to simulate uninitialized state
    closeDatabase();

    const res1 = getAllMediaViewCounts();
    expect(res1).toEqual({ success: false, error: 'Database not initialized' });

    const res2 = getAllMetadata();
    expect(res2).toEqual({ success: false, error: 'Database not initialized' });
  });

  it('recordMediaView handles empty file path via generateFileId fallback', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await recordMediaView('');

    // generateFileId catches the error and falls back to hashing the path string
    // So it should actually succeed.
    expect(result.success).toBe(true);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('getMetadata handles batching and padding', async () => {
    const result = await getMetadata(['/file1.mp4', '/file2.mp4']);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('getMetadata handles exact batch size', async () => {
    const paths = Array.from({ length: 900 }, (_, i) => `/file${i}.mp4`);
    // This will trigger the (batchIds.length === 900) branch
    const result = await getMetadata(paths);
    expect(result.success).toBe(true);
  });

  it('generateFileIdsBatched handles database query failure gracefully', async () => {
    // Open a second connection to corrupt the schema (simulate failure)
    const db2 = new Database(tempDbPath);
    // Drop the table used by generateFileIdsBatched (via getFileIdsByPathsBatch prepared statement)
    db2.exec('DROP TABLE media_metadata');
    db2.close();

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // This calls generateFileIdsBatched internally.
    // The prepared statement execution inside generateFileIdsBatched should fail
    // because the table is gone.
    const paths = Array.from({ length: 10 }, (_, i) => `/file${i}.mp4`);
    const result = await getMetadata(paths);

    // The overall operation will fail because we dropped the table, so subsequent queries in getMetadata will fail.
    // However, we are testing that generateFileIdsBatched caught its internal error (proven by the warning).
    expect(result.success).toBe(false);
    expect(result.error).toContain('no such table: media_metadata');

    // Verify that the fallback mechanism was triggered (warning logged)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to query existing file IDs'),
      expect.anything(),
    );
  });
});
