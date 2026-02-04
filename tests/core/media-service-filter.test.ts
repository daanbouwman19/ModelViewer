import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanDiskForAlbumsAndCache } from '../../src/core/media-service';
import * as database from '../../src/core/database';

// Mock dependencies
vi.mock('../../src/core/database', () => ({
  getMediaDirectories: vi.fn(),
  cacheAlbums: vi.fn(),
  getCachedAlbums: vi.fn(),
  getPendingMetadata: vi.fn(),
  bulkUpsertMetadata: vi.fn(),
  getMetadata: vi.fn(),
  getAllMetadata: vi.fn(),
  getSetting: vi.fn(),
  filterProcessingNeeded: vi.fn(),
}));
vi.mock('../../src/core/media-scanner');
vi.mock('../../src/core/media-handler');
vi.mock('../../src/core/media-utils', () => ({
  isDrivePath: vi.fn().mockReturnValue(false),
}));

// Mock fs/promises
vi.mock('fs/promises', () => {
  const stat = vi.fn();
  return {
    stat,
    default: { stat },
  };
});

// Mock worker_threads
const sharedState = vi.hoisted(() => ({
  postMessageCallback: null as ((msg: any) => void) | null,
  lastWorker: null as any,
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

describe('MediaService Filter Optimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    vi.unstubAllGlobals();

    // Default mocks
    vi.mocked(database.getMediaDirectories).mockResolvedValue([
      { path: '/dir', isActive: true },
    ] as any);
    vi.mocked(database.getCachedAlbums).mockResolvedValue([]);
    vi.mocked(database.getPendingMetadata).mockResolvedValue([]);
    vi.mocked(database.getMetadata).mockResolvedValue({});
    vi.mocked(database.getAllMetadata).mockResolvedValue({});
    vi.mocked(database.filterProcessingNeeded).mockImplementation(
      async (paths) => paths,
    );

    sharedState.postMessageCallback = null;
    sharedState.lastWorker = null;
  });

  it('should call filterProcessingNeeded with all found paths', async () => {
    // Setup worker response with albums
    const albums = [
      {
        id: '1',
        textures: [{ path: '/a.mp4' }, { path: '/b.mp4' }],
        children: [
          {
            id: '2',
            textures: [{ path: '/c.mp4' }],
            children: [],
          },
        ],
      },
    ];

    // Setup worker mocking
    let msgId: string | undefined;
    const postMessagePromise = new Promise<void>((resolve) => {
      sharedState.postMessageCallback = (msg: any) => {
        msgId = msg.id;
        resolve();
      };
    });

    const promise = scanDiskForAlbumsAndCache('/ffmpeg');
    await postMessagePromise;

    // Simulate worker response
    const onMessage = sharedState.lastWorker.on.mock.calls.find(
      (c: any) => c[0] === 'message',
    )?.[1];

    if (onMessage && msgId !== undefined) {
      onMessage({
        id: msgId,
        result: { success: true, data: albums },
      });
    }

    await promise;

    // Wait for async background task
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify filterProcessingNeeded was called with all paths
    expect(database.filterProcessingNeeded).toHaveBeenCalledWith(
      expect.arrayContaining(['/a.mp4', '/b.mp4', '/c.mp4']),
    );
  });

  it('should only pass needed paths to extractAndSaveMetadata', async () => {
    // Setup worker response
    const albums = [
      {
        id: '1',
        textures: [{ path: '/success.mp4' }, { path: '/new.mp4' }],
        children: [],
      },
    ];

    // Setup filterProcessingNeeded to return only new.mp4
    vi.mocked(database.filterProcessingNeeded).mockResolvedValue(['/new.mp4']);

    // Setup worker mocking
    let msgId: string | undefined;
    const postMessagePromise = new Promise<void>((resolve) => {
      sharedState.postMessageCallback = (msg: any) => {
        msgId = msg.id;
        resolve();
      };
    });

    const promise = scanDiskForAlbumsAndCache('/ffmpeg');
    await postMessagePromise;

    // Simulate worker response
    const onMessage = sharedState.lastWorker.on.mock.calls.find(
      (c: any) => c[0] === 'message',
    )?.[1];

    if (onMessage && msgId !== undefined) {
      onMessage({
        id: msgId,
        result: { success: true, data: albums },
      });
    }

    await promise;
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify database.getMetadata (called by extractAndSaveMetadata)
    // It should be called with only /new.mp4, NOT /success.mp4
    expect(database.getMetadata).toHaveBeenCalledWith(
      expect.arrayContaining(['/new.mp4']),
    );
    expect(database.getMetadata).not.toHaveBeenCalledWith(
      expect.arrayContaining(['/success.mp4']),
    );
  });
});
