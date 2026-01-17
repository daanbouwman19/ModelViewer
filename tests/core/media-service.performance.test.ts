import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractAndSaveMetadata } from '../../src/core/media-service';
import { getVideoDuration } from '../../src/core/media-handler';
import fs from 'fs/promises';
import * as database from '../../src/core/database';
import * as mediaUtils from '../../src/core/media-utils';

// Mock dependencies
vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
  },
}));

vi.mock('../../src/core/database', () => ({
  bulkUpsertMetadata: vi.fn(),
  getMediaDirectories: vi.fn(),
  getPendingMetadata: vi.fn(),
  getSetting: vi.fn(),
  getAllMediaViewCounts: vi.fn(),
  getAllMetadata: vi.fn(),
  cacheAlbums: vi.fn(),
  getCachedAlbums: vi.fn(),
}));

vi.mock('../../src/core/media-utils', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isDrivePath: (p: string) => p.startsWith('gdrive://'),
    getMimeType: () => 'video/mp4',
    getFFmpegDuration: vi.fn().mockResolvedValue(100),
    getVlcPath: vi.fn(),
  };
});

describe('Performance Optimization Reproduction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call fs.stat ONCE for a local video file (redundant check removed)', async () => {
    const filePath = '/path/to/video.mp4';

    // Mock fs.stat to return something valid
    vi.mocked(fs.stat).mockResolvedValue({
      size: 1024,
      birthtime: new Date(),
      mtime: new Date(),
      isFile: () => true,
    } as any);

    await extractAndSaveMetadata([filePath], '/usr/bin/ffmpeg');

    // Expected behavior AFTER optimization:
    // 1. extractAndSaveMetadata calls fs.stat
    // 2. getVideoDuration skips provider check
    expect(fs.stat).toHaveBeenCalledTimes(1);

    // Check that video duration was attempted
    expect(mediaUtils.getFFmpegDuration).toHaveBeenCalled();
  });

  it('should call fs.stat ONCE for image files and SKIP video duration check', async () => {
    const filePath = '/path/to/image.jpg';

    // Mock fs.stat
    vi.mocked(fs.stat).mockResolvedValue({
      size: 1024,
      birthtime: new Date(),
      mtime: new Date(),
      isFile: () => true,
    } as any);

    await extractAndSaveMetadata([filePath], '/usr/bin/ffmpeg');

    // Expected behavior AFTER optimization:
    // 1. extractAndSaveMetadata calls fs.stat
    // 2. getVideoDuration is SKIPPED
    expect(fs.stat).toHaveBeenCalledTimes(1);

    // Optimization 2: Should NOT attempt to get duration for images
    expect(mediaUtils.getFFmpegDuration).not.toHaveBeenCalled();
  });
});
