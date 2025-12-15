import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractAndSaveMetadata } from '../../src/core/media-service';
import * as db from '../../src/core/database';
import * as mediaHandler from '../../src/core/media-handler';
import fs from 'fs';

vi.mock('../../src/core/database');
vi.mock('../../src/core/media-handler');
vi.mock('fs', () => ({
  default: {
    statSync: vi.fn(),
  },
}));

describe('media-service coverage', () => {
  const mockFfmpegPath = '/path/to/ffmpeg';
  const testFile = '/path/to/video.mp4';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extractAndSaveMetadata handles fs.statSync errors gracefully', async () => {
    (fs.statSync as any).mockImplementation(() => {
      throw new Error('File not found');
    });
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await extractAndSaveMetadata([testFile], mockFfmpegPath);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error extracting metadata'),
      expect.any(Error),
    );
    expect(db.upsertMetadata).not.toHaveBeenCalled();
  });

  it('extractAndSaveMetadata handles upsertMetadata errors', async () => {
    (fs.statSync as any).mockReturnValue({
      size: 1000,
      birthtime: new Date(),
    });
    (mediaHandler.getVideoDuration as any).mockResolvedValue({ duration: 60 });
    (db.upsertMetadata as any).mockRejectedValue(new Error('DB Error'));

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await extractAndSaveMetadata([testFile], mockFfmpegPath);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error extracting metadata'),
      expect.any(Error),
    );
  });

  it('extractAndSaveMetadata saves duration if available', async () => {
    (fs.statSync as any).mockReturnValue({
      size: 1000,
      birthtime: new Date('2023-01-01'),
    });
    (mediaHandler.getVideoDuration as any).mockResolvedValue({ duration: 120 });

    await extractAndSaveMetadata([testFile], mockFfmpegPath);

    expect(db.upsertMetadata).toHaveBeenCalledWith(
      testFile,
      expect.objectContaining({
        duration: 120,
        size: 1000,
      }),
    );
  });

  it('extractAndSaveMetadata skips duration if unavailable', async () => {
    (fs.statSync as any).mockReturnValue({
      size: 500,
      birthtime: new Date('2023-01-01'),
    });
    (mediaHandler.getVideoDuration as any).mockResolvedValue({
      error: 'Not video',
    });

    await extractAndSaveMetadata([testFile], mockFfmpegPath);

    expect(db.upsertMetadata).toHaveBeenCalledWith(
      testFile,
      expect.objectContaining({
        size: 500,
      }),
    );
    expect(db.upsertMetadata).toHaveBeenCalledWith(
      testFile,
      expect.not.objectContaining({
        duration: expect.anything(),
      }),
    );
  });
});
