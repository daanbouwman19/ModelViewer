/**
 * @file Manages all database interactions for the application using a Worker Thread.
 * This module acts as a bridge between the main process (or server) and the database worker thread.
 */

import { type WorkerOptions } from 'worker_threads';
import { FILE_INDEX_CACHE_KEY } from './constants';
import type {
  Album,
  MediaDirectory,
  SmartPlaylist,
  MediaMetadata,
  MediaLibraryItem,
} from './types';
import { WorkerClient } from './worker-client';

/**
 * The database worker client instance.
 */
let dbWorkerClient: WorkerClient | null = null;

/**
 * Initializes the database by creating and managing a worker thread.
 * If an existing worker is present, it will be terminated and a new one started.
 * @param userDbPath - Absolute path to the SQLite database file.
 * @param workerScriptPath - Absolute path or URL to the worker script.
 * @param workerOptions - Optional WorkerOptions to pass to the Worker constructor.
 * @returns A promise that resolves when the database is successfully initialized.
 * @throws {Error} If the worker initialization fails.
 */
async function initDatabase(
  userDbPath: string,
  workerScriptPath: string | URL,
  workerOptions?: WorkerOptions,
): Promise<void> {
  if (dbWorkerClient) {
    await dbWorkerClient.terminate();
  }

  dbWorkerClient = new WorkerClient(workerScriptPath, {
    workerOptions,
    operationTimeout: 30000,
    name: 'database.js',
    autoRestart: true,
    restartDelay: 2000,
  });
  await dbWorkerClient.init({ type: 'init', payload: { dbPath: userDbPath } });
}

/**
 * Helper to get the client or throw if not initialized.
 */
function getClient(): WorkerClient {
  if (!dbWorkerClient) {
    throw new Error('Database worker not initialized');
  }
  return dbWorkerClient;
}

/**
 * Records a view for a media file.
 * @param filePath - The path to the media file.
 * @returns A promise that resolves when the view is recorded. Errors are logged but not re-thrown.
 */
async function recordMediaView(filePath: string): Promise<void> {
  try {
    await getClient().sendMessage<void>('recordMediaView', { filePath });
  } catch (error: unknown) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        `[database.js] Error recording media view: ${(error as Error).message}`,
      );
    }
  }
}

/**
 * Retrieves view counts for a list of media files.
 * @param filePaths - An array of file paths.
 * @returns A promise that resolves to a map of file paths to their view counts. Returns an empty object on error.
 */
async function getMediaViewCounts(
  filePaths: string[],
): Promise<{ [filePath: string]: number }> {
  if (!filePaths || filePaths.length === 0) {
    return {};
  }
  try {
    return await getClient().sendMessage<{ [filePath: string]: number }>(
      'getMediaViewCounts',
      { filePaths },
    );
  } catch (error) {
    console.error('[database.js] Error fetching view counts:', error);
    return {};
  }
}

/**
 * Retrieves view counts for all media files.
 * @returns A promise that resolves to a map of file paths to their view counts. Returns an empty object on error.
 */
async function getAllMediaViewCounts(): Promise<{
  [filePath: string]: number;
}> {
  try {
    return await getClient().sendMessage<{ [filePath: string]: number }>(
      'getAllMediaViewCounts',
    );
  } catch (error) {
    console.error('[database.js] Error fetching all view counts:', error);
    return {};
  }
}

/**
 * Caches the list of albums (file index) into the database.
 * @param albums - The array of album objects to cache.
 * @returns A promise that resolves when the albums are cached. Errors are logged but not re-thrown.
 */
async function cacheAlbums(albums: Album[]): Promise<void> {
  try {
    await getClient().sendMessage<void>('cacheAlbums', {
      cacheKey: FILE_INDEX_CACHE_KEY,
      albums,
    });
  } catch (error) {
    console.error('[database.js] Error caching albums:', error);
  }
}

/**
 * Retrieves the cached list of albums from the database.
 * @returns A promise that resolves to the cached albums, or null if not found or an error occurs.
 */
async function getCachedAlbums(): Promise<Album[] | null> {
  try {
    return await getClient().sendMessage<Album[] | null>('getCachedAlbums', {
      cacheKey: FILE_INDEX_CACHE_KEY,
    });
  } catch (error: unknown) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        `[database.js] Error getting cached albums: ${(error as Error).message}`,
      );
    }
    return null;
  }
}

/**
 * Closes the database connection by terminating the worker thread.
 * @returns A promise that resolves when the worker has been terminated.
 */
async function closeDatabase(): Promise<void> {
  if (dbWorkerClient) {
    // Send close signal if needed, then terminate
    try {
      await dbWorkerClient.sendMessage<void>('close');
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[database.js] Warning during worker shutdown:', error);
      }
    } finally {
      await dbWorkerClient.terminate();
      dbWorkerClient = null;
    }
  }
}

