// Constants for file handling and caching

// Maximum size for a file to be loaded as a Data URL, in megabytes.
// Larger files, especially videos, will be served via a local HTTP server.
const MAX_DATA_URL_SIZE_MB = 50;

// Key used for caching the file index in the application's database.
const FILE_INDEX_CACHE_KEY = 'file_index_json';

// Supported image file extensions.
const SUPPORTED_IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
];

// Supported video file extensions.
const SUPPORTED_VIDEO_EXTENSIONS = [
  '.mp4',
  '.webm',
  '.ogg',
  '.mov',
  '.avi',
  '.mkv',
];

// Combined list of all supported media file extensions.
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
