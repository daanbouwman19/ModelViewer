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

// Mock dependencies
vi.mock('../../src/core/database');
vi.mock('../../src/core/media-scanner');
vi.mock('../../src/core/media-handler');

// Explicitly mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
  },
}));

// Mock Electron
const electronMocks = vi.hoisted(() => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(),
  },
}));

vi.mock('electron', () => electronMocks);

// Mock Worker Threads
const mocks = vi.hoisted(() => {
  const on = vi.fn();
  const postMessage = vi.fn();
  const terminate = vi.fn();
  const Worker = vi.fn(function () {
    return {
      on,
      postMessage,
      terminate,
      removeAllListeners: vi.fn(),
    };
  });
  return { Worker, on, postMessage, terminate };
});

vi.mock('worker_threads', () => ({
  Worker: mocks.Worker,
  default: { Worker: mocks.Worker },
}));

describe('media-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub process.versions.electron for environment detection
    vi.stubGlobal('process', {
      ...process,
      versions: {
        ...process.versions,
        electron: '30.0.0', // Faking an Electron version
      },
    });
  });

  describe('scanDiskForAlbumsAndCache', () => {
    beforeEach(() => {
      // Reset callback implementation
      mocks.on.mockImplementation(() => {});
    });

    it('uses correct worker path in packaged app', async () => {
      electronMocks.app.isPackaged = true;

      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/dir', isActive: true },
      ] as any);

      // Start the function
      const promise = scanDiskForAlbumsAndCache();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mocks.Worker).toHaveBeenCalledWith(
        expect.stringMatching(/scan-worker\.(js|ts)/),
      );

      // Complete the scan to resolve promise
      const callback = mocks.on.mock.calls.find(
        (call) => call[0] === 'message',
      )?.[1];
      if (callback) callback({ type: 'SCAN_COMPLETE', albums: [] });
      await promise;

      // Restore
      electronMocks.app.isPackaged = false;
      mocks.terminate.mockClear();
    });

    it('scans and caches albums if directories exist', async () => {
      const dirs = [
        { path: '/dir1', isActive: true },
        { path: '/dir2', isActive: false },
      ];
      vi.mocked(database.getMediaDirectories).mockResolvedValue(dirs as any);
      const albums = [{ id: 1, name: 'Album1' }];

      // Capture message callback
      let messageCallback: ((msg: any) => void) | undefined;
      mocks.on.mockImplementation((event, cb) => {
        if (event === 'message') messageCallback = cb;
      });

      // Start the function
      const promise = scanDiskForAlbumsAndCache();

      // The worker should be instantiated
      await new Promise((resolve) => setTimeout(resolve, 0)); // Let the microtask run to creating worker
      expect(mocks.Worker).toHaveBeenCalled();

      // Trigger worker message
      expect(mocks.postMessage).toHaveBeenCalledWith({
        type: 'START_SCAN',
        directories: ['/dir1'],
      });

      if (messageCallback) {
        messageCallback({ type: 'SCAN_COMPLETE', albums });
      }

      const result = await promise;

      expect(database.getMediaDirectories).toHaveBeenCalled();
      expect(database.cacheAlbums).toHaveBeenCalledWith(albums);
      expect(result).toEqual(albums);
      expect(mocks.terminate).toHaveBeenCalled();
    });

    it('returns empty list if no active directories', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/dir1', isActive: false },
      ] as any);

      const result = await scanDiskForAlbumsAndCache();

      expect(mocks.Worker).not.toHaveBeenCalled();
      expect(database.cacheAlbums).toHaveBeenCalledWith([]);
      expect(result).toEqual([]);
    });

    it('handles worker errors', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/dir1', isActive: true },
      ] as any);

      let messageCallback: ((msg: any) => void) | undefined;
      mocks.on.mockImplementation((event, cb) => {
        if (event === 'message') messageCallback = cb;
      });

      const promise = scanDiskForAlbumsAndCache();

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mocks.postMessage).toHaveBeenCalled();

      if (messageCallback) {
        messageCallback({ type: 'SCAN_ERROR', error: 'Worker failed' });
      }

      await expect(promise).rejects.toThrow('Worker failed');
      expect(mocks.terminate).toHaveBeenCalled();
    });

    it('handles worker system error', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/dir1', isActive: true },
      ] as any);

      let errorCallback: ((err: any) => void) | undefined;
      mocks.on.mockImplementation((event, cb) => {
        if (event === 'error') errorCallback = cb;
      });

      const promise = scanDiskForAlbumsAndCache();
      await new Promise((resolve) => setTimeout(resolve, 0));

      if (errorCallback) {
        errorCallback(new Error('System error'));
      }

      await expect(promise).rejects.toThrow('System error');
      expect(mocks.terminate).toHaveBeenCalled();
    });

    it('handles worker non-zero exit', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/dir1', isActive: true },
      ] as any);

      let exitCallback: ((code: number) => void) | undefined;
      mocks.on.mockImplementation((event, cb) => {
        if (event === 'exit') exitCallback = cb;
      });

      const promise = scanDiskForAlbumsAndCache();
      await new Promise((resolve) => setTimeout(resolve, 0));

      if (exitCallback) {
        exitCallback(1);
      }

      await expect(promise).rejects.toThrow('Worker stopped with exit code 1');
    });

    it('handles worker zero exit without result', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/dir1', isActive: true },
      ] as any);

      let exitCallback: ((code: number) => void) | undefined;
      mocks.on.mockImplementation((event, cb) => {
        if (event === 'exit') exitCallback = cb;
      });

      const promise = scanDiskForAlbumsAndCache();
      await new Promise((resolve) => setTimeout(resolve, 0));

      if (exitCallback) {
        exitCallback(0);
      }

      await expect(promise).rejects.toThrow(
        'Worker exited without sending a result',
      );
    });

    it('triggers metadata extraction when ffmpegPath is provided', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/dir1', isActive: true },
      ] as any);
      const albums = [
        {
          id: 1,
          textures: [{ path: '/new/file.mp4' }],
        },
      ];

      let messageCallback: ((msg: any) => void) | undefined;
      mocks.on.mockImplementation((event, cb) => {
        if (event === 'message') messageCallback = cb;
      });

      // Mock getPendingMetadata
      vi.mocked(database.getPendingMetadata).mockResolvedValue([
        '/pending/file.mkv',
      ]);

      const promise = scanDiskForAlbumsAndCache('/usr/bin/ffmpeg');
      await new Promise((resolve) => setTimeout(resolve, 0));

      if (messageCallback) messageCallback({ type: 'SCAN_COMPLETE', albums });

      await promise;

      // Allow background microtasks to run
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(database.getPendingMetadata).toHaveBeenCalled();

      // We can check if internal extractAndSaveMetadata logic ran.
      // It calls fs.stat for validation.
      expect(fs.stat).toHaveBeenCalledWith('/new/file.mp4');
      expect(fs.stat).toHaveBeenCalledWith('/pending/file.mkv');
    });
  });

  describe('getAlbumsFromCacheOrDisk', () => {
    it('returns cached albums if available', async () => {
      const cached = [{ id: 1 }];
      vi.mocked(database.getCachedAlbums).mockResolvedValue(cached as any);

      const result = await getAlbumsFromCacheOrDisk();

      expect(result).toEqual(cached);
      expect(database.getMediaDirectories).not.toHaveBeenCalled();
    });

    it('scans if cache empty', async () => {
      vi.mocked(database.getCachedAlbums).mockResolvedValue([]);

      // Setup for scan
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/d', isActive: true },
      ] as any);

      let messageCallback: ((msg: any) => void) | undefined;
      mocks.on.mockImplementation((event, cb) => {
        if (event === 'message') messageCallback = cb;
      });

      // Start call
      const promise = getAlbumsFromCacheOrDisk();

      // wait for worker
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (messageCallback)
        messageCallback({ type: 'SCAN_COMPLETE', albums: [] });

      await promise;
      expect(database.getMediaDirectories).toHaveBeenCalled();
      expect(mocks.Worker).toHaveBeenCalled();
    });
  });

  describe('getAlbumsWithViewCounts', () => {
    it('merges view counts', async () => {
      const albums = [
        {
          textures: [{ path: 'p1' }, { path: 'p2' }],
        },
      ];
      vi.mocked(database.getCachedAlbums).mockResolvedValue(albums as any);
      vi.mocked(database.getMediaViewCounts).mockResolvedValue({
        p1: 10,
        p2: 5,
      });

      const result = await getAlbumsWithViewCounts();

      expect(result[0].textures[0].viewCount).toBe(10);
      expect(result[0].textures[1].viewCount).toBe(5);
    });

    it('returns empty if no albums', async () => {
      vi.mocked(database.getCachedAlbums).mockResolvedValue([]);
      // And scan returns empty
      vi.mocked(database.getMediaDirectories).mockResolvedValue([]);

      const result = await getAlbumsWithViewCounts();
      expect(result).toEqual([]);
    });
  });

  describe('getAlbumsWithViewCountsAfterScan', () => {
    it('scans and merges view counts', async () => {
      const albums = [
        {
          textures: [{ path: 'p1' }],
        },
      ];
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/d', isActive: true },
      ] as any);
      vi.mocked(database.getMediaViewCounts).mockResolvedValue({ p1: 99 });

      let messageCallback: ((msg: any) => void) | undefined;
      mocks.on.mockImplementation((event, cb) => {
        if (event === 'message') messageCallback = cb;
      });

      const promise = getAlbumsWithViewCountsAfterScan();

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mocks.Worker).toHaveBeenCalled();
      if (messageCallback) messageCallback({ type: 'SCAN_COMPLETE', albums });

      const result = await promise;

      expect(result[0].textures[0].viewCount).toBe(99);
    });

    it('returns empty if scan returns empty', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/d', isActive: true },
      ] as any);

      let messageCallback: ((msg: any) => void) | undefined;
      mocks.on.mockImplementation((event, cb) => {
        if (event === 'message') messageCallback = cb;
      });

      const promise = getAlbumsWithViewCountsAfterScan();

      await new Promise((resolve) => setTimeout(resolve, 0));
      if (messageCallback)
        messageCallback({ type: 'SCAN_COMPLETE', albums: [] });

      const result = await promise;
      expect(result).toEqual([]);
    });
  });

  // Extra coverage for scanDiskForAlbumsAndCache null handling
  it('scanDiskForAlbumsAndCache handles null scan result', async () => {
    vi.mocked(database.getMediaDirectories).mockResolvedValue([
      { path: '/d', isActive: true },
    ] as any);

    let messageCallback: ((msg: any) => void) | undefined;
    mocks.on.mockImplementation((event, cb) => {
      if (event === 'message') messageCallback = cb;
    });

    const promise = scanDiskForAlbumsAndCache();

    await new Promise((resolve) => setTimeout(resolve, 0));
    // Simulate worker returning null or just not returning anything properly?
    // scanDiskForAlbumsAndCache expects 'SCAN_COMPLETE' with albums.
    // If albums is null in the payload?
    if (messageCallback)
      messageCallback({ type: 'SCAN_COMPLETE', albums: null });

    const result = await promise;
    expect(database.cacheAlbums).toHaveBeenCalledWith([]);
    expect(result).toEqual([]);
  });

  describe('extractAndSaveMetadata', () => {
    it('processes valid paths and handles errors gracefully', async () => {
      const filePaths = ['/valid/file1.mp4', '/error/file2.mp4'];
      const ffmpegPath = '/usr/bin/ffmpeg';

      // Mock fs.stat
      vi.mocked(fs.stat).mockImplementation(async (path) => {
        if (path === '/valid/file1.mp4') {
          return {
            size: 1024,
            birthtime: new Date('2023-01-01'),
          } as any;
        }
        if (path === '/error/file2.mp4') {
          throw new Error('File not found');
        }
        return {} as any;
      });

      // Mock getVideoDuration
      vi.mocked(mediaHandler.getVideoDuration).mockImplementation(
        async (path) => {
          if (path === '/valid/file1.mp4') {
            return { duration: 120 };
          }
          return { error: 'Should not reach here for file2' };
        },
      );

      await extractAndSaveMetadata(filePaths, ffmpegPath);

      // Verify valid file processing
      expect(fs.stat).toHaveBeenCalledWith('/valid/file1.mp4');
      expect(mediaHandler.getVideoDuration).toHaveBeenCalledWith(
        '/valid/file1.mp4',
        ffmpegPath,
      );
      expect(database.bulkUpsertMetadata).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            filePath: '/valid/file1.mp4',
            status: 'success',
          }),
          expect.objectContaining({
            filePath: '/error/file2.mp4',
            status: 'failed',
          }),
        ]),
      );
    });

    it('skips gdrive paths', async () => {
      const filePaths = ['gdrive://some-id'];
      await extractAndSaveMetadata(filePaths, 'ffmpeg');
      expect(fs.stat).not.toHaveBeenCalled();
      expect(database.bulkUpsertMetadata).not.toHaveBeenCalled();
    });
  });
});
