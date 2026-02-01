import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scanDiskForAlbumsAndCache,
  getAlbumsWithViewCounts,
} from '../../src/core/media-service';
import * as database from '../../src/core/database';
import fs from 'fs/promises';
import { isDrivePath } from '../../src/core/media-utils';

// Mock dependencies
vi.mock('../../src/core/database', () => ({
  getMediaDirectories: vi.fn(),
  cacheAlbums: vi.fn(),
  getCachedAlbums: vi.fn(),
  getAllMediaViewCounts: vi.fn(),
  getAllMetadata: vi.fn(),
  getAllMetadataStats: vi.fn(),
  getPendingMetadata: vi.fn(),
  bulkUpsertMetadata: vi.fn(),
  getMetadata: vi.fn().mockResolvedValue({}),
  getSetting: vi.fn(),
}));
vi.mock('../../src/core/media-scanner');
vi.mock('../../src/core/media-handler');
vi.mock('../../src/core/media-utils');

vi.mock('fs/promises', () => {
  const stat = vi.fn();
  return {
    stat,
    default: { stat },
  };
});

// Shared state for mocks
const sharedState = vi.hoisted(() => ({
  lastWorker: null as any,
  postMessageCallback: null as ((msg: any) => void) | null,
}));

vi.mock('worker_threads', () => {
  const Worker = vi.fn(function (this: any) {
    this.on = vi.fn();
    this.postMessage = vi.fn((msg) => {
      if (sharedState.postMessageCallback) {
        sharedState.postMessageCallback(msg);
      }
    });
    this.terminate = vi.fn().mockResolvedValue(0);
    this.removeAllListeners = vi.fn();
    sharedState.lastWorker = this;
  });
  return {
    Worker,
    default: { Worker },
    __esModule: true,
  };
});

describe('media-service recursion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    vi.unstubAllGlobals();

    // Default mocks
    vi.mocked(database.getMetadata).mockResolvedValue({});
    vi.mocked(database.getAllMetadata).mockResolvedValue({});
    vi.mocked(database.getAllMetadataStats).mockResolvedValue({});

    sharedState.lastWorker = null;
    sharedState.postMessageCallback = null;

    if (vi.isMockFunction(isDrivePath)) {
      vi.mocked(isDrivePath).mockImplementation((path) =>
        path.startsWith('gdrive://'),
      );
    }
  });

  describe('getAlbumsWithViewCounts', () => {
    it('should attach view counts and metadata to nested files', async () => {
      const nestedAlbum = {
        id: 'child',
        name: 'Child',
        textures: [{ path: '/child/file.mp4', name: 'file.mp4' }],
        children: [],
      };

      const rootAlbum = {
        id: 'root',
        name: 'Root',
        textures: [],
        children: [nestedAlbum],
      };

      vi.mocked(database.getCachedAlbums).mockResolvedValue([rootAlbum] as any);
      vi.mocked(database.getAllMediaViewCounts).mockResolvedValue({
        '/child/file.mp4': 42,
      });
      vi.mocked(database.getAllMetadataStats).mockResolvedValue({
        '/child/file.mp4': { duration: 120, status: 'success' } as any,
      });

      const result = await getAlbumsWithViewCounts();

      // Check root child
      const childResult = result[0].children[0];
      const fileResult = childResult.textures[0];

      // This expectation fails if recursion is missing
      expect(fileResult.viewCount).toBe(42);
      expect(fileResult.duration).toBe(120);
    });
  });

  // Note: Testing scanDiskForAlbumsAndCache for internal logic (passed to extractAndSaveMetadata)
  // is harder because it's a side effect. But we can spy on extractAndSaveMetadata if we could export it or mock it.
  // Since we are testing internal implementation details of scanDiskForAlbumsAndCache,
  // maybe we can infer it from what bulkUpsertMetadata receives?
  // But scanDiskForAlbumsAndCache calls extractAndSaveMetadata which calls bulkUpsertMetadata.

  // We can't easily mock extractAndSaveMetadata because it's in the same file.
  // But we can spy on database.bulkUpsertMetadata.

  describe('scanDiskForAlbumsAndCache recursion', () => {
    it('should extract metadata for nested files', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/d', isActive: true },
      ] as any);

      const nestedAlbum = {
        id: 'child',
        textures: [{ path: '/child/video.mp4' }],
        children: [],
      };
      const rootAlbum = {
        id: 'root',
        textures: [],
        children: [nestedAlbum],
      };

      vi.mocked(database.getPendingMetadata).mockResolvedValue([]);

      // Setup worker response
      let msgId: string | undefined;
      const postMessagePromise = new Promise<void>((resolve) => {
        sharedState.postMessageCallback = (msg: any) => {
          msgId = msg.id;
          resolve();
        };
      });

      const promise = scanDiskForAlbumsAndCache('ffmpeg');
      await postMessagePromise;

      const onMessage = sharedState.lastWorker.on.mock.calls.find(
        (c: any) => c[0] === 'message',
      )?.[1];

      if (onMessage && msgId !== undefined) {
        onMessage({
          id: msgId,
          result: { success: true, data: [rootAlbum] },
        });
      }

      await promise;

      // Wait for async background work
      await new Promise((resolve) => setTimeout(resolve, 50));

      // If recursion is missing, this will fail because only root textures are checked
      // Currently the code only maps root.textures
      expect(database.bulkUpsertMetadata).toHaveBeenCalled();
      // We expect fs.stat or bulkUpsert to have been called for /child/video.mp4
      // Since fs.stat is mocked...
      expect(fs.stat).toHaveBeenCalledWith('/child/video.mp4');
    });
  });
});
