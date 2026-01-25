import { describe, it, expect, beforeEach } from 'vitest';
import {
  initDatabase,
  upsertMetadata,
  recordMediaView,
  executeSmartPlaylist,
  closeDatabase,
} from '../../src/core/database-worker';

describe('Database Worker Optimization', () => {
  beforeEach(() => {
    // Re-init DB for each test to clear state
    initDatabase(':memory:');
  });

  it('should verify behavior of executeSmartPlaylist regarding ghost files', async () => {
    const validPath = '/valid.mp4';
    const ghostPath = '/ghost.mp4';

    // 1. Insert valid file with metadata
    await upsertMetadata({
      filePath: validPath,
      duration: 100,
      size: 1000,
      createdAt: new Date().toISOString(),
      status: 'success',
    });

    // 2. Insert ghost file (viewed but no metadata)
    await recordMediaView(ghostPath);

    // 3. Execute smart playlist (get all metadata + stats)
    const result = await executeSmartPlaylist();
    expect(result.success).toBe(true);

    const items = result.data as any[];

    // Check what we have
    const validItem = items.find((i) => i.file_path === validPath);
    const ghostItem = items.find((i) => i.file_path === ghostPath);

    expect(validItem).toBeDefined();

    // OPTIMIZED BEHAVIOR: Ghost items are NOT returned (we only want library files)
    expect(ghostItem).toBeUndefined();

    // Cleanup
    closeDatabase();
  });
});
