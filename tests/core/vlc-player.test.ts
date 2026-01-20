import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { openMediaInVlc } from '../../src/core/vlc-player';

const { mockSpawn, mockAuthorizeFilePath, mockFsAccess } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockAuthorizeFilePath: vi.fn(),
  mockFsAccess: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: mockSpawn,
  default: { spawn: mockSpawn },
}));

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    default: {
      ...actual,
      access: mockFsAccess,
    },
    access: mockFsAccess,
  };
});

vi.mock('../../src/core/security', () => ({
  authorizeFilePath: mockAuthorizeFilePath,
}));

vi.mock('../../src/core/media-utils', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/core/media-utils')>();
  return {
    ...actual,
    getVlcPath: vi.fn().mockResolvedValue('/usr/bin/vlc'),
  };
});

describe('vlc-player unit tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawn.mockReset();
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
      // Mock spawn to succeed
      const mockChild = { unref: vi.fn(), on: vi.fn() };
      mockSpawn.mockReturnValue(mockChild);

      const result = await openMediaInVlc('gdrive://123', 3000);
      expect(result).toEqual({ success: true });
      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/vlc',
        [expect.stringContaining('http://localhost:3000/video/stream')],
        expect.anything(),
      );
    });

    it('should handle win32 platform', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      mockFsAccess.mockResolvedValue(undefined);

      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      const mockChild = { unref: vi.fn(), on: vi.fn() };
      mockSpawn.mockReturnValue(mockChild);

      const result = await openMediaInVlc('/local.mp4', 3000);
      expect(result).toEqual({ success: true });
    });

    it('should handle darwin platform', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockFsAccess.mockResolvedValue(undefined);
      mockAuthorizeFilePath.mockResolvedValue({ isAllowed: true });
      const mockChild = { unref: vi.fn(), on: vi.fn() };
      mockSpawn.mockReturnValue(mockChild);

      const result = await openMediaInVlc('/local.mp4', 3000);
      expect(result).toEqual({ success: true });
    });

    it('should resolve with failure when spawn fails asynchronously', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const mockChild = new EventEmitter();
      (mockChild as any).unref = vi.fn();
      mockSpawn.mockReturnValue(mockChild);
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Use fake timers to control the 300ms delay
      vi.useFakeTimers();

      const promise = openMediaInVlc('gdrive://123', 3000);

      // Wait for spawn to be called (handles async getVlcPath)
      await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

      // Trigger error asynchronously (before timeout)
      mockChild.emit('error', new Error('Spawn Error'));

      const result = await promise;

      expect(consoleSpy).toHaveBeenCalledWith(
        '[vlc-player] Error launching VLC (async):',
        expect.any(Error),
      );
      expect(result).toEqual({
        success: false,
        message: 'Failed to launch VLC: Spawn Error',
      });
      consoleSpy.mockRestore();
      vi.useRealTimers();
    });

    it('should resolve with success after timeout if no error', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const mockChild = new EventEmitter();
      (mockChild as any).unref = vi.fn();
      mockSpawn.mockReturnValue(mockChild);

      vi.useFakeTimers();

      const promise = openMediaInVlc('gdrive://123', 3000);

      // Wait for spawn to be called (handles async getVlcPath)
      await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

      // Fast-forward past the 300ms timeout
      vi.advanceTimersByTime(300);

      const result = await promise;
      expect(result).toEqual({ success: true });
      expect((mockChild as any).unref).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
