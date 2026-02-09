import { vi, describe, it, expect, beforeEach } from 'vitest';
import { extractAndSaveMetadata } from '../../src/core/media-service';

// Mock dependencies
vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn().mockResolvedValue({
      size: 1024,
      birthtime: new Date(),
      mtime: new Date(),
      isFile: () => true,
    }),
  },
}));

// Mock MediaRepository via database module since MediaService imports from repo
vi.mock('../../src/core/database', () => ({
  bulkUpsertMetadata: vi.fn(),
  getMediaDirectories: vi.fn(),
  getPendingMetadata: vi.fn(),
  getSetting: vi.fn(),
  getAllMediaViewCounts: vi.fn(),
  getAllMetadata: vi.fn().mockResolvedValue({}),
  getAllMetadataStats: vi.fn().mockResolvedValue({}),
  getAllMetadataVerification: vi.fn().mockResolvedValue({}),
  cacheAlbums: vi.fn(),
  getCachedAlbums: vi.fn(),
  getMetadata: vi.fn().mockResolvedValue({}),
  filterProcessingNeeded: vi
    .fn()
    .mockImplementation((paths) => Promise.resolve(paths)),
}));

vi.mock('../../src/core/media-utils', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    isDrivePath: (p: string) => p.startsWith('gdrive://'),
    getMimeType: () => 'video/mp4',
  };
});

vi.mock('../../src/core/utils/ffmpeg-utils', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getFFmpegDuration: vi.fn().mockResolvedValue(100),
  };
});

// Import the mocked database functions to spy on them
import * as db from '../../src/core/database';
import { METADATA_VERIFICATION_THRESHOLD } from '../../src/core/constants';

describe('MediaService Metadata Optimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(`should call getAllMetadataVerification (optimized) when processing > ${METADATA_VERIFICATION_THRESHOLD} files`, async () => {
    // Create > THRESHOLD dummy file paths
    const filePaths = Array.from(
      { length: METADATA_VERIFICATION_THRESHOLD + 1 },
      (_, i) => `/path/to/file_${i}.mp4`,
    );

    await extractAndSaveMetadata(filePaths, '/usr/bin/ffmpeg');

    // Optimization: Should use verification query instead of full metadata query
    expect(db.getAllMetadataVerification).toHaveBeenCalledTimes(1);
    expect(db.getAllMetadata).not.toHaveBeenCalled();
    expect(db.getMetadata).not.toHaveBeenCalled();
  });

  it(`should call getMetadata when processing <= ${METADATA_VERIFICATION_THRESHOLD} files`, async () => {
    const filePaths = Array.from(
      { length: METADATA_VERIFICATION_THRESHOLD },
      (_, i) => `/path/to/file_${i}.mp4`,
    );

    await extractAndSaveMetadata(filePaths, '/usr/bin/ffmpeg');

    expect(db.getAllMetadataVerification).not.toHaveBeenCalled();
    expect(db.getAllMetadata).not.toHaveBeenCalled();
    expect(db.getMetadata).toHaveBeenCalledTimes(1);
  });
});
