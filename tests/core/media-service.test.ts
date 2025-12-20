import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scanDiskForAlbumsAndCache,
  getAlbumsFromCacheOrDisk,
  getAlbumsWithViewCountsAfterScan,
  getAlbumsWithViewCounts,
  extractAndSaveMetadata,
} from '../../src/core/media-service';
import * as database from '../../src/core/database';
import * as mediaScanner from '../../src/core/media-scanner';
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

describe('media-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('scanDiskForAlbumsAndCache', () => {
    it('scans and caches albums if directories exist', async () => {
      const dirs = [
        { path: '/dir1', isActive: true },
        { path: '/dir2', isActive: false },
      ];
      vi.mocked(database.getMediaDirectories).mockResolvedValue(dirs as any);
      const albums = [{ id: 1, name: 'Album1' }];
      vi.mocked(mediaScanner.performFullMediaScan).mockResolvedValue(
        albums as any,
      );

      const result = await scanDiskForAlbumsAndCache();

      expect(database.getMediaDirectories).toHaveBeenCalled();
      expect(mediaScanner.performFullMediaScan).toHaveBeenCalledWith(['/dir1']);
      expect(database.cacheAlbums).toHaveBeenCalledWith(albums);
      expect(result).toEqual(albums);
    });

    it('returns empty list if no active directories', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/dir1', isActive: false },
      ] as any);

      const result = await scanDiskForAlbumsAndCache();

      expect(mediaScanner.performFullMediaScan).not.toHaveBeenCalled();
      expect(database.cacheAlbums).toHaveBeenCalledWith([]);
      expect(result).toEqual([]);
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
      vi.mocked(database.getMediaDirectories).mockResolvedValue([] as any); // To prevent crash in scan

      await getAlbumsFromCacheOrDisk();

      expect(database.getMediaDirectories).toHaveBeenCalled(); // via scanDiskForAlbumsAndCache
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
      vi.mocked(mediaScanner.performFullMediaScan).mockResolvedValue(
        albums as any,
      );
      vi.mocked(database.getMediaViewCounts).mockResolvedValue({ p1: 99 });

      const result = await getAlbumsWithViewCountsAfterScan();

      expect(result[0].textures[0].viewCount).toBe(99);
      expect(mediaScanner.performFullMediaScan).toHaveBeenCalled();
    });

    it('returns empty if scan returns empty', async () => {
      vi.mocked(database.getMediaDirectories).mockResolvedValue([
        { path: '/d', isActive: true },
      ] as any);
      vi.mocked(mediaScanner.performFullMediaScan).mockResolvedValue([] as any);

      const result = await getAlbumsWithViewCountsAfterScan();
      expect(result).toEqual([]);
    });
  });

  // Extra coverage for scanDiskForAlbumsAndCache null handling
  it('scanDiskForAlbumsAndCache handles null scan result', async () => {
    vi.mocked(database.getMediaDirectories).mockResolvedValue([
      { path: '/d', isActive: true },
    ] as any);
    vi.mocked(mediaScanner.performFullMediaScan).mockResolvedValue(null as any);

    const result = await scanDiskForAlbumsAndCache();
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
      expect(database.upsertMetadata).toHaveBeenCalledWith('/valid/file1.mp4', {
        size: 1024,
        createdAt: new Date('2023-01-01').toISOString(),
        status: 'success',
        duration: 120,
      });

      // Verify error handling for file2
      // It should try to extract, fail at fs.stat, log warning (console.warn mocked implicitly?), and upsert 'failed'
      expect(fs.stat).toHaveBeenCalledWith('/error/file2.mp4');
      expect(database.upsertMetadata).toHaveBeenCalledWith('/error/file2.mp4', {
        status: 'failed',
      });
    });

    it('skips gdrive paths', async () => {
      const filePaths = ['gdrive://some-id'];
      await extractAndSaveMetadata(filePaths, 'ffmpeg');
      expect(fs.stat).not.toHaveBeenCalled();
      expect(database.upsertMetadata).not.toHaveBeenCalled();
    });
  });
});
