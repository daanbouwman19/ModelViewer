import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractAndSaveMetadata } from '../../src/core/media-service';
import * as database from '../../src/core/database';
import fs from 'fs/promises';

// Mock dependencies
vi.mock('../../src/core/database', () => ({
  getAllMetadata: vi.fn(),
  getMetadata: vi.fn(),
  bulkUpsertMetadata: vi.fn(),
  getPendingMetadata: vi.fn(),
}));
vi.mock('../../src/core/media-scanner');
vi.mock('../../src/core/media-handler');
vi.mock('../../src/core/media-utils', () => ({
  isDrivePath: vi.fn().mockReturnValue(false),
}));

vi.mock('fs/promises', () => {
  const stat = vi.fn();
  return {
    stat,
    default: { stat },
  };
});

describe('media-service optimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    vi.mocked(database.getMetadata).mockResolvedValue({});
    vi.mocked(database.getAllMetadata).mockResolvedValue({});
  });

  it('should skip fs.stat if metadata exists and forceCheck is false', async () => {
    // Setup existing metadata
    const filePath = '/existing.mp4';
    vi.mocked(database.getMetadata).mockResolvedValue({
      [filePath]: { status: 'success', size: 100, createdAt: '2023-01-01' },
    });

    // Call with forceCheck: false (default)
    await extractAndSaveMetadata([filePath], 'ffmpeg', { forceCheck: false });

    // Expect fs.stat NOT to be called
    expect(fs.stat).not.toHaveBeenCalled();
  });

  it('should call fs.stat if metadata exists but forceCheck is true', async () => {
    // Setup existing metadata
    const filePath = '/existing.mp4';
    vi.mocked(database.getMetadata).mockResolvedValue({
      [filePath]: { status: 'success', size: 100, createdAt: '2023-01-01' },
    });

    // Mock fs.stat to succeed
    vi.mocked(fs.stat).mockResolvedValue({
      size: 100,
      birthtime: { toISOString: () => '2023-01-01' },
    } as any);

    // Call with forceCheck: true
    await extractAndSaveMetadata([filePath], 'ffmpeg', { forceCheck: true });

    // Expect fs.stat TO be called
    expect(fs.stat).toHaveBeenCalledWith(filePath);
  });

  it('should call fs.stat if metadata does not exist', async () => {
    const filePath = '/new.mp4';
    vi.mocked(database.getMetadata).mockResolvedValue({});

    vi.mocked(fs.stat).mockResolvedValue({
      size: 100,
      birthtime: { toISOString: () => '2023-01-01' },
    } as any);

    await extractAndSaveMetadata([filePath], 'ffmpeg');

    expect(fs.stat).toHaveBeenCalledWith(filePath);
  });
});
