/**
 * @file Defines constants used throughout the core of the application.
 */

/**
 * Protocol prefix for Google Drive files.
 */
const GDRIVE_PROTOCOL: string = 'gdrive://';

/**
 * Maximum size for a file to be loaded as a Data URL, in megabytes.
 * Larger files, especially videos, will be served via a local HTTP server
 * to avoid performance issues with large Data URLs.
 * @type {number}
 */
const MAX_DATA_URL_SIZE_MB: number = 50;

/**
 * Threshold for switching to HTTP serving instead of Data URL to avoid memory pressure.
 */
const DATA_URL_THRESHOLD_MB: number = 1;

/**
 * The key used for storing and retrieving the file index cache
 * in the application's SQLite database.
 */
const FILE_INDEX_CACHE_KEY: string = 'file_index_json';

/**
 * An array of supported image file extensions.
 * Used to identify image files during media scans.
 */
const SUPPORTED_IMAGE_EXTENSIONS: readonly string[] = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
] as const;

/**
 * An array of supported video file extensions.
 * Used to identify video files during media scans.
 */
const SUPPORTED_VIDEO_EXTENSIONS: readonly string[] = [
  '.mp4',
  '.webm',
  '.ogg',
  '.mov',
  '.avi',
  '.mkv',
  '.wmv',
  '.flv',
] as const;

/**
 * A combined array of all supported media file extensions (both images and videos).
 * This is useful for file filtering operations.
 */
const ALL_SUPPORTED_EXTENSIONS: readonly string[] = [
  ...SUPPORTED_IMAGE_EXTENSIONS,
  ...SUPPORTED_VIDEO_EXTENSIONS,
] as const;

/**
 * Formats that often fail in browsers or have poor performance
 * and should trigger proactive transcoding.
 */
const LEGACY_VIDEO_EXTENSIONS: readonly string[] = [
  '.mov',
  '.avi',
  '.wmv',
  '.mkv',
  '.flv',
] as const;

/**
 * Available media filters in the UI.
 */
const MEDIA_FILTERS = ['All', 'Images', 'Videos'] as const;

/**
 * Type derived from MEDIA_FILTERS for use in the UI and filtering logic.
 */
export type MediaFilter = (typeof MEDIA_FILTERS)[number];

/**
 * List of sensitive subdirectories that should never be accessed.
 */
const SENSITIVE_SUBDIRECTORIES = new Set([
  '.ssh',
  '.aws',
  '.kube',
  '.gnupg',
  '.git',
  '.env',
  'node_modules',
]);

/**
 * Windows-specific restricted system paths.
 */
const WINDOWS_RESTRICTED_ROOT_PATHS = [
  'Windows',
  'Program Files',
  'Program Files (x86)',
  'ProgramData',
];

/**
 * Limit concurrent file system scans to avoid EMFILE errors.
 */
const DISK_SCAN_CONCURRENCY = 10;

/**
 * Concurrency for background metadata extraction.
 */
const METADATA_EXTRACTION_CONCURRENCY = 5;

/**
 * Batch size for saving extracted metadata to the database.
 */
const METADATA_BATCH_SIZE = 50;

/**
 * Scopes required for Google Drive access.
 */
const GOOGLE_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

/**
 * Database key for storing Google OAuth tokens.
 */
const GOOGLE_TOKENS_KEY = 'google_tokens';

/**
 * Default port for the web server.
 */
const DEFAULT_SERVER_PORT = 3000;

/**
 * Default host for the web server.
 */
const DEFAULT_SERVER_HOST = '127.0.0.1';

/**
 * Limit for fetching recently played items.
 */
const RECENTLY_PLAYED_FETCH_LIMIT = 100;

/**
 * Timeout for hiding UI controls in milliseconds.
 */
const CONTROLS_HIDE_TIMEOUT_MS = 3000;

/**
 * Rate Limiting Constants
 */

// Auth: Strict limit (20 req / 15 min) to prevent brute force
const RATE_LIMIT_AUTH_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_AUTH_MAX_REQUESTS = 20;

// Write: Moderate limit (10 req / 1 min) for sensitive write operations (scan, create, rate)
const RATE_LIMIT_WRITE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_WRITE_MAX_REQUESTS = 10;

/**
 * Maximum number of concurrent transcoding streams allowed.
 * Used to prevent CPU exhaustion (DoS).
 */
const MAX_CONCURRENT_TRANSCODES = 3;

export {
  GDRIVE_PROTOCOL,
  MAX_DATA_URL_SIZE_MB,
  DATA_URL_THRESHOLD_MB,
  FILE_INDEX_CACHE_KEY,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
  ALL_SUPPORTED_EXTENSIONS,
  LEGACY_VIDEO_EXTENSIONS,
  MEDIA_FILTERS,
  SENSITIVE_SUBDIRECTORIES,
  WINDOWS_RESTRICTED_ROOT_PATHS,
  DISK_SCAN_CONCURRENCY,
  METADATA_EXTRACTION_CONCURRENCY,
  METADATA_BATCH_SIZE,
  GOOGLE_DRIVE_SCOPES,
  GOOGLE_TOKENS_KEY,
  DEFAULT_SERVER_PORT,
  DEFAULT_SERVER_HOST,
  RECENTLY_PLAYED_FETCH_LIMIT,
  CONTROLS_HIDE_TIMEOUT_MS,
  RATE_LIMIT_AUTH_WINDOW_MS,
  RATE_LIMIT_AUTH_MAX_REQUESTS,
  RATE_LIMIT_WRITE_WINDOW_MS,
  RATE_LIMIT_WRITE_MAX_REQUESTS,
  MAX_CONCURRENT_TRANSCODES,
};
