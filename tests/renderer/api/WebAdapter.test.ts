import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebAdapter } from '../../../src/renderer/api/WebAdapter';

describe('WebAdapter', () => {
  let adapter: WebAdapter;
  const mockFetch = vi.fn();

  beforeEach(() => {
    global.fetch = mockFetch;
    adapter = new WebAdapter();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loadFileAsDataURL should return http-url', async () => {
    const result = await adapter.loadFileAsDataURL('test.jpg');
    expect(result).toEqual({
      type: 'http-url',
      url: '/api/serve?path=test.jpg',
    });
  });

  it('recordMediaView should post to /media/view', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await adapter.recordMediaView('test.jpg');
    expect(mockFetch).toHaveBeenCalledWith('/api/media/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: 'test.jpg' }),
    });
  });

  it('getMediaViewCounts should post to /media/views and return counts', async () => {
    const mockCounts = { 'test.jpg': 5 };
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve(mockCounts),
    });

    const result = await adapter.getMediaViewCounts(['test.jpg']);
    expect(mockFetch).toHaveBeenCalledWith('/api/media/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePaths: ['test.jpg'] }),
    });
    expect(result).toEqual(mockCounts);
  });

  it('getAlbumsWithViewCounts should fetch /albums', async () => {
    const mockAlbums = [{ id: '1', title: 'Album' }];
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve(mockAlbums),
    });

    const result = await adapter.getAlbumsWithViewCounts();
    expect(mockFetch).toHaveBeenCalledWith('/api/albums');
    expect(result).toEqual(mockAlbums);
  });

  it('reindexMediaLibrary should post to /albums/reindex', async () => {
    const mockAlbums = [{ id: '1', title: 'Album' }];
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve(mockAlbums),
    });

    const result = await adapter.reindexMediaLibrary();
    expect(mockFetch).toHaveBeenCalledWith('/api/albums/reindex', {
      method: 'POST',
    });
    expect(result).toEqual(mockAlbums);
  });

  it('addMediaDirectory should warn and return null if no path provided', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await adapter.addMediaDirectory();
    expect(consoleSpy).toHaveBeenCalledWith(
      'addMediaDirectory not supported in WebAdapter directly.',
    );
    expect(result).toBeNull();
  });

  it('addMediaDirectory should call addMediaDirectoryByPath if path provided', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const result = await adapter.addMediaDirectory('/test');
    expect(mockFetch).toHaveBeenCalledWith('/api/directories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/test' }),
    });
    expect(result).toBe('/test');
  });

  it('addMediaDirectoryByPath should post to /directories', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await adapter.addMediaDirectoryByPath('/test');
    expect(mockFetch).toHaveBeenCalledWith('/api/directories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/test' }),
    });
  });

  it('removeMediaDirectory should delete from /directories', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await adapter.removeMediaDirectory('/test');
    expect(mockFetch).toHaveBeenCalledWith('/api/directories', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directoryPath: '/test' }),
    });
  });

  it('setDirectoryActiveState should put to /directories/active', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await adapter.setDirectoryActiveState('/test', true);
    expect(mockFetch).toHaveBeenCalledWith('/api/directories/active', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directoryPath: '/test', isActive: true }),
    });
  });

  it('getMediaDirectories should fetch /directories', async () => {
    const mockDirs = [{ path: '/test', isActive: true }];
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve(mockDirs),
    });
    const result = await adapter.getMediaDirectories();
    expect(mockFetch).toHaveBeenCalledWith('/api/directories');
    expect(result).toEqual(mockDirs);
  });

  it('getSupportedExtensions should fetch /extensions', async () => {
    const mockExts = { images: ['jpg'], videos: ['mp4'] };
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve(mockExts),
    });
    const result = await adapter.getSupportedExtensions();
    expect(mockFetch).toHaveBeenCalledWith('/api/extensions');
    expect(result).toEqual(mockExts);
  });

  it('getServerPort should return window location port or 80', async () => {
    // Cannot easily mock window.location properties in some environments
    // But we can test the fallback or assumption
    const result = await adapter.getServerPort();
    // In happy-dom environment, location.port might be empty string
    expect(result).toBe(parseInt(window.location.port || '80', 10));
  });

  it('getMediaUrlGenerator should return generator', async () => {
    const gen = await adapter.getMediaUrlGenerator();
    expect(gen('path/file.jpg')).toBe('/api/serve?path=path%2Ffile.jpg');
  });

  it('getThumbnailUrlGenerator should return generator', async () => {
    const gen = await adapter.getThumbnailUrlGenerator();
    expect(gen('path/file.jpg')).toBe('/api/thumbnail?file=path%2Ffile.jpg');
  });

  it('getVideoStreamUrlGenerator should return generator', async () => {
    const gen = await adapter.getVideoStreamUrlGenerator();
    expect(gen('path/file.mp4', 10)).toBe(
      '/api/stream?file=path%2Ffile.mp4&startTime=10',
    );
    // Test default arg
    expect(gen('path/file.mp4')).toBe(
      '/api/stream?file=path%2Ffile.mp4&startTime=0',
    );
  });

  it('getVideoMetadata should fetch /metadata', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ duration: 120 }),
    });
    const result = await adapter.getVideoMetadata('file.mp4');
    expect(mockFetch).toHaveBeenCalledWith('/api/metadata?file=file.mp4');
    expect(result).toEqual({ duration: 120 });
  });

  it('openInVlc should return not supported', async () => {
    const result = await adapter.openInVlc();
    expect(result).toEqual({
      success: false,
      message: 'Not supported in Web version.',
    });
  });

  it('listDirectory should fetch /fs/ls and return json', async () => {
    const mockEntries = [{ name: 'file', isDirectory: false }];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockEntries),
    });
    const result = await adapter.listDirectory('/path');
    expect(mockFetch).toHaveBeenCalledWith('/api/fs/ls?path=%2Fpath');
    expect(result).toEqual(mockEntries);
  });

  it('listDirectory should throw if response not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false });
    await expect(adapter.listDirectory('/path')).rejects.toThrow(
      'Failed to list directory',
    );
  });

  it('getParentDirectory should fetch /fs/parent and return parent', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ parent: '/parent' }),
    });
    const result = await adapter.getParentDirectory('/parent/child');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/fs/parent?path=%2Fparent%2Fchild',
    );
    expect(result).toBe('/parent');
  });

  it('getParentDirectory should return null if response not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false });
    const result = await adapter.getParentDirectory('/path');
    expect(result).toBeNull();
  });
});
