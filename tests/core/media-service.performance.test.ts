import { vi, describe, it, expect, beforeEach } from 'vitest';
import { extractAndSaveMetadata } from '../../src/core/media-service';
import fs from 'fs/promises';
import * as ffmpegUtils from '../../src/core/utils/ffmpeg-utils';

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
  getMetadata: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../src/core/media-utils', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    isDrivePath: (p: string) => p.startsWith('gdrive://'),
    getMimeType: () => 'video/mp4',
    getVlcPath: vi.fn(),
  };
});

vi.mock('../../src/core/utils/ffmpeg-utils', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getFFmpegDuration: vi.fn().mockResolvedValue(100),
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
    expect(ffmpegUtils.getFFmpegDuration).toHaveBeenCalled();
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
    expect(ffmpegUtils.getFFmpegDuration).not.toHaveBeenCalled();
  });
});