/**
 * Sets the timeout duration for database operations. Useful for testing.
 * @param timeout - The timeout in milliseconds.
 */
function setOperationTimeout(timeout: number): void {
  if (dbWorkerClient) {
    dbWorkerClient.setOperationTimeout(timeout);
  }
}

/**
 * Adds a new media directory to the database.
 * @param directory - The absolute path of the directory to add, or an object with details.
 * @returns A promise that resolves on success or rejects on failure.
 * @throws {Error} If the database operation fails.
 */
async function addMediaDirectory(
  directory:
    | string
    | {
        id?: string;
        path: string;
        type?: 'local' | 'google_drive';
        name?: string;
      },
): Promise<void> {
  try {
    const payload =
      typeof directory === 'string' ? { path: directory } : directory;

    await getClient().sendMessage<void>('addMediaDirectory', {
      directoryObj: payload,
    });
  } catch (error) {
    console.error(
      `[database.js] Error adding media directory '${typeof directory === 'string' ? directory : directory.path}':`,
      error,
    );
    throw error;
  }
}

/**
 * Retrieves all media directories from the database.
 * @returns A promise that resolves to a list of all media directory objects. Returns an empty array on error.
 */
async function getMediaDirectories(): Promise<MediaDirectory[]> {
  try {
    const directories = await getClient().sendMessage<MediaDirectory[]>(
      'getMediaDirectories',
    );
    return directories || [];
  } catch (error) {
    console.error('[database.js] Error getting media directories:', error);
    return [];
  }
}

/**
 * Removes a media directory from the database.
 * @param directoryPath - The absolute path of the directory to remove.
 * @returns A promise that resolves on success or rejects on failure.
 * @throws {Error} If the database operation fails.
 */
async function removeMediaDirectory(directoryPath: string): Promise<void> {
  try {
    await getClient().sendMessage<void>('removeMediaDirectory', {
      directoryPath,
    });
  } catch (error) {
    console.error(
      '[database.js] Error removing media directory %s',
      directoryPath,
      error,
    );
    throw error;
  }
}

/**
 * Updates the active state for a given media directory.
 * @param directoryPath - The path of the directory to update.
 * @param isActive - The new active state.
 * @returns A promise that resolves on success or rejects on failure.
 * @throws {Error} If the database operation fails.
 */
async function setDirectoryActiveState(
  directoryPath: string,
  isActive: boolean,
): Promise<void> {
  try {
    await getClient().sendMessage<void>('setDirectoryActiveState', {
      directoryPath,
      isActive,
    });
  } catch (error) {
    console.error(
      '[database.js] Error setting active state for %s:',
      directoryPath,
      error,
    );
    throw error;
  }
}

/**
 * Upserts metadata for a file.
 */
async function upsertMetadata(
  filePath: string,
  metadata: MediaMetadata,
): Promise<void> {
  try {
    await getClient().sendMessage<void>('upsertMetadata', {
      filePath,
      ...metadata,
    });
  } catch (error) {
    console.error('[database.js] Error upserting metadata:', filePath, error);
    throw error;
  }
}

/**
 * Bulk upserts metadata for multiple files.
 */
async function bulkUpsertMetadata(
  payloads: ({ filePath: string } & MediaMetadata)[],
): Promise<void> {
  try {
    await getClient().sendMessage<void>('bulkUpsertMetadata', payloads);
  } catch (error) {
    console.error('[database.js] Error bulk upserting metadata:', error);
    throw error;
  }
}

/**
 * Sets the rating for a file.
 */
async function setRating(filePath: string, rating: number): Promise<void> {
  try {
    await getClient().sendMessage<void>('setRating', {
      filePath,
      rating,
    });
  } catch (error) {
    console.error('[database.js] Error setting rating:', filePath, error);
    throw error;
  }
}

/**
 * Updates watched segments for a file.
 */
async function updateWatchedSegments(
  filePath: string,
  segmentsJson: string,
): Promise<void> {
  try {
    await getClient().sendMessage<void>('updateWatchedSegments', {
      filePath,
      segmentsJson,
    });
  } catch (error) {
    console.error(
      '[database.js] Error updating watched segments:',
      filePath,
      error,
    );
  }
}

/**
 * Retrieves metadata for a list of files.
 */
async function getMetadata(
  filePaths: string[],
): Promise<{ [path: string]: MediaMetadata }> {
  try {
    return await getClient().sendMessage<{ [path: string]: MediaMetadata }>(
      'getMetadata',
      { filePaths },
    );
  } catch (error) {
    console.error('[database.js] Error getting metadata:', filePaths, error);
    return {};
  }
}

/**
 * Retrieves metadata for all files.
 */
async function getAllMetadata(): Promise<{ [path: string]: MediaMetadata }> {
  try {
    return await getClient().sendMessage<{ [path: string]: MediaMetadata }>(
      'getAllMetadata',
    );
  } catch (error) {
    console.error('[database.js] Error getting all metadata:', error);
    return {};
  }
}

