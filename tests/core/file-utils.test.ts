import { describe, it, expect } from 'vitest';
import { getFileExtension, isImageFile, isVideoFile } from '../../src/core/utils/file-utils';

describe('file-utils', () => {
  describe('getFileExtension', () => {
    it('returns extension for standard files', () => {
      expect(getFileExtension('image.jpg')).toBe('.jpg');
      expect(getFileExtension('video.mp4')).toBe('.mp4');
      expect(getFileExtension('DATA.JSON')).toBe('.json');
    });

    it('returns extension for files with paths', () => {
      expect(getFileExtension('/path/to/image.png')).toBe('.png');
      expect(getFileExtension('C:\\Windows\\file.exe')).toBe('.exe');
    });

    it('returns empty string for files without extension', () => {
      expect(getFileExtension('README')).toBe('');
      expect(getFileExtension('/path/to/LICENSE')).toBe('');
    });

    it('returns empty string for dotfiles', () => {
      expect(getFileExtension('.gitignore')).toBe('');
      expect(getFileExtension('/path/to/.env')).toBe('');
    });

    it('handles files with multiple dots', () => {
      expect(getFileExtension('archive.tar.gz')).toBe('.gz');
      expect(getFileExtension('my.cool.photo.jpg')).toBe('.jpg');
    });

    it('returns empty string if dot is in directory name', () => {
      expect(getFileExtension('/path.to/file')).toBe('');
    });
  });

  describe('isImageFile', () => {
    it('returns true for supported image extensions', () => {
      expect(isImageFile('photo.jpg')).toBe(true);
      expect(isImageFile('image.png')).toBe(true);
      expect(isImageFile('pic.webp')).toBe(true);
    });

    it('returns false for video files', () => {
      expect(isImageFile('movie.mp4')).toBe(false);
    });

    it('returns false for unsupported files', () => {
      expect(isImageFile('doc.pdf')).toBe(false);
    });
  });

  describe('isVideoFile', () => {
    it('returns true for supported video extensions', () => {
      expect(isVideoFile('movie.mp4')).toBe(true);
      expect(isVideoFile('clip.mkv')).toBe(true);
    });

    it('returns false for image files', () => {
      expect(isVideoFile('photo.jpg')).toBe(false);
    });

    it('returns false for unsupported files', () => {
      expect(isVideoFile('song.mp3')).toBe(false);
    });
  });
});
