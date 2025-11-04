/**
 * @file Manages all database interactions for the application using a Worker Thread.
 * This module acts as a bridge between the main process and the database worker thread,
 * which handles all sqlite3 operations to avoid blocking the main process.
 * @requires path
 * @requires electron
 * @requires worker_threads
 * @requires ./constants.js
 */

import path from 'path';
import { app } from 'electron';
import { Worker } from 'worker_threads';
import { FILE_INDEX_CACHE_KEY } from './constants.js';

/**
 * The database worker thread instance.
 * @type {Worker | null}
 */
let dbWorker = null;

/**
 * A flag to indicate if the worker is being terminated intentionally.
 * @type {boolean}
 */
let isTerminating = false;

/**
 * A counter for generating unique message IDs for worker communication.
 * @type {number}
 */
let messageIdCounter = 0;

/**
 * A map of pending promises waiting for worker responses, keyed by message ID.
 * @type {Map<number, {resolve: Function, reject: Function, timeoutId: NodeJS.Timeout}>}
 */
const pendingMessages = new Map();

/**
 * The timeout duration for database operations in milliseconds.
 * @type {number}
 */
let operationTimeout = 30000;

/**
 * Sends a message to the database worker and returns a promise that resolves with the result.
 * @param {string} type - The type of operation to perform (e.g., 'init', 'recordMediaView').
 * @param {Object} [payload={}] - The data payload for the operation.
 * @returns {Promise<any>} A promise that resolves with the worker's response data.
 * @throws {Error} If the worker is not initialized or the operation times out.
 */
function sendMessageToWorker(type, payload = {}) {
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

    pendingMessages.set(id, { resolve, reject, timeoutId });

    try {
      dbWorker.postMessage({ id, type, payload });
    } catch (error) {
      console.error(
        `[database.js] Error posting message to worker: ${error.message}`,
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
 * @returns {Promise<void>} A promise that resolves when the database is successfully initialized.
 * @throws {Error} If the worker initialization fails.
 */
async function initDatabase() {
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
    let workerPath;
    const isTest =
      process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

    if (isTest || !import.meta.url.startsWith('file://')) {
      const path = await import('path');
      workerPath = path.resolve(process.cwd(), 'src/main/database-worker.js');
    } else {
      workerPath = new URL('./database-worker.js', import.meta.url);
    }

    dbWorker = new Worker(workerPath);

    dbWorker.on('message', (message) => {
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
    });

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
      }
      // Do not set dbWorker to null here. The closeDatabase function is responsible
      // for cleanup and nullification. This ensures that even if the worker crashes,
      // closeDatabase can still attempt to call terminate() on the worker handle.
      for (const [id, pending] of pendingMessages.entries()) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error('Database worker exited unexpectedly'));
        pendingMessages.delete(id);
      }
    });

    const dbPath = path.join(
      app.getPath('userData'),
      'media_slideshow_stats.sqlite',
    );
    await sendMessageToWorker('init', { dbPath });

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
 * @param {string} filePath - The path to the media file.
 * @returns {Promise<void>} A promise that resolves when the view is recorded. Errors are logged but not re-thrown.
 */
async function recordMediaView(filePath) {
  try {
    await sendMessageToWorker('recordMediaView', { filePath });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        `[database.js] Error recording media view: ${error.message}`,
      );
    }
  }
}

/**
 * Retrieves view counts for a list of media files.
 * @param {string[]} filePaths - An array of file paths.
 * @returns {Promise<{[filePath: string]: number}>} A promise that resolves to a map of file paths to their view counts. Returns an empty object on error.
 */
async function getMediaViewCounts(filePaths) {
  if (!filePaths || filePaths.length === 0) {
    return {};
  }
  try {
    return await sendMessageToWorker('getMediaViewCounts', { filePaths });
  } catch (error) {
    console.error('[database.js] Error fetching view counts:', error);
    return {};
  }
}

