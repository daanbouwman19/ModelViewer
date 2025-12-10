import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElectronAdapter } from '../../../src/renderer/api/ElectronAdapter';

describe('ElectronAdapter', () => {
  let adapter: ElectronAdapter;
  const mockElectronAPI = {
    loadFileAsDataURL: vi.fn(),
    recordMediaView: vi.fn(),
    getMediaViewCounts: vi.fn(),
    getAlbumsWithViewCounts: vi.fn(),
    reindexMediaLibrary: vi.fn(),
    addMediaDirectory: vi.fn(),
    removeMediaDirectory: vi.fn(),
    setDirectoryActiveState: vi.fn(),
    getMediaDirectories: vi.fn(),
    getSupportedExtensions: vi.fn(),
    getServerPort: vi.fn(),
    openInVlc: vi.fn(),

    listDirectory: vi.fn(),
    getParentDirectory: vi.fn(),
  };

  beforeEach(() => {
    // Setup global window.electronAPI mock
    global.window.electronAPI = mockElectronAPI as any;
    adapter = new ElectronAdapter();
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.window.electronAPI = undefined as any;
  });

  it('loadFileAsDataURL should call electronAPI.loadFileAsDataURL', async () => {
    const mockResult = { type: 'data-url', url: 'data:...' };
    mockElectronAPI.loadFileAsDataURL.mockResolvedValue(mockResult);

    const result = await adapter.loadFileAsDataURL('test.jpg');

    expect(mockElectronAPI.loadFileAsDataURL).toHaveBeenCalledWith('test.jpg');
    expect(result).toBe(mockResult);
  });

  it('recordMediaView should call electronAPI.recordMediaView', async () => {
    mockElectronAPI.recordMediaView.mockResolvedValue(undefined);

    await adapter.recordMediaView('test.jpg');

    expect(mockElectronAPI.recordMediaView).toHaveBeenCalledWith('test.jpg');
  });

  it('getMediaViewCounts should call electronAPI.getMediaViewCounts', async () => {
    const mockCounts = { 'test.jpg': 5 };
    mockElectronAPI.getMediaViewCounts.mockResolvedValue(mockCounts);

    const result = await adapter.getMediaViewCounts(['test.jpg']);

    expect(mockElectronAPI.getMediaViewCounts).toHaveBeenCalledWith([
      'test.jpg',
    ]);
    expect(result).toBe(mockCounts);
  });

  it('getAlbumsWithViewCounts should call electronAPI.getAlbumsWithViewCounts', async () => {
    const mockAlbums = [{ id: '1', title: 'Album' }];
    mockElectronAPI.getAlbumsWithViewCounts.mockResolvedValue(mockAlbums);

    const result = await adapter.getAlbumsWithViewCounts();

    expect(mockElectronAPI.getAlbumsWithViewCounts).toHaveBeenCalled();
    expect(result).toBe(mockAlbums);
  });

  it('reindexMediaLibrary should call electronAPI.reindexMediaLibrary', async () => {
    const mockAlbums = [{ id: '1', title: 'Album' }];
    mockElectronAPI.reindexMediaLibrary.mockResolvedValue(mockAlbums);

    const result = await adapter.reindexMediaLibrary();

    expect(mockElectronAPI.reindexMediaLibrary).toHaveBeenCalled();
    expect(result).toBe(mockAlbums);
  });

  it('addMediaDirectory should call electronAPI.addMediaDirectory', async () => {
    mockElectronAPI.addMediaDirectory.mockResolvedValue('/new/path');

    const result = await adapter.addMediaDirectory('/test');

    expect(mockElectronAPI.addMediaDirectory).toHaveBeenCalledWith('/test');
    expect(result).toBe('/new/path');
  });

  it('removeMediaDirectory should call electronAPI.removeMediaDirectory', async () => {
    mockElectronAPI.removeMediaDirectory.mockResolvedValue(undefined);

    await adapter.removeMediaDirectory('/path');

    expect(mockElectronAPI.removeMediaDirectory).toHaveBeenCalledWith('/path');
  });

  it('setDirectoryActiveState should call electronAPI.setDirectoryActiveState', async () => {
    mockElectronAPI.setDirectoryActiveState.mockResolvedValue(undefined);

    await adapter.setDirectoryActiveState('/path', true);

    expect(mockElectronAPI.setDirectoryActiveState).toHaveBeenCalledWith(
      '/path',
      true,
    );
  });

  it('getMediaDirectories should call electronAPI.getMediaDirectories', async () => {
    const mockDirs = [{ path: '/path', isActive: true }];
    mockElectronAPI.getMediaDirectories.mockResolvedValue(mockDirs);

    const result = await adapter.getMediaDirectories();

    expect(mockElectronAPI.getMediaDirectories).toHaveBeenCalled();
    expect(result).toBe(mockDirs);
  });

  it('getSupportedExtensions should call electronAPI.getSupportedExtensions', async () => {
    const mockExts = { images: ['jpg'], videos: ['mp4'], all: ['jpg', 'mp4'] };
    mockElectronAPI.getSupportedExtensions.mockResolvedValue(mockExts);

    const result = await adapter.getSupportedExtensions();

    expect(mockElectronAPI.getSupportedExtensions).toHaveBeenCalled();
    expect(result).toBe(mockExts);
  });

  it('getServerPort should call electronAPI.getServerPort', async () => {
    mockElectronAPI.getServerPort.mockResolvedValue(1234);

    const result = await adapter.getServerPort();

    expect(mockElectronAPI.getServerPort).toHaveBeenCalled();
    expect(result).toBe(1234);
  });

  it('getMediaUrlGenerator should return a function that generates URLs', async () => {
    mockElectronAPI.getServerPort.mockResolvedValue(3000);

    const generator = await adapter.getMediaUrlGenerator();
    const url = generator('C:\\path\\to\\file.jpg');

    // The implementation encodes each segment, including 'C:'.
    // 'C:' becomes 'C%3A' when encoded.
    expect(url).toBe('http://localhost:3000/C%3A/path/to/file.jpg');
    // Also test special characters
    const url2 = generator('path/to/my file.jpg');
    expect(url2).toBe('http://localhost:3000/path/to/my%20file.jpg');
  });

  it('getThumbnailUrlGenerator should return a function that generates URLs', async () => {
    mockElectronAPI.getServerPort.mockResolvedValue(3000);

    const generator = await adapter.getThumbnailUrlGenerator();
    const url = generator('path/to/file.mp4');

    expect(url).toBe(
      'http://localhost:3000/video/thumbnail?file=path%2Fto%2Ffile.mp4',
    );
  });

  it('getVideoStreamUrlGenerator should return a function that generates URLs', async () => {
    mockElectronAPI.getServerPort.mockResolvedValue(3000);

    const generator = await adapter.getVideoStreamUrlGenerator();
    const url = generator('path/to/file.mp4', 10);

    expect(url).toBe(
      'http://localhost:3000/video/stream?file=path%2Fto%2Ffile.mp4&startTime=10',
    );

    // Test default arg
    const urlDefault = generator('path/to/file.mp4');
    expect(urlDefault).toBe(
      'http://localhost:3000/video/stream?file=path%2Fto%2Ffile.mp4&startTime=0',
    );
  });

  it('getVideoMetadata should fetch metadata from server', async () => {
    mockElectronAPI.getServerPort.mockResolvedValue(3000);
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ duration: 100 }),
    });
    global.fetch = mockFetch;

    const result = await adapter.getVideoMetadata('file.mp4');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:3000/video/metadata'),
    );
    expect(result).toEqual({ duration: 100 });
  });

  it('openInVlc should call electronAPI.openInVlc', async () => {
    const mockResponse = { success: true };
    mockElectronAPI.openInVlc.mockResolvedValue(mockResponse);

    const result = await adapter.openInVlc('file.mp4');

    expect(mockElectronAPI.openInVlc).toHaveBeenCalledWith('file.mp4');
    expect(result).toBe(mockResponse);
  });

  it('listDirectory should call electronAPI.listDirectory', async () => {
    const mockEntries = [{ name: 'test', isDirectory: false }];
    mockElectronAPI.listDirectory.mockResolvedValue(mockEntries);

    const result = await adapter.listDirectory('/path');

    expect(mockElectronAPI.listDirectory).toHaveBeenCalledWith('/path');
    expect(result).toBe(mockEntries);
  });

  it('getParentDirectory should call electronAPI.getParentDirectory', async () => {
    mockElectronAPI.getParentDirectory.mockResolvedValue('/parent');

    const result = await adapter.getParentDirectory('/parent/child');

    expect(mockElectronAPI.getParentDirectory).toHaveBeenCalledWith(
      '/parent/child',
    );
    expect(result).toBe('/parent');
  });
});
