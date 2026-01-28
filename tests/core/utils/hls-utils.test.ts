import { describe, it, expect } from 'vitest';
import {
  generateMasterPlaylist,
  injectFileParamIntoPlaylist,
} from '../../../src/core/utils/hls-utils.ts';

describe('hls-utils', () => {
  describe('generateMasterPlaylist', () => {
    it('should generate a correct master playlist', () => {
      const bandwidth = 2000000;
      const resolution = '1280x720';
      const fileParam = '/path/to/file.mp4';
      const result = generateMasterPlaylist(bandwidth, resolution, fileParam);

      expect(result).toContain('#EXTM3U');
      expect(result).toContain('#EXT-X-VERSION:3');
      expect(result).toContain(
        `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution}`,
      );
      // Check encoded file param
      expect(result).toContain(
        'playlist.m3u8?file=%2Fpath%2Fto%2Ffile.mp4',
      );
    });

    it('should handle special characters in file path', () => {
      const result = generateMasterPlaylist(
        1000,
        '640x480',
        'C:\\My Videos\\Cool & Fun.mp4',
      );
      expect(result).toContain(
        'playlist.m3u8?file=C%3A%5CMy%20Videos%5CCool%20%26%20Fun.mp4',
      );
    });

    it('should handle empty file param', () => {
      const result = generateMasterPlaylist(1000, '640x480', '');
      expect(result).toContain('playlist.m3u8?file=');
    });
  });

  describe('injectFileParamIntoPlaylist', () => {
    it('should inject file param into segment paths', () => {
      const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXTINF:10.0,
segment_000.ts
#EXTINF:10.0,
segment_001.ts`;
      const fileParam = '/path/to/video.mp4';
      const result = injectFileParamIntoPlaylist(playlist, fileParam);

      expect(result).toContain(
        'segment_000.ts?file=%2Fpath%2Fto%2Fvideo.mp4',
      );
      expect(result).toContain(
        'segment_001.ts?file=%2Fpath%2Fto%2Fvideo.mp4',
      );
    });

    it('should not modify other parts of the playlist', () => {
      const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXTINF:10.0,
segment_000.ts`;
      const result = injectFileParamIntoPlaylist(playlist, 'foo');
      expect(result).toContain('#EXTM3U');
      expect(result).toContain('#EXTINF:10.0,');
    });

    it('should handle different segment names if they match pattern', () => {
      const playlist = `segment_123.ts`;
      const result = injectFileParamIntoPlaylist(playlist, 'bar');
      expect(result).toBe('segment_123.ts?file=bar');
    });

    it('should handle special characters in file param', () => {
      const playlist = `segment_000.ts`;
      const result = injectFileParamIntoPlaylist(playlist, 'a&b');
      expect(result).toBe('segment_000.ts?file=a%26b');
    });
  });
});
