import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractAndSaveMetadata } from '../../src/core/media-service';
import * as db from '../../src/core/database';
import * as mediaHandler from '../../src/core/media-handler';
import fs from 'fs/promises';
import { isDrivePath } from '../../src/core/media-utils';

vi.mock('../../src/core/database', () => ({
  bulkUpsertMetadata: vi.fn(),
  getAllMetadata: vi.fn(),
  getMetadata: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../src/core/media-handler');
vi.mock('../../src/core/media-utils'); // Auto-mock

vi.mock('fs/promises', () => {
  const stat = vi.fn();
  return {
    stat,
    default: { stat },
  };
});

describe('media-service coverage', () => {
  const mockFfmpegPath = '/path/to/ffmpeg';
  const testFile = '/path/to/video.mp4';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock behavior for isDrivePath
    if (vi.isMockFunction(isDrivePath)) {
      vi.mocked(isDrivePath).mockImplementation((path) =>
        path.startsWith('gdrive://'),
      );
    }
  });

  it('extractAndSaveMetadata handles fs.stat errors gracefully', async () => {
    vi.mocked(fs.stat).mockImplementation(() => {
      throw new Error('File not found');
    });
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await extractAndSaveMetadata([testFile], mockFfmpegPath);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error extracting metadata'),
      expect.any(Error),
    );
    expect(db.bulkUpsertMetadata).toHaveBeenCalledWith([
      expect.objectContaining({
        filePath: testFile,
        status: 'failed',
      }),
    ]);
  });

  it('extractAndSaveMetadata handles upsertMetadata errors', async () => {
    vi.mocked(fs.stat).mockResolvedValue({
      size: 1000,
      birthtime: new Date(),
    } as any);
    (mediaHandler.getVideoDuration as any).mockResolvedValue({ duration: 60 });
    (db.bulkUpsertMetadata as any).mockRejectedValue(new Error('DB Error'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await extractAndSaveMetadata([testFile], mockFfmpegPath);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to bulk upsert metadata'),
      expect.any(Error),
    );
  });

  it('extractAndSaveMetadata saves duration if available', async () => {
    vi.mocked(fs.stat).mockResolvedValue({
      size: 1000,
      birthtime: new Date('2023-01-01'),
    } as any);
    (mediaHandler.getVideoDuration as any).mockResolvedValue({ duration: 120 });

    await extractAndSaveMetadata([testFile], mockFfmpegPath);

    expect(db.bulkUpsertMetadata).toHaveBeenCalledWith([
      expect.objectContaining({
        filePath: testFile,
        duration: 120,
        size: 1000,
      }),
    ]);
  });

  it('extractAndSaveMetadata skips duration if unavailable', async () => {
    vi.mocked(fs.stat).mockResolvedValue({
      size: 500,
      birthtime: new Date('2023-01-01'),
    } as any);
    (mediaHandler.getVideoDuration as any).mockResolvedValue({
      error: 'Not video',
    });

    await extractAndSaveMetadata([testFile], mockFfmpegPath);

    expect(db.bulkUpsertMetadata).toHaveBeenCalledWith([
      expect.objectContaining({
        filePath: testFile,
        size: 500,
      }),
    ]);
    expect(db.bulkUpsertMetadata).toHaveBeenCalledWith([
      expect.not.objectContaining({
        duration: expect.anything(),
      }),
    ]);
  });
});
