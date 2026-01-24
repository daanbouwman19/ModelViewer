import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initDatabase,
  closeDatabase,
  getAllMediaViewCounts,
  getAllMetadata,
  recordMediaView,
  upsertMetadata,
} from '../../src/core/database-worker';

// Mock worker_threads since we are importing the worker file which has side effects (parentPort usage)
vi.mock('worker_threads', () => ({
  parentPort: {
    on: vi.fn(),
    postMessage: vi.fn(),
  },
  default: {},
}));

describe('database-worker coverage (exported functions)', () => {
  beforeEach(() => {
    initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase();
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
      file_path: '/vid1.mp4',
      duration: 100,
      size: 5000,
    });
    expect(data['/vid2.mp4']).toMatchObject({
      file_path: '/vid2.mp4',
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
});
