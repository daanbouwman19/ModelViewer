/**
 * @file Defines constants used throughout the main process of the application.
 * These include settings for file handling, caching, and supported media types.
 */

/**
 * Maximum size for a file to be loaded as a Data URL, in megabytes.
 * Larger files, especially videos, will be served via a local HTTP server
 * to avoid performance issues with large Data URLs.
 * @type {number}
 */
const MAX_DATA_URL_SIZE_MB = 50;

/**
 * The key used for storing and retrieving the file index cache
 * in the application's SQLite database.
 * @type {string}
 */
const FILE_INDEX_CACHE_KEY = 'file_index_json';

/**
 * An array of supported image file extensions.
 * Used to identify image files during media scans.
 * @type {string[]}
 */
const SUPPORTED_IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
];

/**
 * An array of supported video file extensions.
 * Used to identify video files during media scans.
 * @type {string[]}
 */
const SUPPORTED_VIDEO_EXTENSIONS = [
  '.mp4',
  '.webm',
  '.ogg',
  '.mov',
  '.avi',
  '.mkv',
];

/**
 * A combined array of all supported media file extensions (both images and videos).
 * This is useful for file filtering operations.
 * @type {string[]}
 */
const ALL_SUPPORTED_EXTENSIONS = [
  ...SUPPORTED_IMAGE_EXTENSIONS,
  ...SUPPORTED_VIDEO_EXTENSIONS,
];

module.exports = {
  MAX_DATA_URL_SIZE_MB,
  FILE_INDEX_CACHE_KEY,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
  ALL_SUPPORTED_EXTENSIONS,
};
