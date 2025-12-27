/**
 * @file Manages all database interactions for the application using a Worker Thread.
 * This module acts as a bridge between the main process (or server) and the database worker thread.
 */

import { Worker, WorkerOptions } from 'worker_threads';
import { FILE_INDEX_CACHE_KEY } from './constants';
import type {
  Album,
  MediaDirectory,
  SmartPlaylist,
  MediaMetadata,
  MediaLibraryItem,
} from './types';

/**
 * The database worker thread instance.
 */
let dbWorker: Worker | null = null;

/**
 * A flag to indicate if the worker is being terminated intentionally.
 */
let isTerminating = false;

/**
 * A counter for generating unique message IDs for worker communication.
 */
let messageIdCounter = 0;

interface PendingMessage<T = unknown> {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  timeoutId: NodeJS.Timeout;
}

/**
 * A map of pending promises waiting for worker responses, keyed by message ID.
 */
const pendingMessages = new Map<number, PendingMessage<unknown>>();

/**
 * The timeout duration for database operations in milliseconds.
 */
let operationTimeout = 30000;

/**
 * Sends a message to the database worker and returns a promise that resolves with the result.
 * @param type - The type of operation to perform (e.g., 'init', 'recordMediaView').
 * @param payload - The data payload for the operation.
 * @returns A promise that resolves with the worker's response data.
 * @throws {Error} If the worker is not initialized or the operation times out.
 */
function sendMessageToWorker<T = unknown>(
  type: string,
  payload: unknown = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!dbWorker) {
      return reject(new Error('Database worker not initialized'));
    }

    const id = messageIdCounter++;

    const timeoutId = setTimeout(() => {
      if (pendingMessages.has(id)) {
        pendingMessages.delete(id);
        reject(new Error(`Database operation timed out: ${type}`));
      }
    }, operationTimeout);

    pendingMessages.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
      timeoutId,
    });

    try {
      dbWorker.postMessage({ id, type, payload });
    } catch (error: unknown) {
      console.error(
        `[database.js] Error posting message to worker: ${(error as Error).message}`,
      );
      clearTimeout(timeoutId);
      pendingMessages.delete(id);
      reject(error);
    }
  });
}

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
  if (dbWorker) {
    console.log(
      '[database.js] Terminating existing database worker before re-init.',
    );
    isTerminating = true;
    await dbWorker.terminate();
    dbWorker = null;
  }

  isTerminating = false;

  try {
    dbWorker = new Worker(workerScriptPath, workerOptions);

    dbWorker.on(
      'message',
      (message: {
        id: number;
        result: { success: boolean; data?: unknown; error?: string };
      }) => {
        const { id, result } = message;
        const pending = pendingMessages.get(id);
        if (pending) {
          clearTimeout(pending.timeoutId);
          pendingMessages.delete(id);
          if (result.success) {
            pending.resolve(result.data);
          } else {
            pending.reject(new Error(result.error || 'Unknown database error'));
          }
        }
      },
    );

    dbWorker.on('error', (error) => {
      console.error('[database.js] Database worker error:', error);
      for (const [id, pending] of pendingMessages.entries()) {
        clearTimeout(pending.timeoutId);
        pending.reject(error);
        pendingMessages.delete(id);
      }
    });

    dbWorker.on('exit', (code) => {
      if (code !== 0 && !isTerminating) {
        console.error(
          `[database.js] Database worker exited unexpectedly with code ${code}`,
        );
        // Attempt to restart worker logic
        // We use a small delay to avoid rapid crash loops
        console.log('[database.js] Attempting to restart worker in 1s...');
        setTimeout(() => {
          initDatabase(userDbPath, workerScriptPath, workerOptions).catch(
            (err) =>
              console.error('[database.js] Failed to restart worker:', err),
          );
        }, 1000);
      }
      for (const [id, pending] of pendingMessages.entries()) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error('Database worker exited unexpectedly'));
        pendingMessages.delete(id);
      }
    });

    await sendMessageToWorker<void>('init', { dbPath: userDbPath });

    if (process.env.NODE_ENV !== 'test') {
      console.log('[database.js] Database worker initialized successfully.');
    }
  } catch (error) {
    console.error(
      '[database.js] CRITICAL ERROR: Failed to initialize database worker:',
      error,
    );
    dbWorker = null;
    throw error;
  }
}

