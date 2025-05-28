const { getMimeType } = require('./local-server.js');
// We don't need to mock constants for this test, as getMimeType imports them directly,
// and we are testing its output based on known inputs.

describe('Local Server Utilities', () => {
  describe('getMimeType', () => {
    // Test cases for image MIME types
    test('should return correct MIME type for .png', () => {
      expect(getMimeType('file.png')).toBe('image/png');
    });
    test('should return correct MIME type for .jpg', () => {
      expect(getMimeType('file.jpg')).toBe('image/jpeg');
    });
    test('should return correct MIME type for .jpeg', () => {
      expect(getMimeType('file.jpeg')).toBe('image/jpeg');
    });
    test('should return correct MIME type for .gif', () => {
      expect(getMimeType('file.gif')).toBe('image/gif');
    });
    test('should return correct MIME type for .webp', () => {
      expect(getMimeType('file.webp')).toBe('image/webp');
    });
    test('should return correct MIME type for .svg', () => {
      expect(getMimeType('file.svg')).toBe('image/svg');
    });

    // Test cases for video MIME types
    test('should return correct MIME type for .mp4', () => {
      expect(getMimeType('file.mp4')).toBe('video/mp4');
    });
    test('should return correct MIME type for .webm', () => {
      expect(getMimeType('file.webm')).toBe('video/webm');
    });
    test('should return correct MIME type for .ogg', () => {
      expect(getMimeType('file.ogg')).toBe('video/ogg');
    });
    test('should return correct MIME type for .mov', () => {
      expect(getMimeType('file.mov')).toBe('video/quicktime');
    });
    test('should return correct MIME type for .avi', () => {
      expect(getMimeType('file.avi')).toBe('video/x-msvideo');
    });
    test('should return correct MIME type for .mkv', () => {
      expect(getMimeType('file.mkv')).toBe('video/x-matroska');
    });

    // Test case for unsupported extension
    test('should return application/octet-stream for unsupported extensions', () => {
      expect(getMimeType('file.txt')).toBe('application/octet-stream');
      expect(getMimeType('file.unknown')).toBe('application/octet-stream');
    });

    // Test case for files with no extension
    test('should return application/octet-stream for files with no extension', () => {
      expect(getMimeType('file')).toBe('application/octet-stream');
    });

    // Test case for files with only a dot (hidden files)
    test('should return application/octet-stream for files starting with a dot and no extension', () => {
      expect(getMimeType('.bashrc')).toBe('application/octet-stream');
    });
    
    // Test case for mixed case extensions
    test('should handle mixed case extensions correctly', () => {
      expect(getMimeType('file.PNG')).toBe('image/png');
      expect(getMimeType('file.JpEg')).toBe('image/jpeg');
      expect(getMimeType('file.Mp4')).toBe('video/mp4');
    });
  });
});
