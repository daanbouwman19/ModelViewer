/**
 * @file Manages all database interactions for the application using a Worker Thread.
 * This module acts as a bridge between the main process and the database worker thread,
 * which handles all better-sqlite3 operations to avoid blocking the main process.
 * @requires path
 * @requires electron
 * @requires worker_threads
 * @requires ./constants.js
 */

/**
 * @typedef {import('../renderer/state.js').MediaFile} MediaFile
 * @typedef {import('../renderer/state.js').Model} Model
 */

const path = require('path');
const { app } = require('electron');
const { Worker } = require('worker_threads');
const { FILE_INDEX_CACHE_KEY } = require('./constants.js');

/**
 * The database worker thread instance.
 * @type {Worker | null}
 */
let dbWorker = null;

/**
 * Counter for generating unique message IDs
 */
let messageIdCounter = 0;

/**
 * Map of pending promises waiting for worker responses
 */
const pendingMessages = new Map();

/**
 * Timeout duration for database operations (in milliseconds).
 * Can be overridden for testing purposes.
 */
let operationTimeout = 30000;

/**
 * Sends a message to the database worker and returns a promise that resolves with the result.
 * @param {string} type - The type of operation to perform.
 * @param {Object} payload - The payload data for the operation.
 * @returns {Promise<any>} A promise that resolves with the worker's response.
 */
function sendMessageToWorker(type, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!dbWorker) {
      reject(new Error('Database worker not initialized'));
      return;
    }

    const id = messageIdCounter++;

    // Timeout after the configured duration
    const timeoutId = setTimeout(() => {
      if (pendingMessages.has(id)) {
        pendingMessages.delete(id);
        reject(new Error(`Database operation timed out: ${type}`));
      }
    }, operationTimeout);

    pendingMessages.set(id, { resolve, reject, timeoutId });

    dbWorker.postMessage({ id, type, payload });
  });
}

/**
 * Initializes the database worker thread.
 * @returns {Promise<void>}
 * @throws {Error} If worker initialization fails.
 */
async function initDatabase() {
  if (dbWorker) {
    console.log(
      '[database.js] Terminating existing database worker before re-init.',
    );
    await dbWorker.terminate();
    dbWorker = null;
  }

  try {
    const workerPath = path.join(__dirname, 'database-worker.js');
    dbWorker = new Worker(workerPath);

    // Handle messages from the worker
    dbWorker.on('message', (message) => {
      const { id, result } = message;
      const pending = pendingMessages.get(id);

      if (pending) {
        // Clear the timeout
        clearTimeout(pending.timeoutId);
        pendingMessages.delete(id);

        if (result.success) {
          pending.resolve(result.data);
        } else {
          pending.reject(new Error(result.error || 'Unknown database error'));
        }
      }
    });

    // Handle worker errors
    dbWorker.on('error', (error) => {
      console.error('[database.js] Database worker error:', error);
      // Reject all pending messages and clear timeouts
      for (const [id, pending] of pendingMessages.entries()) {
        clearTimeout(pending.timeoutId);
        pending.reject(error);
        pendingMessages.delete(id);
      }
    });

    // Handle worker exit
    dbWorker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`[database.js] Database worker exited with code ${code}`);
      }
      dbWorker = null;
      // Reject all pending messages and clear timeouts
      for (const [id, pending] of pendingMessages.entries()) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error('Database worker exited unexpectedly'));
        pendingMessages.delete(id);
      }
    });

    // Initialize the database in the worker
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
 * Records a view for a media file. Increments its view count and updates the last viewed timestamp.
 * @param {string} filePath - The path to the media file.
 * @returns {Promise<void>}
 */
async function recordMediaView(filePath) {
  try {
    await sendMessageToWorker('recordMediaView', { filePath });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[database.js] Error recording media view:', error.message);
    }
  }
}

/**
 * Retrieves view counts for a list of media files.
 * @param {string[]} filePaths - An array of file paths.
 * @returns {Promise<Object<string, number>>} A map of file paths to their view counts.
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
 * @param {Model[]} models - The array of model objects to cache.
 * @returns {Promise<void>}
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
 * @returns {Promise<Model[] | null>} The cached models or null if not found or error.
 */
async function getCachedModels() {
  try {
    return await sendMessageToWorker('getCachedModels', {
      cacheKey: FILE_INDEX_CACHE_KEY,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[database.js] Error getting cached models:', error.message);
    }
    return null;
  }
}

/**
 * Closes the database worker thread.
 * @returns {Promise<void>}
 */
async function closeDatabase() {
  if (dbWorker) {
    try {
      await sendMessageToWorker('close');
      await dbWorker.terminate();
      if (process.env.NODE_ENV !== 'test') {
        console.log('[database.js] Database worker terminated.');
      }
    } catch (error) {
      console.error('[database.js] Error closing database worker:', error);
    } finally {
      dbWorker = null;
    }
  }
}

/**
 * Sets the timeout duration for database operations (useful for testing).
 * @param {number} timeout - The timeout in milliseconds.
 */
function setOperationTimeout(timeout) {
  operationTimeout = timeout;
}

/**
 * Adds a new media directory to the database.
 * @param {string} directoryPath - The absolute path of the directory.
 * @returns {Promise<void>}
 */
async function addMediaDirectory(directoryPath) {
  try {
    await sendMessageToWorker('addMediaDirectory', { directoryPath });
  } catch (error) {
    console.error(`[database.js] Error adding media directory '${directoryPath}':`, error);
    // Decide if this should re-throw or just log
    throw error;
  }
}

/**
 * Retrieves all media directories from the database.
 * @returns {Promise<string[]>} A list of all media directory paths.
 */
async function getMediaDirectories() {
  try {
    const directories = await sendMessageToWorker('getMediaDirectories');
    return directories || [];
  } catch (error) {
    console.error('[database.js] Error getting media directories:', error);
    return []; // Return empty array on error
  }
}

module.exports = {
  initDatabase,
  recordMediaView,
  getMediaViewCounts,
  cacheModels,
  getCachedModels,
  closeDatabase,
  setOperationTimeout,
  addMediaDirectory,
  getMediaDirectories,
};
