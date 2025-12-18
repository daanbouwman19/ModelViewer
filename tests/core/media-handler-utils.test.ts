import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { Readable } from 'stream';
import { generateFileUrl, openMediaInVlc } from '../../src/core/media-handler';
import { getDriveFileMetadata } from '../../src/main/google-drive-service';
import { getDriveStreamWithCache } from '../../src/core/drive-stream';
import { authorizeFilePath } from '../../src/core/security';

// Mocks
vi.mock('../../src/core/media-utils', () => ({
  getMimeType: vi.fn().mockReturnValue('video/mp4'),
  getThumbnailCachePath: vi.fn(),
  checkThumbnailCache: vi.fn(),
}));

vi.mock('../../src/core/drive-stream', () => ({
  getDriveStreamWithCache: vi.fn(),
}));

vi.mock('../../src/main/google-drive-service', () => ({
  getDriveFileMetadata: vi.fn(),
  getDriveFileStream: vi.fn(),
  getDriveFileThumbnail: vi.fn(),
}));

vi.mock('../../src/core/security', () => ({
  authorizeFilePath: vi.fn(),
}));

const mockFsPromises = vi.hoisted(() => ({
  stat: vi.fn(),
  readFile: vi.fn(),
  access: vi.fn(),
}));

const mockSpawn = vi.hoisted(() => vi.fn());

vi.mock('fs/promises', () => ({ default: mockFsPromises, ...mockFsPromises }));
vi.mock('fs', () => ({
  default: {
    promises: mockFsPromises,
    createReadStream: vi.fn().mockImplementation(() => {
      const s = new Readable();
      s._read = () => {};
      s.push(Buffer.from('data'));
      s.push(null);
      return s;
    }),
  },
  promises: mockFsPromises,
  createReadStream: vi.fn().mockImplementation(() => {
    const s = new Readable();
    s._read = () => {};
    s.push(Buffer.from('data'));
    s.push(null);
    return s;
  }),
}));

vi.mock('child_process', () => ({
  spawn: mockSpawn,
  default: { spawn: mockSpawn },
}));

describe('Media Handler Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateFileUrl', () => {
    it('should return error for large Drive file if serverPort is 0', async () => {
      (getDriveFileMetadata as any).mockResolvedValue({
        size: 10 * 1024 * 1024,
        mimeType: 'video/mp4',
      });

      const result = await generateFileUrl('gdrive://123', { serverPort: 0 });
      expect(result).toEqual({
        type: 'error',
        message: 'Local server not ready to stream large file.',
      });
    });

    it('should return error for large local file if serverPort is 0', async () => {
      (authorizeFilePath as any).mockResolvedValue({ isAllowed: true });
      mockFsPromises.stat.mockResolvedValue({ size: 10 * 1024 * 1024 });

      const result = await generateFileUrl('/local/large.mp4', {
        serverPort: 0,
      });
      expect(result).toEqual({
        type: 'error',
        message: 'Local server not ready to stream large file.',
      });
    });

    it('should return http-url for large local file if serverPort > 0', async () => {
      (authorizeFilePath as any).mockResolvedValue({ isAllowed: true });
      mockFsPromises.stat.mockResolvedValue({ size: 10 * 1024 * 1024 });

      const result = await generateFileUrl('/local/large.mp4', {
        serverPort: 3000,
      });
      expect(result).toEqual({
        type: 'http-url',
        url: 'http://localhost:3000/video/stream?file=%2Flocal%2Flarge.mp4',
      });
    });

    it('should handle fs errors gracefully', async () => {
      (authorizeFilePath as any).mockResolvedValue({ isAllowed: true });
      mockFsPromises.stat.mockRejectedValue(new Error('FS Error'));

      const result = await generateFileUrl('/local/file.mp4', {
        serverPort: 3000,
      });
      expect(result).toEqual({
        type: 'error',
        message: 'FS Error',
      });
    });

    it('should return data-url for small Drive file', async () => {
      (getDriveFileMetadata as any).mockResolvedValue({
        size: 100,
        mimeType: 'video/mp4',
      });
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('data');
        },
      };
      (getDriveStreamWithCache as unknown as Mock).mockResolvedValue({
        stream: mockStream,
        length: 100,
      });

      const result = await generateFileUrl('gdrive://123', {
        serverPort: 3000,
      });
      expect(result.type).toBe('data-url');
    });

    it('should return data-url for small local file', async () => {
      (authorizeFilePath as any).mockResolvedValue({ isAllowed: true });
      mockFsPromises.stat.mockResolvedValue({ size: 100 });
      mockFsPromises.readFile.mockResolvedValue(Buffer.from('data'));

      const result = await generateFileUrl('/local/small.mp4', {
        serverPort: 3000,
      });
      expect(result.type).toBe('data-url');
    });
  });

  describe('openMediaInVlc', () => {
    const originalPlatform = process.platform;
    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return error for Drive file if serverPort is 0', async () => {
      const result = await openMediaInVlc('gdrive://123', 0);
      expect(result).toEqual({
        success: false,
        message: 'Local server is not running to stream files.',
      });
    });

    it('should prepare stream url for Drive file', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const mockChild = { unref: vi.fn(), on: vi.fn() };
      mockSpawn.mockReturnValue(mockChild);

      const result = await openMediaInVlc('gdrive://123', 3000);
      expect(result).toEqual({ success: true });
      expect(mockSpawn).toHaveBeenCalledWith(
        'vlc',
        [expect.stringContaining('http://localhost:3000/video/stream')],
        expect.anything(),
      );
    });

    it('should handle win32 platform', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      mockFsPromises.access.mockResolvedValue(undefined);
      (authorizeFilePath as any).mockResolvedValue({ isAllowed: true });
      const mockChild = { unref: vi.fn(), on: vi.fn() };
      mockSpawn.mockReturnValue(mockChild);

      const result = await openMediaInVlc('/local.mp4', 3000);
      expect(result).toEqual({ success: true });
    });

    it('should handle darwin platform', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockFsPromises.access.mockResolvedValue(undefined);
      (authorizeFilePath as any).mockResolvedValue({ isAllowed: true });
      const mockChild = { unref: vi.fn(), on: vi.fn() };
      mockSpawn.mockReturnValue(mockChild);

      const result = await openMediaInVlc('/local.mp4', 3000);
      expect(result).toEqual({ success: true });
    });
  });
});
