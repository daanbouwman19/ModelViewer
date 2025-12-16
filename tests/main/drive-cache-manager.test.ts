import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import fs from 'fs';
import { EventEmitter } from 'events';
import {
  cleanupDriveCacheManager,
  getDriveCacheManager,
  initializeDriveCacheManager,
} from '../../src/main/drive-cache-manager';

// Mocks
vi.mock('fs', () => {
  const mocks = {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn(),
    rmSync: vi.fn(),
    createWriteStream: vi.fn(),
    promises: {
      stat: vi.fn(),
      unlink: vi.fn(),
      readdir: vi.fn(),
      rm: vi.fn(),
    },
  };
  return {
    default: mocks,
    ...mocks,
  };
});

vi.mock('../../src/main/google-drive-service', () => ({
  getDriveFileMetadata: vi.fn(),
  getDriveFileStream: vi.fn(),
}));

describe('DriveCacheManager', () => {
  let driveCacheManager: ReturnType<typeof initializeDriveCacheManager>;
  const statMock = () => fs.promises.stat as unknown as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    cleanupDriveCacheManager();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    statMock().mockReset();
    statMock().mockRejectedValue(
      Object.assign(new Error('Not Found'), { code: 'ENOENT' }),
    );
    driveCacheManager = initializeDriveCacheManager('drive-cache-test');
    // Clear private maps if possible, but singleton persists.
    // We rely on mocks to control flow per test.
    // For activeDownloads we might need to be careful if previous tests left them hanging.
  });

  it('initializes cache directory', async () => {
    expect(fs.mkdirSync).toHaveBeenCalledWith('drive-cache-test', {
      recursive: true,
    });
  });

  it('getCachedFilePath returns existing cache', async () => {
    const fileId = 'existing-file';
    const driveService = await import('../../src/main/google-drive-service');
    vi.mocked(driveService.getDriveFileMetadata).mockResolvedValue({
      size: '1000',
      mimeType: 'video/mp4',
    } as any);

    statMock().mockResolvedValue({ size: 1000 } as any);

    const result = await driveCacheManager.getCachedFilePath(fileId);

    expect(result.path).toContain(fileId);
    expect(result.totalSize).toBe(1000);
    expect(result.mimeType).toBe('video/mp4');
  });

  it('getCachedFilePath handles metadata fetch error', async () => {
    const fileId = 'meta-error-file';
    const driveService = await import('../../src/main/google-drive-service');
    vi.mocked(driveService.getDriveFileMetadata).mockRejectedValue(
      new Error('Meta Fail'),
    );

    statMock().mockResolvedValue({ size: 1000 } as any);

    const result = await driveCacheManager.getCachedFilePath(fileId);

    // Should fallback to defaults
    expect(result.totalSize).toBe(0);
    expect(result.mimeType).toBe('video/mp4');
  });

  it('reuses cached metadata on subsequent calls', async () => {
    const fileId = 'cached-file';
    const driveService = await import('../../src/main/google-drive-service');
    vi.mocked(driveService.getDriveFileMetadata).mockResolvedValue({
      size: '1500',
      mimeType: 'video/mp4',
    } as any);

    statMock().mockResolvedValue({ size: 1500 } as any);

    await driveCacheManager.getCachedFilePath(fileId);
    expect(driveService.getDriveFileMetadata).toHaveBeenCalledTimes(1);

    await driveCacheManager.getCachedFilePath(fileId);
    expect(driveService.getDriveFileMetadata).toHaveBeenCalledTimes(1);
  });

  it('getCachedFilePath resumes partial download', async () => {
    const fileId = 'partial-file';
    const driveService = await import('../../src/main/google-drive-service');
    vi.mocked(driveService.getDriveFileMetadata).mockResolvedValue({
      size: '2000',
      mimeType: 'video/mp4',
    } as any);

    statMock().mockResolvedValue({ size: 500 } as any);

    const writeStream = new EventEmitter();
    (writeStream as any).path = '/tmp/cache/partial';
    vi.mocked(fs.createWriteStream).mockReturnValue(writeStream as any);
    const mockStream = { pipe: vi.fn(), on: vi.fn() };
    vi.mocked(driveService.getDriveFileStream).mockResolvedValue(
      mockStream as any,
    );

    // Immediate resolution of startDownload promise
    setTimeout(() => writeStream.emit('ready'), 5);

    await driveCacheManager.getCachedFilePath(fileId);

    // Expect startDownload called with offset 500
    expect(driveService.getDriveFileStream).toHaveBeenCalledWith(
      fileId,
      expect.objectContaining({ start: 500 }),
    );
  });

  it('getCachedFilePath downloads file on cache miss', async () => {
    const fileId = 'missing-file';
    const driveService = await import('../../src/main/google-drive-service');
    vi.mocked(driveService.getDriveFileMetadata).mockResolvedValue({
      size: '200',
      mimeType: 'video/mp4',
    } as any);

    statMock().mockRejectedValue(
      Object.assign(new Error('Not Found'), { code: 'ENOENT' }),
    );

    const mockStream = { pipe: vi.fn(), on: vi.fn() };
    vi.mocked(driveService.getDriveFileStream).mockResolvedValue(
      mockStream as any,
    );

    const writeStream = new EventEmitter();
    (writeStream as any).path = '/tmp/cache/file';
    vi.mocked(fs.createWriteStream).mockReturnValue(writeStream as any);

    // Emit 'ready' to resolve the promise
    setTimeout(() => writeStream.emit('ready'), 10);
    // Emit 'finish' to clean up active download map
    setTimeout(() => writeStream.emit('finish'), 20);

    const promise = driveCacheManager.getCachedFilePath(fileId);
    const result = await promise;

    expect(result.totalSize).toBe(200);
    expect(fs.createWriteStream).toHaveBeenCalled();
    expect(driveService.getDriveFileStream).toHaveBeenCalledWith(
      fileId,
      expect.anything(),
    );
  });

  it('getCachedFilePath handles download error (start fail)', async () => {
    const fileId = 'error-file';
    statMock().mockRejectedValue(
      Object.assign(new Error('Not Found'), { code: 'ENOENT' }),
    );

    const driveService = await import('../../src/main/google-drive-service');
    vi.mocked(driveService.getDriveFileStream).mockRejectedValue(
      new Error('Download Fail'),
    );
    vi.mocked(driveService.getDriveFileMetadata).mockResolvedValue({
      size: '100',
      mimeType: 'video/mp4',
    } as any);

    await expect(driveCacheManager.getCachedFilePath(fileId)).rejects.toThrow(
      'Download Fail',
    );
  });

  it('handles stream error properly', async () => {
    const fileId = 'stream-error-file';
    statMock().mockRejectedValue(
      Object.assign(new Error('Not Found'), { code: 'ENOENT' }),
    );
    const driveService = await import('../../src/main/google-drive-service');
    vi.mocked(driveService.getDriveFileMetadata).mockResolvedValue({
      size: '100',
      mimeType: 'video/mp4',
    } as any);

    const mockSourceStream = new EventEmitter();
    (mockSourceStream as any).pipe = vi.fn();
    vi.mocked(driveService.getDriveFileStream).mockResolvedValue(
      mockSourceStream as any,
    );

    const writeStream = new EventEmitter();
    (writeStream as any).close = vi.fn();
    vi.mocked(fs.createWriteStream).mockReturnValue(writeStream as any);

    setTimeout(() => writeStream.emit('ready'), 10);
    const res = await driveCacheManager.getCachedFilePath(fileId);
    expect(res.path).toBeDefined();

    // Emit error on source stream AFTER resolution
    mockSourceStream.emit('error', new Error('Stream Dies'));

    expect((writeStream as any).close).toHaveBeenCalled();
  });

  it('active download handles concurrent requests', async () => {
    const fileId = 'concurrent-file';
    statMock().mockRejectedValue(
      Object.assign(new Error('Not Found'), { code: 'ENOENT' }),
    );
    const driveService = await import('../../src/main/google-drive-service');
    vi.mocked(driveService.getDriveFileMetadata).mockResolvedValue({
      size: '100',
      mimeType: 'video/mp4',
    } as any);

    const mockStream = { pipe: vi.fn(), on: vi.fn() };
    vi.mocked(driveService.getDriveFileStream).mockResolvedValue(
      mockStream as any,
    );

    const writeStream = new EventEmitter();
    vi.mocked(fs.createWriteStream).mockReturnValue(writeStream as any);

    setTimeout(() => writeStream.emit('ready'), 10);

    const p1 = driveCacheManager.getCachedFilePath(fileId);
    const p2 = driveCacheManager.getCachedFilePath(fileId);

    await Promise.all([p1, p2]);

    expect(driveService.getDriveFileStream).toHaveBeenCalledTimes(1);
  });

  it('cleanup deletes files', async () => {
    vi.mocked(fs.promises.readdir).mockResolvedValue(['file1', 'file2'] as any);
    // Clean up uses rmSync
    await driveCacheManager.cleanup();
    expect(fs.rmSync).toHaveBeenCalled();
  });

  it('cleanup handles error', async () => {
    vi.mocked(fs.rmSync).mockImplementation(() => {
      throw new Error('Delete fail');
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    driveCacheManager.cleanup();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cleanup failed'),
      expect.anything(),
    );
  });

  it('logs stat errors that are not ENOENT', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    statMock().mockRejectedValueOnce(
      Object.assign(new Error('Permission denied'), { code: 'EPERM' }),
    );

    const fileId = 'missing-but-error';
    const driveService = await import('../../src/main/google-drive-service');
    vi.mocked(driveService.getDriveFileMetadata).mockResolvedValue({
      size: '100',
      mimeType: 'video/mp4',
    } as any);

    const mockStream = { pipe: vi.fn(), on: vi.fn() };
    vi.mocked(driveService.getDriveFileStream).mockResolvedValue(
      mockStream as any,
    );

    const writeStream = new EventEmitter();
    vi.mocked(fs.createWriteStream).mockReturnValue(writeStream as any);
    setTimeout(() => writeStream.emit('ready'), 0);

    await driveCacheManager.getCachedFilePath(fileId);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to stat cache file'),
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });

  it('throws when getting manager before initialization', () => {
    cleanupDriveCacheManager();
    expect(() => getDriveCacheManager()).toThrow(
      'DriveCacheManager has not been initialized.',
    );
  });

  it('cleanupDriveCacheManager is safe when no instance exists', () => {
    cleanupDriveCacheManager();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    cleanupDriveCacheManager();
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
