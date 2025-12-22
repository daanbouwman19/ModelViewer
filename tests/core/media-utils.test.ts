import { describe, it, expect } from 'vitest';
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

    it('returns correct mime type for supported images', () => {
      expect(getMimeType('photo.jpg')).toBe('image/jpeg');
      expect(getMimeType('photo.jpeg')).toBe('image/jpeg');
      expect(getMimeType('photo.png')).toBe('image/png');
      expect(getMimeType('photo.gif')).toBe('image/gif');
      expect(getMimeType('photo.webp')).toBe('image/webp');
      expect(getMimeType('icon.svg')).toBe('image/svg');
    });

    it('returns correct mime type for supported videos', () => {
      expect(getMimeType('video.mp4')).toBe('video/mp4');
      expect(getMimeType('video.webm')).toBe('video/webm');
      expect(getMimeType('video.ogg')).toBe('video/ogg');
      expect(getMimeType('video.mov')).toBe('video/quicktime');
      expect(getMimeType('video.avi')).toBe('video/x-msvideo');
      expect(getMimeType('video.mkv')).toBe('video/x-matroska');
    });

    it('returns application/octet-stream for unknown extensions', () => {
      expect(getMimeType('file.xyz')).toBe('application/octet-stream');
      expect(getMimeType('file.m4v')).toBe('application/octet-stream');
    });
  });
});
