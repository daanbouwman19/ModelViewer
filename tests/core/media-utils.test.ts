import { describe, it, expect, vi } from 'vitest';
import {
  getTranscodeArgs,
  getThumbnailArgs,
  isValidTimeFormat,
  getMimeType,
} from '../../src/core/media-utils';

describe('media-utils', () => {
  describe('isValidTimeFormat', () => {
    it('returns true for simple seconds', () => {
      expect(isValidTimeFormat('10')).toBe(true);
      expect(isValidTimeFormat('10.5')).toBe(true);
    });

    it('returns true for timestamps', () => {
      expect(isValidTimeFormat('00:00:10')).toBe(true);
      expect(isValidTimeFormat('00:10.5')).toBe(true);
    });

    it('returns false for invalid formats', () => {
      expect(isValidTimeFormat('abc')).toBe(false);
      expect(isValidTimeFormat('10:xx')).toBe(false);
    });
  });

  describe('getTranscodeArgs', () => {
    it('returns default args when startTime is null', () => {
      const args = getTranscodeArgs('/path/to/video.mp4', null);
      expect(args).toContain('-i');
      expect(args).toContain('/path/to/video.mp4');
      expect(args).not.toContain('-ss');
      expect(args).toContain('-vcodec');
      expect(args).toContain('libx264');
    });

    it('includes -ss when startTime is provided', () => {
      const args = getTranscodeArgs('/path/to/video.mp4', '10');
      expect(args).toContain('-ss');
      expect(args).toContain('10');
    });

    it('throws error for invalid start time', () => {
      expect(() => getTranscodeArgs('/path/to/video.mp4', 'invalid')).toThrow(
        'Invalid start time format',
      );
    });
  });

  describe('getThumbnailArgs', () => {
    it('returns correct ffmpeg arguments', () => {
      const args = getThumbnailArgs('/input.mp4', '/cache/thumb.jpg');
      expect(args).toEqual([
        '-y',
        '-ss',
        '1',
        '-i',
        '/input.mp4',
        '-frames:v',
        '1',
        '-q:v',
        '5',
        '-update',
        '1',
        '/cache/thumb.jpg',
      ]);
    });
  });

  describe('getMimeType', () => {
    it('returns application/octet-stream for gdrive paths', () => {
      expect(getMimeType('gdrive://some-id')).toBe('application/octet-stream');
    });

    it('returns image/jpeg for .jpg and .jpeg', () => {
      expect(getMimeType('photo.jpg')).toBe('image/jpeg');
      expect(getMimeType('photo.jpeg')).toBe('image/jpeg'); // Assuming extension list handles this or .jpeg isn't in list?
      // Looking at source: extension === 'jpg' ? 'jpeg' : extension.
    });

    it('returns video/mp4 for .mp4', () => {
      expect(getMimeType('video.mp4')).toBe('video/mp4');
    });

    it('returns application/octet-stream for unknown extensions', () => {
      expect(getMimeType('file.xyz')).toBe('application/octet-stream');
    });
  });
});
