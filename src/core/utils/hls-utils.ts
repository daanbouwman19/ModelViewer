/**
 * @file Utilities for HLS playlist generation and manipulation.
 */

/**
 * Generates the content for an HLS Master Playlist.
 * @param bandwidth - The bandwidth in bits per second.
 * @param resolution - The resolution string (e.g., "1280x720").
 * @param fileParam - The file path or identifier to be included in the query parameters.
 * @returns The master playlist content string.
 */
export function generateMasterPlaylist(
  bandwidth: number,
  resolution: string,
  fileParam: string,
): string {
  const encodedFile = encodeURIComponent(fileParam);
  return `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution}
playlist.m3u8?file=${encodedFile}`;
}

/**
 * Injects the file query parameter into HLS segment paths in the playlist content.
 * @param playlistContent - The original HLS playlist content.
 * @param fileParam - The file path or identifier to be included in the segment URLs.
 * @returns The modified playlist content with query parameters injected.
 */
export function injectFileParamIntoPlaylist(
  playlistContent: string,
  fileParam: string,
): string {
  const encodedFile = encodeURIComponent(fileParam);
  // Simple regex replace for segment_xxx.ts
  const segmentRegex = /(segment_\d+\.ts)/g;
  return playlistContent.replace(segmentRegex, `$1?file=${encodedFile}`);
}
