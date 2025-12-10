import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scanDiskForAlbumsAndCache,
  getAlbumsFromCacheOrDisk,
  getAlbumsWithViewCountsAfterScan,
  getAlbumsWithViewCounts,
} from '../../src/core/media-service';
import * as database from '../../src/core/database';
import * as mediaScanner from '../../src/core/media-scanner';

// Mock dependencies
vi.mock('../../src/core/database');
vi.mock('../../src/core/media-scanner');

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
});
