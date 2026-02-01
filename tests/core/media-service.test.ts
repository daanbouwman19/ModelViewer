import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scanDiskForAlbumsAndCache,
  getAlbumsFromCacheOrDisk,
  getAlbumsWithViewCountsAfterScan,
  getAlbumsWithViewCounts,
  extractAndSaveMetadata,
} from '../../src/core/media-service';
import * as database from '../../src/core/database';
import * as mediaHandler from '../../src/core/media-handler';
import fs from 'fs/promises';
import { Worker } from 'worker_threads';
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
vi.mock('../../src/core/media-utils'); // Auto-mock

vi.mock('fs/promises', () => {
  const stat = vi.fn();
  return {
    stat,
    default: { stat },
  };
});

// Shared state for all mocks and tests
const sharedState = vi.hoisted(() => ({
  lastWorker: null as any,
  isPackaged: false,
  postMessageCallback: null as ((msg: any) => void) | null,
}));

vi.mock('electron', () => {
  return {
    app: {
      get isPackaged() {
        return sharedState.isPackaged;
      },
      getPath: vi.fn().mockReturnValue('/tmp'),
    },
    default: {
      get app() {
        return {
          get isPackaged() {
            return sharedState.isPackaged;
          },
          getPath: vi.fn().mockReturnValue('/tmp'),
        };
      },
    },
    __esModule: true,
  };
});

// Use a function that acts as a constructor and is a spy
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

