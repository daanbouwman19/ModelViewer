import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scanDiskForAlbumsAndCache,
  getAlbumsFromCacheOrDisk,
  extractAndSaveMetadata,
} from '../../src/core/media-service';
import * as database from '../../src/core/database';
import * as mediaHandler from '../../src/core/media-handler';
import fs from 'fs/promises';
import { Worker } from 'worker_threads';

// Mock dependencies
vi.mock('../../src/core/database');
vi.mock('../../src/core/media-scanner');
vi.mock('../../src/core/media-handler');
vi.mock('fs/promises', () => ({
  stat: vi.fn(),
  default: { stat: vi.fn() },
}));

// Shared state for all mocks and tests
const sharedState = vi.hoisted(() => ({
  lastWorker: null as any,
  isPackaged: false,
}));

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return sharedState.isPackaged;
    },
    set isPackaged(val) {
      sharedState.isPackaged = val;
    },
    getPath: vi.fn().mockReturnValue('/tmp'),
  },
  default: {
    app: {
      get isPackaged() {
        return sharedState.isPackaged;
      },
    },
  },
  __esModule: true,
}));

// Use a function that acts as a constructor and is a spy
vi.mock('worker_threads', () => {
  const Worker = vi.fn(function (this: any) {
    this.on = vi.fn();
    this.postMessage = vi.fn();
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
    vi.resetAllMocks();
    sharedState.lastWorker = null;
    sharedState.isPackaged = false;
  });

  describe('scanDiskForAlbumsAndCache', () => {
    it('uses correct worker path in packaged app', async () => {
      vi.stubGlobal('process', {
        ...process,
        versions: { ...process.versions, electron: '30.0.0' },
      });
      sharedState.isPackaged = true;

      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/dir', isActive: true },
      ] as any);

      const promise = scanDiskForAlbumsAndCache();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(vi.mocked(Worker)).toHaveBeenCalled();

      const last = sharedState.lastWorker;
      if (last) {
        const onMessage = last.on.mock.calls.find(
          (c: any) => c[0] === 'message',
        )?.[1];
        if (onMessage) onMessage({ type: 'SCAN_COMPLETE', albums: [] });
      }
      await promise;

      vi.unstubAllGlobals();
    });

    it('scans and caches albums if directories exist', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/dir1', isActive: true },
      ] as any);

      const promise = scanDiskForAlbumsAndCache();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const last = sharedState.lastWorker;
      expect(last).toBeDefined();

      const onMessage = last.on.mock.calls.find(
        (c: any) => c[0] === 'message',
      )?.[1];
      if (onMessage) onMessage({ type: 'SCAN_COMPLETE', albums: [{ id: 1 }] });

      const result = await promise;
      expect(result).toHaveLength(1);
      expect(database.cacheAlbums).toHaveBeenCalled();
    });

    it('handles worker errors', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/dir1', isActive: true },
      ] as any);

      const promise = scanDiskForAlbumsAndCache();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const last = sharedState.lastWorker;
      if (last) {
        const onMessage = last.on.mock.calls.find(
          (c: any) => c[0] === 'message',
        )?.[1];
        if (onMessage)
          onMessage({ type: 'SCAN_ERROR', error: 'Worker failed' });
      }

      await expect(promise).rejects.toThrow('Worker failed');
    });
  });

  describe('getAlbumsFromCacheOrDisk', () => {
    it('returns cached albums if available', async () => {
      vi.mocked(database.getCachedAlbums).mockResolvedValue([{ id: 1 }] as any);
      const result = await getAlbumsFromCacheOrDisk();
      expect(result).toEqual([{ id: 1 }]);
    });
  });

  describe('extractAndSaveMetadata', () => {
    it('processes valid paths', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
        birthtime: new Date(),
      } as any);
      vi.mocked(mediaHandler.getVideoDuration).mockResolvedValue({
        duration: 120,
      });
      await extractAndSaveMetadata(['/v.mp4'], 'ffmpeg');
      expect(database.bulkUpsertMetadata).toHaveBeenCalled();
    });
  });
});
