import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebAdapter } from '../../../src/renderer/api/WebAdapter';

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    port: '3000',
  },
  writable: true,
});

describe('WebAdapter', () => {
  let adapter: WebAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new WebAdapter();
  });

  describe('loadFileAsDataURL', () => {
    it('returns correct http-url', async () => {
      const result = await adapter.loadFileAsDataURL('/path/to/file.jpg');
      expect(result).toEqual({
        type: 'http-url',
        url: '/api/serve?path=%2Fpath%2Fto%2Ffile.jpg',
      });
    });
  });

  describe('recordMediaView', () => {
    it('calls correct API endpoint', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      await adapter.recordMediaView('/file.jpg');
      expect(fetchMock).toHaveBeenCalledWith('/api/media/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: '/file.jpg' }),
      });
    });
  });

  describe('getMediaViewCounts', () => {
    it('returns counts from API', async () => {
      const mockCounts = { '/file.jpg': 5 };
      fetchMock.mockResolvedValue({
        json: () => Promise.resolve(mockCounts),
      });
      const result = await adapter.getMediaViewCounts(['/file.jpg']);
      expect(result).toEqual(mockCounts);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/media/views',
        expect.any(Object),
      );
    });
  });

  describe('getAlbumsWithViewCounts', () => {
    it('fetches albums', async () => {
      const mockAlbums = [{ id: 1 }];
      fetchMock.mockResolvedValue({
        json: () => Promise.resolve(mockAlbums),
      });
      const result = await adapter.getAlbumsWithViewCounts();
      expect(result).toEqual(mockAlbums);
      expect(fetchMock).toHaveBeenCalledWith('/api/albums');
    });
  });

  describe('reindexMediaLibrary', () => {
    it('calls reindex endpoint', async () => {
      const mockAlbums = [{ id: 1 }];
      fetchMock.mockResolvedValue({
        json: () => Promise.resolve(mockAlbums),
      });
      const result = await adapter.reindexMediaLibrary();
      expect(result).toEqual(mockAlbums);
      expect(fetchMock).toHaveBeenCalledWith('/api/albums/reindex', {
        method: 'POST',
      });
    });
  });

  describe('addMediaDirectory', () => {
    it('calls API when path provided', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      const result = await adapter.addMediaDirectory('/new/dir');
      expect(result).toBe('/new/dir');
      expect(fetchMock).toHaveBeenCalledWith('/api/directories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/new/dir' }),
      });
    });

    it('returns null and warns if no path', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await adapter.addMediaDirectory();
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('removeMediaDirectory', () => {
    it('calls delete endpoint', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      await adapter.removeMediaDirectory('/dir');
      expect(fetchMock).toHaveBeenCalledWith('/api/directories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directoryPath: '/dir' }),
      });
    });
  });

  describe('setDirectoryActiveState', () => {
    it('calls put endpoint', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      await adapter.setDirectoryActiveState('/dir', true);
      expect(fetchMock).toHaveBeenCalledWith('/api/directories/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directoryPath: '/dir', isActive: true }),
      });
    });
  });

  describe('getMediaDirectories', () => {
    it('fetches directories', async () => {
      const mockDirs = ['/dir'];
      fetchMock.mockResolvedValue({
        json: () => Promise.resolve(mockDirs),
      });
      const result = await adapter.getMediaDirectories();
      expect(result).toEqual(mockDirs);
    });
  });

  describe('getSupportedExtensions', () => {
    it('fetches extensions', async () => {
      const mockExts = { images: ['jpg'] };
      fetchMock.mockResolvedValue({
        json: () => Promise.resolve(mockExts),
      });
      const result = await adapter.getSupportedExtensions();
      expect(result).toEqual(mockExts);
    });
  });

  describe('getServerPort', () => {
    it('returns window port', async () => {
      const port = await adapter.getServerPort();
      expect(port).toBe(3000);
    });

    it('defaults to 80 if port is empty', async () => {
      // Temporarily redefine property
      Object.defineProperty(window, 'location', {
        value: { port: '' },
        writable: true
      });
      const port = await adapter.getServerPort();
      expect(port).toBe(80);

      // Reset
      Object.defineProperty(window, 'location', {
        value: { port: '3000' },
        writable: true
      });
    });
  });

  describe('URL Generators', () => {
    it('generates media url', async () => {
      const gen = await adapter.getMediaUrlGenerator();
      expect(gen('/file.jpg')).toBe('/api/serve?path=%2Ffile.jpg');
    });

    it('generates thumbnail url', async () => {
      const gen = await adapter.getThumbnailUrlGenerator();
      expect(gen('/file.jpg')).toBe('/api/thumbnail?file=%2Ffile.jpg');
    });

    it('generates video stream url', async () => {
      const gen = await adapter.getVideoStreamUrlGenerator();
      expect(gen('/file.mp4', 10)).toBe(
        '/api/stream?file=%2Ffile.mp4&startTime=10',
      );
    });

    it('generates video stream url with default start time', async () => {
      const gen = await adapter.getVideoStreamUrlGenerator();
      expect(gen('/file.mp4')).toBe('/api/stream?file=%2Ffile.mp4&startTime=0');
    });
  });

  describe('openInVlc', () => {
    it('returns not supported', async () => {
      const result = await adapter.openInVlc();
      expect(result).toEqual({ success: false, message: 'Not supported in Web version.' });
    });
  });

  describe('getVideoMetadata', () => {
    it('fetches metadata', async () => {
      fetchMock.mockResolvedValue({
        json: () => Promise.resolve({ duration: 100 }),
      });
      await adapter.getVideoMetadata('/file.mp4');
      expect(fetchMock).toHaveBeenCalledWith('/api/metadata?file=%2Ffile.mp4');
    });
  });

  describe('listDirectory', () => {
    it('fetches directory list', async () => {
      const mockList = [{ name: 'file' }];
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockList),
      });
      const result = await adapter.listDirectory('/dir');
      expect(result).toEqual(mockList);
      expect(fetchMock).toHaveBeenCalledWith('/api/fs/ls?path=%2Fdir');
    });

    it('throws on error', async () => {
      fetchMock.mockResolvedValue({ ok: false });
      await expect(adapter.listDirectory('/dir')).rejects.toThrow();
    });
  });

  describe('getParentDirectory', () => {
    it('fetches parent', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ parent: '/parent' }),
      });
      const result = await adapter.getParentDirectory('/child');
      expect(result).toBe('/parent');
      expect(fetchMock).toHaveBeenCalledWith('/api/fs/parent?path=%2Fchild');
    });
    it('returns null on error/root', async () => {
      fetchMock.mockResolvedValue({ ok: false });
      const result = await adapter.getParentDirectory('/');
      expect(result).toBeNull();
    });
  });
});