/**
 * Records a view for a media file.
 * @param filePath - The path to the media file.
 * @returns A promise that resolves when the view is recorded. Errors are logged but not re-thrown.
 */
async function recordMediaView(filePath: string): Promise<void> {
  try {
    await sendMessageToWorker<void>('recordMediaView', { filePath });
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
    return await sendMessageToWorker<{ [filePath: string]: number }>(
      'getMediaViewCounts',
      { filePaths },
    );
  } catch (error) {
    console.error('[database.js] Error fetching view counts:', error);
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
    await sendMessageToWorker<void>('cacheAlbums', {
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
    return await sendMessageToWorker<Album[] | null>('getCachedAlbums', {
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
  if (dbWorker) {
    isTerminating = true;
    try {
      await sendMessageToWorker<void>('close');
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[database.js] Warning during worker shutdown:', error);
      }
    } finally {
      try {
        if (dbWorker) {
          await dbWorker.terminate();
        }
      } catch (error) {
        console.error('[database.js] Error closing database worker:', error);
      } finally {
        dbWorker = null;
        isTerminating = false;
        console.log('[database.js] Database worker terminated.');
      }
    }
  }
}

/**
 * Sets the timeout duration for database operations. Useful for testing.
 * @param timeout - The timeout in milliseconds.
 */
function setOperationTimeout(timeout: number): void {
  operationTimeout = timeout;
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

    await sendMessageToWorker<void>('addMediaDirectory', {
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
    const directories = await sendMessageToWorker<MediaDirectory[]>(
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
    await sendMessageToWorker<void>('removeMediaDirectory', { directoryPath });
  } catch (error) {
    console.error(
      `[database.js] Error removing media directory '${directoryPath}':`,
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
    await sendMessageToWorker<void>('setDirectoryActiveState', {
      directoryPath,
      isActive,
    });
  } catch (error) {
    console.error(
      `[database.js] Error setting active state for '${directoryPath}':`,
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
    await sendMessageToWorker<void>('upsertMetadata', {
      filePath,
      ...metadata,
    });
  } catch (error) {
    console.error('[database.js] Error upserting metadata:', error);
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
    await sendMessageToWorker<void>('bulkUpsertMetadata', payloads);
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
    await sendMessageToWorker<void>('setRating', {
      filePath,
      rating,
    });
  } catch (error) {
    console.error('[database.js] Error setting rating:', error);
    throw error;
  }
}

/**
 * Retrieves metadata for a list of files.
 */
async function getMetadata(
  filePaths: string[],
): Promise<{ [path: string]: MediaMetadata }> {
  try {
    return await sendMessageToWorker<{ [path: string]: MediaMetadata }>(
      'getMetadata',
      { filePaths },
    );
  } catch (error) {
    console.error('[database.js] Error getting metadata:', error);
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
    return await sendMessageToWorker<{ id: number }>('createSmartPlaylist', {
      name,
      criteria,
    });
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
    return await sendMessageToWorker<SmartPlaylist[]>('getSmartPlaylists');
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
    await sendMessageToWorker<void>('deleteSmartPlaylist', { id });
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
    await sendMessageToWorker<void>('updateSmartPlaylist', {
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
 * Gets all metadata and stats for smart playlist filtering.
 * Returns a raw list of objects from the DB join.
 */
async function getAllMetadataAndStats(): Promise<MediaLibraryItem[]> {
  try {
    return await sendMessageToWorker<MediaLibraryItem[]>(
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
  createSmartPlaylist,
  getSmartPlaylists,
  deleteSmartPlaylist,
  updateSmartPlaylist,
  getAllMetadataAndStats,
  getPendingMetadata,
};

/**
 * Retrieves a list of file paths that have pending metadata extraction.
 */
async function getPendingMetadata(): Promise<string[]> {
  try {
    return await sendMessageToWorker<string[]>('getPendingMetadata');
  } catch (error) {
    console.error('[database.js] Error getting pending metadata:', error);
    return [];
  }
}
