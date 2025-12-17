import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalMediaSource, DriveMediaSource, createMediaSource } from '../../src/core/media-source';
import * as security from '../../src/core/security';
import fs from 'fs';
import { getDriveCacheManager } from '../../src/main/drive-cache-manager';
import { getDriveFileStream, getDriveFileMetadata } from '../../src/main/google-drive-service';
import { InternalMediaProxy } from '../../src/core/media-proxy';

// Mock dependencies
vi.mock('fs', () => ({
  default: {
    createReadStream: vi.fn(),
    promises: {
      stat: vi.fn(),
    },
  },
  createReadStream: vi.fn(),
  promises: {
    stat: vi.fn(),
  }
}));

vi.mock('../../src/core/security', () => ({
  authorizeFilePath: vi.fn(),
}));

vi.mock('../../src/main/drive-cache-manager', () => ({
  getDriveCacheManager: vi.fn(),
}));

vi.mock('../../src/main/google-drive-service', () => ({
  getDriveFileStream: vi.fn(),
  getDriveFileMetadata: vi.fn(),
}));

vi.mock('../../src/core/media-proxy', () => ({
  InternalMediaProxy: {
    getInstance: vi.fn().mockReturnValue({
      getUrlForFile: vi.fn().mockResolvedValue('http://proxy/stream/id'),
    }),
  },
}));

describe('LocalMediaSource', () => {
  const filePath = '/path/to/video.mp4';
  let source: LocalMediaSource;

  beforeEach(() => {
    vi.clearAllMocks();
    source = new LocalMediaSource(filePath);
    // Default allowed
    vi.mocked(security.authorizeFilePath).mockResolvedValue({ isAllowed: true });
    vi.mocked(fs.promises.stat).mockResolvedValue({ size: 1000 } as any);
  });

  it('getFFmpegInput returns path if allowed', async () => {
    expect(await source.getFFmpegInput()).toBe(filePath);
  });

  it('getFFmpegInput throws if denied', async () => {
    vi.mocked(security.authorizeFilePath).mockResolvedValue({ isAllowed: false, message: 'Denied' });
    await expect(source.getFFmpegInput()).rejects.toThrow('Denied');
  });

  it('getStream returns stream and length', async () => {
    const mockStream = 'stream' as any;
    vi.mocked(fs.createReadStream).mockReturnValue(mockStream);

    const result = await source.getStream();
    expect(result.length).toBe(1000);
    expect(result.stream).toBe(mockStream);
    // If range is undefined, fs.createReadStream is called with {}
    expect(fs.createReadStream).toHaveBeenCalledWith(filePath, {});
  });

  it('getStream respects range', async () => {
    const mockStream = 'stream' as any;
    vi.mocked(fs.createReadStream).mockReturnValue(mockStream);

    const result = await source.getStream({ start: 100, end: 199 });
    expect(result.length).toBe(100);
    expect(fs.createReadStream).toHaveBeenCalledWith(filePath, { start: 100, end: 199 });
  });

  it('getMimeType returns correct mime based on extension', async () => {
    expect(await new LocalMediaSource('test.mp4').getMimeType()).toBe('video/mp4');
    expect(await new LocalMediaSource('test.jpg').getMimeType()).toBe('application/octet-stream'); // Logic is limited in source
  });
});

describe('DriveMediaSource', () => {
  const fileId = 'file123';
  const drivePath = `gdrive://${fileId}`;
  let source: DriveMediaSource;

  beforeEach(() => {
    vi.clearAllMocks();
    source = new DriveMediaSource(drivePath);
  });

  it('getFFmpegInput returns proxy url', async () => {
    const url = await source.getFFmpegInput();
    expect(url).toBe('http://proxy/stream/id');
  });

  it('getStream uses cache if available (hybrid)', async () => {
    const mockCache = { path: '/cache/file', totalSize: 1000 };
    vi.mocked(getDriveCacheManager).mockReturnValue({
      getCachedFilePath: vi.fn().mockResolvedValue(mockCache),
    } as any);

    vi.mocked(fs.promises.stat).mockResolvedValue({ size: 500 } as any); // Cached 500 bytes
    vi.mocked(fs.createReadStream).mockReturnValue('cacheStream' as any);

    // Request start < cachedSize
    const result = await source.getStream({ start: 0, end: 999 });

    expect(result.stream).toBe('cacheStream');
    expect(result.length).toBe(500); // Serve cached part only
    expect(fs.createReadStream).toHaveBeenCalledWith('/cache/file', { start: 0, end: 499 });
  });

  it('getStream hits drive if cache miss', async () => {
    const mockCache = { path: '/cache/file', totalSize: 1000 };
    vi.mocked(getDriveCacheManager).mockReturnValue({
      getCachedFilePath: vi.fn().mockResolvedValue(mockCache),
    } as any);

    vi.mocked(fs.promises.stat).mockResolvedValue({ size: 500 } as any);
    vi.mocked(getDriveFileStream).mockResolvedValue('driveStream' as any);

    // Request start >= cachedSize
    const result = await source.getStream({ start: 600, end: 999 });

    expect(result.stream).toBe('driveStream');
    expect(result.length).toBe(400);
    expect(getDriveFileStream).toHaveBeenCalledWith(fileId, { start: 600, end: 999 });
  });
});

describe('createMediaSource', () => {
  it('creates DriveMediaSource for gdrive protocol', () => {
    const s = createMediaSource('gdrive://id');
    expect(s).toBeInstanceOf(DriveMediaSource);
  });
  it('creates LocalMediaSource for other paths', () => {
    const s = createMediaSource('/local/path');
    expect(s).toBeInstanceOf(LocalMediaSource);
  });
});