/**
 * Creates a new smart playlist.
 */
async function createSmartPlaylist(
  name: string,
  criteria: string,
): Promise<{ id: number }> {
  // Input Validation
  if (!name || typeof name !== 'string' || name.length > 100) {
    throw new Error('Invalid playlist name (1-100 characters).');
  }
  if (!criteria || typeof criteria !== 'string' || criteria.length > 10000) {
    throw new Error('Invalid playlist criteria.');
  }
  try {
    JSON.parse(criteria);
  } catch {
    throw new Error('Criteria must be valid JSON.');
  }

  try {
    return await getClient().sendMessage<{ id: number }>(
      'createSmartPlaylist',
      {
        name,
        criteria,
      },
    );
  } catch (error) {
    console.error('[database.js] Error creating smart playlist:', error);
    throw error;
  }
}

/**
 * Retrieves all smart playlists.
 */
async function getSmartPlaylists(): Promise<SmartPlaylist[]> {
  try {
    return await getClient().sendMessage<SmartPlaylist[]>('getSmartPlaylists');
  } catch (error) {
    console.error('[database.js] Error getting smart playlists:', error);
    return [];
  }
}

/**
 * Deletes a smart playlist.
 */
async function deleteSmartPlaylist(id: number): Promise<void> {
  try {
    await getClient().sendMessage<void>('deleteSmartPlaylist', { id });
  } catch (error) {
    console.error('[database.js] Error deleting smart playlist:', error);
    throw error;
  }
}

/**
 * Updates a smart playlist.
 */
async function updateSmartPlaylist(
  id: number,
  name: string,
  criteria: string,
): Promise<void> {
  // Input Validation
  if (!name || typeof name !== 'string' || name.length > 100) {
    throw new Error('Invalid playlist name (1-100 characters).');
  }
  if (!criteria || typeof criteria !== 'string' || criteria.length > 10000) {
    throw new Error('Invalid playlist criteria.');
  }
  try {
    JSON.parse(criteria);
  } catch {
    throw new Error('Criteria must be valid JSON.');
  }

  try {
    await getClient().sendMessage<void>('updateSmartPlaylist', {
      id,
      name,
      criteria,
    });
  } catch (error) {
    console.error('[database.js] Error updating smart playlist:', error);
    throw error;
  }
}

/**
 * Saves a setting (key-value pair) to the database.
 */
async function saveSetting(key: string, value: string): Promise<void> {
  try {
    await getClient().sendMessage<void>('saveSetting', { key, value });
  } catch (error) {
    console.error('[database.js] Error saving setting:', error);
    throw error;
  }
}

/**
 * Retrieves a setting value from the database.
 */
async function getSetting(key: string): Promise<string | null> {
  try {
    return await getClient().sendMessage<string | null>('getSetting', { key });
  } catch (error) {
    console.error('[database.js] Error getting setting:', error);
    return null;
  }
}

/**
 * Gets all metadata and stats for smart playlist filtering.
 * Returns a raw list of objects from the DB join.
 */
async function getAllMetadataAndStats(): Promise<MediaLibraryItem[]> {
  try {
    return await getClient().sendMessage<MediaLibraryItem[]>(
      'executeSmartPlaylist',
      {
        criteria: '{}',
      },
    );
  } catch (error) {
    console.error('[database.js] Error getting all metadata:', error);
    return [];
  }
}

export {
  initDatabase,
  closeDatabase,
  recordMediaView,
  getMediaViewCounts,
  getAllMediaViewCounts,
  cacheAlbums,
  getCachedAlbums,
  addMediaDirectory,
  getMediaDirectories,
  removeMediaDirectory,
  setDirectoryActiveState,
  setOperationTimeout,
  upsertMetadata,
  bulkUpsertMetadata,
  setRating,
  getMetadata,
  getAllMetadata,
  createSmartPlaylist,
  getSmartPlaylists,
  deleteSmartPlaylist,
  updateSmartPlaylist,
  updateWatchedSegments,
  saveSetting,
  getSetting,
  getAllMetadataAndStats,
  getPendingMetadata,
  getRecentlyPlayed,
};

/**
 * Retrieves recently played media items.
 * @param limit - Max items to return (default 50).
 */
async function getRecentlyPlayed(limit = 50): Promise<MediaLibraryItem[]> {
  try {
    return await getClient().sendMessage<MediaLibraryItem[]>(
      'getRecentlyPlayed',
      {
        limit,
      },
    );
  } catch (error) {
    console.error('[database.js] Error getting recently played:', error);
    throw error;
  }
}

/**
 * Retrieves a list of file paths that have pending metadata extraction.
 */
async function getPendingMetadata(): Promise<string[]> {
  try {
    return await getClient().sendMessage<string[]>('getPendingMetadata');
  } catch (error) {
    console.error('[database.js] Error getting pending metadata:', error);
    return [];
  }
}
