
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scanDiskForAlbumsAndCache,
  getAlbumsFromCacheOrDisk,
  getAlbumsWithViewCounts,
  getAlbumsWithViewCountsAfterScan,
} from '../../src/core/media-service';
import * as database from '../../src/core/database';
import * as mediaScanner from '../../src/core/media-scanner';

// Mock dependencies
vi.mock('../../src/core/database', () => ({
  getMediaDirectories: vi.fn(),
  cacheAlbums: vi.fn(),
  getCachedAlbums: vi.fn(),
  getMediaViewCounts: vi.fn(),
}));

vi.mock('../../src/core/media-scanner', () => ({
  performFullMediaScan: vi.fn(),
}));

describe('media-service.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('scanDiskForAlbumsAndCache', () => {
    it('should return empty array if no active directories', async () => {
      vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([
        { path: '/inactive', isActive: false },
      ] as any);

      const result = await scanDiskForAlbumsAndCache();

      expect(database.getMediaDirectories).toHaveBeenCalled();
      expect(database.cacheAlbums).toHaveBeenCalledWith([]);
      expect(result).toEqual([]);
    });

    it('should scan active directories and cache results', async () => {
      const mockDirs = [
        { path: '/active', isActive: true },
        { path: '/inactive', isActive: false },
      ];
      const mockAlbums = [{ id: 'album1', title: 'Album 1' }];

      vi.spyOn(database, 'getMediaDirectories').mockResolvedValue(mockDirs as any);
      vi.spyOn(mediaScanner, 'performFullMediaScan').mockResolvedValue(mockAlbums as any);

      const result = await scanDiskForAlbumsAndCache();

      expect(database.getMediaDirectories).toHaveBeenCalled();
      expect(mediaScanner.performFullMediaScan).toHaveBeenCalledWith(['/active']);
      expect(database.cacheAlbums).toHaveBeenCalledWith(mockAlbums);
      expect(result).toEqual(mockAlbums);
    });

    it('should cache empty array if scan returns null/undefined', async () => {
        const mockDirs = [
          { path: '/active', isActive: true },
        ];

        vi.spyOn(database, 'getMediaDirectories').mockResolvedValue(mockDirs as any);
        vi.spyOn(mediaScanner, 'performFullMediaScan').mockResolvedValue(null as any);

        const result = await scanDiskForAlbumsAndCache();

        expect(database.cacheAlbums).toHaveBeenCalledWith([]);
        expect(result).toEqual([]);
      });
  });

  describe('getAlbumsFromCacheOrDisk', () => {
    it('should return cached albums if available', async () => {
      const mockAlbums = [{ id: 'album1' }];
      vi.spyOn(database, 'getCachedAlbums').mockResolvedValue(mockAlbums as any);

      const result = await getAlbumsFromCacheOrDisk();

      expect(database.getCachedAlbums).toHaveBeenCalled();
      expect(result).toEqual(mockAlbums);
      expect(database.getMediaDirectories).not.toHaveBeenCalled(); // Should not scan
    });

    it('should scan disk if cache is empty', async () => {
      vi.spyOn(database, 'getCachedAlbums').mockResolvedValue([]);

      // Mock internal call to scanDiskForAlbumsAndCache behavior
      const mockDirs = [{ path: '/active', isActive: true }];
      const mockAlbums = [{ id: 'scanned' }];
      vi.spyOn(database, 'getMediaDirectories').mockResolvedValue(mockDirs as any);
      vi.spyOn(mediaScanner, 'performFullMediaScan').mockResolvedValue(mockAlbums as any);

      const result = await getAlbumsFromCacheOrDisk();

      expect(database.getCachedAlbums).toHaveBeenCalled();
      expect(database.getMediaDirectories).toHaveBeenCalled();
      expect(result).toEqual(mockAlbums);
    });
  });

  describe('getAlbumsWithViewCounts', () => {
    it('should return empty array if no albums found', async () => {
       vi.spyOn(database, 'getCachedAlbums').mockResolvedValue([]);
       vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([]);

       const result = await getAlbumsWithViewCounts();
       expect(result).toEqual([]);
    });

    it('should attach view counts to media files', async () => {
      const mockAlbums = [
        {
          id: 'album1',
          textures: [
            { path: '/path/1.jpg' },
            { path: '/path/2.jpg' },
          ],
        },
      ];
      const mockViewCounts = {
        '/path/1.jpg': 10,
        '/path/2.jpg': 5,
      };

      vi.spyOn(database, 'getCachedAlbums').mockResolvedValue(mockAlbums as any);
      vi.spyOn(database, 'getMediaViewCounts').mockResolvedValue(mockViewCounts as any);

      const result = await getAlbumsWithViewCounts();

      expect(database.getMediaViewCounts).toHaveBeenCalledWith([
        '/path/1.jpg',
        '/path/2.jpg',
      ]);
      expect(result[0].textures[0].viewCount).toBe(10);
      expect(result[0].textures[1].viewCount).toBe(5);
    });

    it('should use 0 for missing view counts', async () => {
        const mockAlbums = [
          {
            id: 'album1',
            textures: [
              { path: '/path/1.jpg' },
            ],
          },
        ];

        vi.spyOn(database, 'getCachedAlbums').mockResolvedValue(mockAlbums as any);
        vi.spyOn(database, 'getMediaViewCounts').mockResolvedValue({} as any);

        const result = await getAlbumsWithViewCounts();

        expect(result[0].textures[0].viewCount).toBe(0);
      });
  });

  describe('getAlbumsWithViewCountsAfterScan', () => {
      it('should return empty array if scan finds nothing', async () => {
          vi.spyOn(database, 'getMediaDirectories').mockResolvedValue([]);

          const result = await getAlbumsWithViewCountsAfterScan();
          expect(result).toEqual([]);
      });

      it('should return scanned albums with view counts', async () => {
          const mockDirs = [{ path: '/active', isActive: true }];
          const mockAlbums = [
            {
              id: 'scanned',
              textures: [
                { path: '/path/scanned.jpg' },
              ],
            },
          ];
          const mockViewCounts = {
            '/path/scanned.jpg': 42,
          };

          vi.spyOn(database, 'getMediaDirectories').mockResolvedValue(mockDirs as any);
          vi.spyOn(mediaScanner, 'performFullMediaScan').mockResolvedValue(mockAlbums as any);
          vi.spyOn(database, 'getMediaViewCounts').mockResolvedValue(mockViewCounts as any);

          const result = await getAlbumsWithViewCountsAfterScan();

          expect(mediaScanner.performFullMediaScan).toHaveBeenCalled();
          expect(result[0].textures[0].viewCount).toBe(42);
      });
  });
});
