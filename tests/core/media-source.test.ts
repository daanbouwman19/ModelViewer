import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';
import {
  LocalMediaSource,
  DriveMediaSource,
  createMediaSource,
} from '../../src/core/media-source';

// Mocks
const {
  mockFsStat,
  mockFsCreateReadStream,
  mockAuthorizeFilePath,
  mockGetDriveFileMetadata,
  mockGetDriveStreamWithCache,
  mockProxyGetUrlForFile,
} = vi.hoisted(() => ({
  mockFsStat: vi.fn(),
  mockFsCreateReadStream: vi.fn(),
  mockAuthorizeFilePath: vi.fn(),
  mockGetDriveFileMetadata: vi.fn(),
  mockGetDriveStreamWithCache: vi.fn(),
  mockProxyGetUrlForFile: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      promises: { ...actual.promises, stat: mockFsStat },
      createReadStream: mockFsCreateReadStream,
    },
    promises: { ...actual.promises, stat: mockFsStat },
    createReadStream: mockFsCreateReadStream,
  };
});

vi.mock('../../src/core/security', () => ({
  authorizeFilePath: mockAuthorizeFilePath,
}));

vi.mock('../../src/main/google-drive-service', () => ({
  getDriveFileMetadata: mockGetDriveFileMetadata,
}));

vi.mock('../../src/core/drive-stream', () => ({
  getDriveStreamWithCache: mockGetDriveStreamWithCache,
}));

// Mock InternalMediaProxy singleton
vi.mock('../../src/core/media-proxy', () => ({
  InternalMediaProxy: {
    getInstance: () => ({
      getUrlForFile: mockProxyGetUrlForFile,
    }),
  },
}));

describe('media-source', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('LocalMediaSource', () => {
    const filePath = '/local/file.mp4';
    let source: LocalMediaSource;

    beforeEach(() => {
      source = new LocalMediaSource(filePath);
    });

    it('getFFmpegInput throws if access denied', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: false });
      await expect(source.getFFmpegInput()).rejects.toThrow('Access denied');
    });

    it('getFFmpegInput returns path if allowed', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      expect(await source.getFFmpegInput()).toBe(filePath);
    });

    it('getStream throws if access denied', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: false });
      await expect(source.getStream()).rejects.toThrow('Access denied');
    });

    it('getStream creates fs stream', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      mockFsStat.mockResolvedValue({ size: 1000 });
      const mockStream = { pipe: vi.fn() };
      mockFsCreateReadStream.mockReturnValue(mockStream);

      const result = await source.getStream();
      expect(result.length).toBe(1000);
      expect(mockFsCreateReadStream).toHaveBeenCalledWith(
        filePath,
        expect.objectContaining({}),
      );
    });

    it('getStream handles range', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      mockFsStat.mockResolvedValue({ size: 1000 });
      const mockStream = { pipe: vi.fn() };
      mockFsCreateReadStream.mockReturnValue(mockStream);

      const result = await source.getStream({ start: 100, end: 200 });
      expect(result.length).toBe(101);
      expect(mockFsCreateReadStream).toHaveBeenCalledWith(
        filePath,
        expect.objectContaining({ start: 100, end: 200 }),
      );
    });

    it('getMimeType detects video types', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      const s = new LocalMediaSource('test.mp4');
      expect(await s.getMimeType()).toBe('video/mp4');
    });

    it('getMimeType defaults to octet-stream', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      const s = new LocalMediaSource('test.xyz');
      expect(await s.getMimeType()).toBe('application/octet-stream');
    });

    it('getSize returns stat size', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      mockFsStat.mockResolvedValue({ size: 500 });
      expect(await source.getSize()).toBe(500);
    });

    it('getMimeType throws if access denied', async () => {
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: false });
      await expect(source.getMimeType()).rejects.toThrow('Access denied');
    });
  });

  describe('DriveMediaSource', () => {
    const filePath = 'gdrive://123';
    const source = new DriveMediaSource(filePath);

    it('getFFmpegInput delegates to InternalMediaProxy', async () => {
      mockProxyGetUrlForFile.mockResolvedValue('http://proxy/123');
      expect(await source.getFFmpegInput()).toBe('http://proxy/123');
      expect(mockProxyGetUrlForFile).toHaveBeenCalledWith('123');
    });

    it('getStream delegates to drive-stream', async () => {
      const mockStream = new Readable();
      mockGetDriveStreamWithCache.mockResolvedValue({
        stream: mockStream,
        length: 100,
      });
      const result = await source.getStream({ start: 0, end: 10 });
      expect(mockGetDriveStreamWithCache).toHaveBeenCalledWith('123', {
        start: 0,
        end: 10,
      });
      expect(result.length).toBe(100);
    });

    it('getMimeType returns metadata mimeType', async () => {
      mockGetDriveFileMetadata.mockResolvedValue({ mimeType: 'video/mp4' });
      expect(await source.getMimeType()).toBe('video/mp4');
    });

    it('getMimeType fallback on error', async () => {
      mockGetDriveFileMetadata.mockRejectedValue(new Error('fail'));
      expect(await source.getMimeType()).toBe('application/octet-stream');
    });

    it('getSize returns metadata size', async () => {
      mockGetDriveFileMetadata.mockResolvedValue({ size: '999' });
      expect(await source.getSize()).toBe(999);
    });
  });

  describe('createMediaSource', () => {
    it('creates DriveMediaSource for gdrive:// prefix', () => {
      const s = createMediaSource('gdrive://abc');
      expect(s).toBeInstanceOf(DriveMediaSource);
    });

    it('creates LocalMediaSource otherwise', () => {
      const s = createMediaSource('/local/path');
      expect(s).toBeInstanceOf(LocalMediaSource);
    });
  });
});