/**
 * Caches the list of models (file index) into the database.
 * @param {import('./media-scanner.js').Model[]} models - The array of model objects to cache.
 * @returns {Promise<void>} A promise that resolves when the models are cached. Errors are logged but not re-thrown.
 */
async function cacheModels(models) {
  try {
    await sendMessageToWorker('cacheModels', {
      cacheKey: FILE_INDEX_CACHE_KEY,
      models,
    });
  } catch (error) {
    console.error('[database.js] Error caching models:', error);
  }
}

/**
 * Retrieves the cached list of models from the database.
 * @returns {Promise<import('./media-scanner.js').Model[] | null>} A promise that resolves to the cached models, or null if not found or an error occurs.
 */
async function getCachedModels() {
  try {
    return await sendMessageToWorker('getCachedModels', {
      cacheKey: FILE_INDEX_CACHE_KEY,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        `[database.js] Error getting cached models: ${error.message}`,
      );
    }
    return null;
  }
}

/**
 * Closes the database connection by terminating the worker thread.
 * @returns {Promise<void>} A promise that resolves when the worker has been terminated.
 */
async function closeDatabase() {
  if (dbWorker) {
    isTerminating = true;
    try {
      // Attempt to gracefully shut down the worker
      await sendMessageToWorker('close');
    } catch (error) {
      // This is expected if the worker has already crashed, so we can ignore it.
    } finally {
      try {
        if (dbWorker) {
          await dbWorker.terminate();
        }
      } catch (error) {
        // This handles cases where terminate() itself fails.
        console.error('[database.js] Error closing database worker:', error);
      } finally {
        // Ensure the worker reference is cleared in all scenarios.
        dbWorker = null;
      }
    }
  }
}

/**
 * Sets the timeout duration for database operations. Useful for testing.
 * @param {number} timeout - The timeout in milliseconds.
 */
function setOperationTimeout(timeout) {
  operationTimeout = timeout;
}

/**
 * Adds a new media directory to the database.
 * @param {string} directoryPath - The absolute path of the directory to add.
 * @returns {Promise<void>} A promise that resolves on success or rejects on failure.
 * @throws {Error} If the database operation fails.
 */
async function addMediaDirectory(directoryPath) {
  try {
    await sendMessageToWorker('addMediaDirectory', { directoryPath });
  } catch (error) {
    console.error(
      `[database.js] Error adding media directory '${directoryPath}':`,
      error,
    );
    throw error;
  }
}

/**
 * Retrieves all media directories from the database.
 * @returns {Promise<{path: string, isActive: boolean}[]>} A promise that resolves to a list of all media directory objects. Returns an empty array on error.
 */
async function getMediaDirectories() {
  try {
    const directories = await sendMessageToWorker('getMediaDirectories');
    return directories || [];
  } catch (error) {
    console.error('[database.js] Error getting media directories:', error);
    return [];
  }
}

/**
 * Removes a media directory from the database.
 * @param {string} directoryPath - The absolute path of the directory to remove.
 * @returns {Promise<void>} A promise that resolves on success or rejects on failure.
 * @throws {Error} If the database operation fails.
 */
async function removeMediaDirectory(directoryPath) {
  try {
    await sendMessageToWorker('removeMediaDirectory', { directoryPath });
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
 * @param {string} directoryPath - The path of the directory to update.
 * @param {boolean} isActive - The new active state.
 * @returns {Promise<void>} A promise that resolves on success or rejects on failure.
 * @throws {Error} If the database operation fails.
 */
async function setDirectoryActiveState(directoryPath, isActive) {
  try {
    await sendMessageToWorker('setDirectoryActiveState', {
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

export {
  initDatabase,
  recordMediaView,
  getMediaViewCounts,
  cacheModels,
  getCachedModels,
  closeDatabase,
  setOperationTimeout,
  addMediaDirectory,
  getMediaDirectories,
  removeMediaDirectory,
  setDirectoryActiveState,
};