describe('media-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    vi.unstubAllGlobals(); // Ensure globals are clean from previous tests
    vi.mocked(database.getMetadata).mockResolvedValue({});
    vi.mocked(database.getAllMetadata).mockResolvedValue({});
    vi.mocked(database.getAllMetadataStats).mockResolvedValue({});

    // Explicitly ensure process.versions.electron is undefined to match "web" env by default
    // We cannot easily delete from existing process.versions if we don't stub the whole process.
    // So we stub it to a safe default here.
    vi.stubGlobal('process', {
      ...process,
      versions: { ...process.versions, electron: undefined },
    });

    sharedState.lastWorker = null;
    sharedState.isPackaged = false;
    sharedState.postMessageCallback = null;
    // Default mock behavior for isDrivePath
    if (vi.isMockFunction(isDrivePath)) {
      vi.mocked(isDrivePath).mockImplementation((path) =>
        path.startsWith('gdrive://'),
      );
    }
  });

  describe('scanDiskForAlbumsAndCache', () => {
    it('returns empty list if no active directories', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/dir1', isActive: false },
      ] as any);

      const result = await scanDiskForAlbumsAndCache();
      expect(result).toEqual([]);
      expect(database.cacheAlbums).toHaveBeenCalledWith([]);
      expect(Worker).not.toHaveBeenCalled();
    });

    it('uses correct worker path in packaged app', async () => {
      vi.stubGlobal('process', {
        ...process,
        versions: { ...process.versions, electron: '30.0.0' },
      });
      sharedState.isPackaged = true;
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/dir', isActive: true },
      ] as any);

      let msgId: string | undefined;
      const postMessagePromise = new Promise<void>((resolve) => {
        sharedState.postMessageCallback = (msg: any) => {
          msgId = msg.id;
          resolve();
        };
      });

      const promise = scanDiskForAlbumsAndCache();

      await postMessagePromise;

      const onMessage = sharedState.lastWorker.on.mock.calls.find(
        (c: any) => c[0] === 'message',
      )?.[1];

      if (onMessage && msgId !== undefined) {
        onMessage({
          id: msgId,
          result: { success: true, data: [] },
        });
      }

      await promise;
      expect(vi.mocked(Worker)).toHaveBeenCalledWith(
        expect.stringMatching(/scan-worker\.js$/),
        undefined,
      );
      vi.unstubAllGlobals();
    });

    it('uses correct worker path in non-packaged electron', async () => {
      vi.stubGlobal('process', {
        ...process,
        versions: { ...process.versions, electron: '30.0.0' },
      });
      sharedState.isPackaged = false;
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/dir', isActive: true },
      ] as any);

      let msgId: string | undefined;
      const postMessagePromise = new Promise<void>((resolve) => {
        sharedState.postMessageCallback = (msg: any) => {
          msgId = msg.id;
          resolve();
        };
      });

      const promise = scanDiskForAlbumsAndCache();
      await postMessagePromise;

      const onMessage = sharedState.lastWorker.on.mock.calls.find(
        (c: any) => c[0] === 'message',
      )?.[1];

      if (onMessage && msgId !== undefined) {
        onMessage({
          id: msgId,
          result: { success: true, data: [] },
        });
      }

      await promise;
      expect(vi.mocked(Worker)).toHaveBeenCalledWith(
        expect.any(URL),
        undefined,
      );
      vi.unstubAllGlobals();
    });

    it('uses correct worker path in production web server', async () => {
      vi.stubGlobal('process', {
        ...process,
        env: { ...process.env, NODE_ENV: 'production' },
        versions: { ...process.versions, electron: undefined },
      });
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/dir', isActive: true },
      ] as any);

      let msgId: string | undefined;
      const postMessagePromise = new Promise<void>((resolve) => {
        sharedState.postMessageCallback = (msg: any) => {
          msgId = msg.id;
          resolve();
        };
      });

      const promise = scanDiskForAlbumsAndCache();
      await postMessagePromise;

      const onMessage = sharedState.lastWorker.on.mock.calls.find(
        (c: any) => c[0] === 'message',
      )?.[1];

      if (onMessage && msgId !== undefined) {
        onMessage({
          id: msgId,
          result: { success: true, data: [] },
        });
      }

      await promise;
      expect(vi.mocked(Worker)).toHaveBeenCalledWith(
        expect.stringMatching(/scan-worker\.js$/),
        undefined,
      );
      vi.unstubAllGlobals();
    });

    it('handles worker SCAN_ERROR', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/d', isActive: true },
      ] as any);

      let msgId: string | undefined;
      const postMessagePromise = new Promise<void>((resolve) => {
        sharedState.postMessageCallback = (msg: any) => {
          msgId = msg.id;
          resolve();
        };
      });

      const promise = scanDiskForAlbumsAndCache();
      await postMessagePromise;

      const onMessage = sharedState.lastWorker.on.mock.calls.find(
        (c: any) => c[0] === 'message',
      )?.[1];

      if (onMessage && msgId !== undefined) {
        onMessage({
          id: msgId,
          result: { success: false, error: 'Worker error' },
        });
      }

      await expect(promise).rejects.toThrow('Worker error');
    });

    it('handles worker system error', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/d', isActive: true },
      ] as any);

      const postMessagePromise = new Promise<void>((resolve) => {
        sharedState.postMessageCallback = () => {
          resolve();
        };
      });

      const promise = scanDiskForAlbumsAndCache();
      await postMessagePromise;

      const onError = sharedState.lastWorker.on.mock.calls.find(
        (c: any) => c[0] === 'error',
      )?.[1];
      if (onError) onError(new Error('Crash'));
      await expect(promise).rejects.toThrow('Crash');
    });

    it('handles worker non-zero exit', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/d', isActive: true },
      ] as any);

      const postMessagePromise = new Promise<void>((resolve) => {
        sharedState.postMessageCallback = () => {
          resolve();
        };
      });

      const promise = scanDiskForAlbumsAndCache();
      await postMessagePromise;

      const onExit = sharedState.lastWorker.on.mock.calls.find(
        (c: any) => c[0] === 'exit',
      )?.[1];
      if (onExit) onExit(1);
      await expect(promise).rejects.toThrow('Worker exited unexpectedly');
    });

    it('handles worker zero exit without message', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/d', isActive: true },
      ] as any);

      const postMessagePromise = new Promise<void>((resolve) => {
        sharedState.postMessageCallback = () => {
          resolve();
        };
      });

      const promise = scanDiskForAlbumsAndCache();
      await postMessagePromise;

      const onExit = sharedState.lastWorker.on.mock.calls.find(
        (c: any) => c[0] === 'exit',
      )?.[1];
      if (onExit) onExit(0);
      await expect(promise).rejects.toThrow('Worker exited unexpectedly');
    });

    it('triggers background metadata extraction and handles its failure', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/d', isActive: true },
      ] as any);
      vi.mocked(database.getPendingMetadata).mockRejectedValue(
        new Error('Background error'),
      );
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const albums = [{ id: 1, textures: [{ path: '/v.mp4' }] }];

      let msgId: string | undefined;
      const postMessagePromise = new Promise<void>((resolve) => {
        sharedState.postMessageCallback = (msg: any) => {
          msgId = msg.id;
          resolve();
        };
      });

      const promise = scanDiskForAlbumsAndCache('/ffmpeg');
      await postMessagePromise;

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

      // This is background async work, we still need to wait for it.
      // But we can avoid setTimeout by using a smarter approach if possible.
      await vi.waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Background metadata extraction failed'),
          expect.any(Error),
        );
      });
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getAlbumsFromCacheOrDisk', () => {
    it('returns cached albums if available', async () => {
      const albums = [{ id: 1 }];
      vi.mocked(database.getCachedAlbums).mockResolvedValue(albums as any);
      const result = await getAlbumsFromCacheOrDisk();
      expect(result).toEqual(albums);
    });

    it('scans disk if cache is empty', async () => {
      vi.mocked(database.getCachedAlbums).mockResolvedValue([]);
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/d', isActive: true },
      ] as any);

      let msgId: string | undefined;
      const postMessagePromise = new Promise<void>((resolve) => {
        sharedState.postMessageCallback = (msg: any) => {
          msgId = msg.id;
          resolve();
        };
      });

      const promise = getAlbumsFromCacheOrDisk();
      await postMessagePromise;

      const onMessage = sharedState.lastWorker.on.mock.calls.find(
        (c: any) => c[0] === 'message',
      )?.[1];

      if (onMessage && msgId !== undefined) {
        onMessage({
          id: msgId,
          result: { success: true, data: [{ id: 2 }] },
        });
      }

      const result = await promise;
      expect(result).toEqual([{ id: 2 }]);
    });
  });

  describe('getAlbumsWithViewCountsAfterScan', () => {
    it('returns albums with view counts', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/d', isActive: true },
      ] as any);
      vi.mocked(database.getAllMediaViewCounts).mockResolvedValue({
        '/v1.mp4': 5,
      });
      vi.mocked(database.getAllMetadataStats).mockResolvedValue({});
      const albums = [{ id: 1, textures: [{ path: '/v1.mp4' }] }];

      let msgId: string | undefined;
      const postMessagePromise = new Promise<void>((resolve) => {
        sharedState.postMessageCallback = (msg: any) => {
          msgId = msg.id;
          resolve();
        };
      });

      const promise = getAlbumsWithViewCountsAfterScan();
      await postMessagePromise;

      const onMessage = sharedState.lastWorker.on.mock.calls.find(
        (c: any) => c[0] === 'message',
      )?.[1];

      if (onMessage && msgId !== undefined) {
        onMessage({
          id: msgId,
          result: { success: true, data: albums },
        });
      }
      const result = await promise;
      expect(result[0].textures[0].viewCount).toBe(5);
    });

    it('handles empty results', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([]);
      const result = await getAlbumsWithViewCountsAfterScan();
      expect(result).toEqual([]);
    });

    it('handles scan with no albums', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/d', isActive: true },
      ] as any);

      let msgId: string | undefined;
      const postMessagePromise = new Promise<void>((resolve) => {
        sharedState.postMessageCallback = (msg: any) => {
          msgId = msg.id;
          resolve();
        };
      });

      const promise = getAlbumsWithViewCountsAfterScan();
      await postMessagePromise;

      const onMessage = sharedState.lastWorker.on.mock.calls.find(
        (c: any) => c[0] === 'message',
      )?.[1];

      if (onMessage && msgId !== undefined) {
        onMessage({
          id: msgId,
          result: { success: true, data: [] },
        });
      }
      const result = await promise;
      expect(result).toEqual([]);
    });
  });

  describe('getAlbumsWithViewCounts', () => {
    it('returns albums with view counts from cache', async () => {
      const albums = [{ id: 1, textures: [{ path: '/v1.mp4' }] }];
      vi.mocked(database.getCachedAlbums).mockResolvedValue(albums as any);
      vi.mocked(database.getAllMediaViewCounts).mockResolvedValue({
        '/v1.mp4': 10,
      });
      vi.mocked(database.getAllMetadataStats).mockResolvedValue({});
      const result = await getAlbumsWithViewCounts();
      expect(result[0].textures[0].viewCount).toBe(10);
    });

    it('returns empty list if no albums in cache and empty scan', async () => {
      vi.mocked(database.getCachedAlbums).mockResolvedValue([]);
      vi.mocked(database.getMediaDirectories).mockResolvedValue([]);
      const result = await getAlbumsWithViewCounts();
      expect(result).toEqual([]);
    });
  });

  describe('extractAndSaveMetadata', () => {
    it('skips empty and gdrive paths', async () => {
      await extractAndSaveMetadata(['', 'gdrive://123'], 'ffmpeg');
      expect(fs.stat).not.toHaveBeenCalled();
    });

    it('processes items successfully including duration', async () => {
      vi.mocked(database.getMetadata).mockResolvedValue({});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(fs.stat).mockResolvedValue({
        size: 100,
        birthtime: new Date(),
      } as any);
      vi.mocked(mediaHandler.getVideoDuration).mockResolvedValue({
        duration: 50,
      });
      await extractAndSaveMetadata(['/v.mp4'], 'ffmpeg');
      expect(database.bulkUpsertMetadata).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            filePath: '/v.mp4',
            status: 'success',
            duration: 50,
          }),
        ]),
      );
    });

    it('flushes batch on success threshold', async () => {
      const paths = Array.from({ length: 51 }, (_, i) => `/file${i}.mp4`);
      vi.mocked(fs.stat).mockResolvedValue({
        size: 10,
        birthtime: new Date(),
      } as any);
      vi.mocked(mediaHandler.getVideoDuration).mockResolvedValue(null as any);
      await extractAndSaveMetadata(paths, 'ffmpeg');
      expect(database.bulkUpsertMetadata).toHaveBeenCalledTimes(2);
    });

    it('flushes batch on error threshold', async () => {
      const paths = Array.from({ length: 51 }, (_, i) => `/fail${i}.mp4`);
      vi.mocked(fs.stat).mockRejectedValue(new Error('fail'));
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await extractAndSaveMetadata(paths, 'ffmpeg');
      expect(database.bulkUpsertMetadata).toHaveBeenCalledTimes(2);
    });

    it('handles bulk upsert errors gracefully', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        size: 10,
        birthtime: new Date(),
      } as any);
      vi.mocked(mediaHandler.getVideoDuration).mockResolvedValue(null as any);
      vi.mocked(database.bulkUpsertMetadata).mockRejectedValue(
        new Error('Bulk Error'),
      );
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      await extractAndSaveMetadata(['/v1.mp4'], 'ffmpeg');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to bulk upsert metadata'),
        expect.any(Error),
      );
      consoleErrorSpy.mockRestore();
    });
  });
});
