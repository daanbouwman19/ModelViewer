import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isDrivePath,
  getDriveId,
  createDrivePath,
  getMimeType,
  getThumbnailCachePath,
  checkThumbnailCache,
} from '../../src/core/media-utils';
import fs from 'fs'; // Import for spyOn
import path from 'path';

// REMOVED vi.mock('fs')

describe('media-utils unit tests', () => {
  let mockFsAccess: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFsAccess = vi.spyOn(fs.promises, 'access');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Drive Helpers', () => {
    it('isDrivePath correctly identifies drive paths', () => {
      expect(isDrivePath('gdrive://123')).toBe(true);
      expect(isDrivePath('/local/path')).toBe(false);
    });

    it('getDriveId extracts ID from drive path', () => {
      expect(getDriveId('gdrive://123')).toBe('123');
    });

    it('getDriveId returns original path if not drive path', () => {
      expect(getDriveId('/local/path')).toBe('/local/path');
    });

    it('createDrivePath creates correct path', () => {
      expect(createDrivePath('123')).toBe('gdrive://123');
    });
  });

  describe('getMimeType', () => {
    it('returns octet-stream for drive paths', () => {
      expect(getMimeType('gdrive://123')).toBe('application/octet-stream');
    });

    it('returns correct mime type for supported images', () => {
      expect(getMimeType('test.jpg')).toBe('image/jpeg');
      expect(getMimeType('test.jpeg')).toBe('image/jpeg');
    });

    it('returns correct mime type for supported videos', () => {
      expect(getMimeType('test.mp4')).toBe('video/mp4');
      expect(getMimeType('test.mkv')).toBe('video/x-matroska');
    });

    it('returns octet-stream for unknown extensions', () => {
      expect(getMimeType('test.unknown')).toBe('application/octet-stream');
    });

    it('handles mixed case extensions', () => {
      expect(getMimeType('test.MP4')).toBe('video/mp4');
    });
  });

  describe('Thumbnail Utils', () => {
    it('getThumbnailCachePath generates correct path based on hash', () => {
      const filePath = '/test/video.mp4';
      const cacheDir = '/cache';
      const result = getThumbnailCachePath(filePath, cacheDir);

      // Match path ending with /cache/<hash>.jpg, allowing either / or \ separator
      expect(result).toMatch(/[\\/]cache[\\/][a-f0-9]+\.jpg$/);

      // Verify validation logic works with platform specific check
      expect(result.startsWith(path.join(cacheDir))).toBe(true);
    });

    it('checkThumbnailCache returns true if file exists', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      expect(await checkThumbnailCache('/path/to/thumb.jpg')).toBe(true);
    });

    it('checkThumbnailCache returns false if file access fails', async () => {
      mockFsAccess.mockRejectedValue(new Error('ENOENT'));
      expect(await checkThumbnailCache('/path/to/thumb.jpg')).toBe(false);
    });
  });
});
