/**
 * @file Database Worker Thread - Handles all sqlite3 operations.
 * This worker runs in a separate thread to avoid blocking the main process.
 * It receives messages from the main thread to perform database operations
 * and sends results back via the worker messaging API.
 * @requires worker_threads
 * @requires sqlite3
 * @requires ./database-worker-functions.js
 */

import { parentPort } from 'worker_threads';
import sqlite3 from 'sqlite3';
import * as dbFunctions from './database-worker-functions.js';

/**
 * The database instance for this worker thread.
 * @type {import('sqlite3').Database | null}
 */
let db = null;

/**
 * Initializes the database connection in the worker thread.
 * @param {string} dbPath - The path to the SQLite database file.
 * @returns {Promise<{success: boolean, error?: string}>} The result of the initialization.
 */
async function initDatabase(dbPath) {
  const result = await dbFunctions.initDatabase(sqlite3.Database, dbPath, db);
  if (result.success) {
    db = result.db;
    return { success: true };
  }
  return { success: false, error: result.error };
}

/**
 * Records a view for a media file.
 * @param {string} filePath - The path of the file that was viewed.
 * @returns {Promise<{success: boolean, error?: string}>} The result of the operation.
 */
async function recordMediaView(filePath) {
  return dbFunctions.recordMediaView(db, filePath);
}

/**
 * Gets view counts for multiple file paths.
 * @param {string[]} filePaths - An array of file paths.
 * @returns {Promise<{success: boolean, data?: {[filePath: string]: number}, error?: string}>} The result including the view count map.
 */
async function getMediaViewCounts(filePaths) {
  const result = await dbFunctions.getMediaViewCounts(db, filePaths);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Caches model data in the database.
 * @param {string} cacheKey - The key to use for caching.
 * @param {any} models - The model data to cache.
 * @returns {Promise<{success: boolean, error?: string}>} The result of the operation.
 */
async function cacheModels(cacheKey, models) {
  return dbFunctions.cacheModels(db, cacheKey, models);
}

/**
 * Retrieves cached models from the database.
 * @param {string} cacheKey - The key of the cache to retrieve.
 * @returns {Promise<{success: boolean, data?: any, error?: string}>} The result including the cached data.
 */
async function getCachedModels(cacheKey) {
  return dbFunctions.getCachedModels(db, cacheKey);
}

/**
 * Closes the database connection.
 * @returns {Promise<{success: boolean, error?: string}>} The result of the operation.
 */
async function closeDatabase() {
  const result = await dbFunctions.closeDatabase(db);
  if (result.success) {
    db = null;
  }
  return result;
}

/**
 * Adds a new media directory path to the database.
 * @param {string} directoryPath - The path of the directory to add.
 * @returns {Promise<{success: boolean, error?: string}>} The result of the operation.
 */
async function addMediaDirectory(directoryPath) {
  return dbFunctions.addMediaDirectory(db, directoryPath);
}

/**
 * Retrieves all media directory paths from the database.
 * @returns {Promise<{success: boolean, data?: {path: string, isActive: boolean}[], error?: string}>} The result including the list of directories.
 */
async function getMediaDirectories() {
  return dbFunctions.getMediaDirectories(db);
}

/**
 * Removes a media directory path from the database.
 * @param {string} directoryPath - The path of the directory to remove.
 * @returns {Promise<{success: boolean, error?: string}>} The result of the operation.
 */
async function removeMediaDirectory(directoryPath) {
  return dbFunctions.removeMediaDirectory(db, directoryPath);
}

/**
 * Updates the active state of a media directory.
 * @param {string} directoryPath - The path of the directory to update.
 * @param {boolean} isActive - The new active state.
 * @returns {Promise<{success: boolean, error?: string}>} The result of the operation.
 */
async function setDirectoryActiveState(directoryPath, isActive) {
  return dbFunctions.setDirectoryActiveState(db, directoryPath, isActive);
}

// Message handler from the main thread
parentPort.on('message', async (message) => {
  const { id, type, payload } = message;
  let result;

  try {
    switch (type) {
      case 'init':
        result = await initDatabase(payload.dbPath);
        break;

      case 'recordMediaView':
        result = await recordMediaView(payload.filePath);
        break;

      case 'getMediaViewCounts':
        result = await getMediaViewCounts(payload.filePaths);
        break;

      case 'cacheModels':
        result = await cacheModels(payload.cacheKey, payload.models);
        break;

      case 'getCachedModels':
        result = await getCachedModels(payload.cacheKey);
        break;

      case 'close':
        result = await closeDatabase();
        break;

      case 'addMediaDirectory':
        result = await addMediaDirectory(payload.directoryPath);
        break;

      case 'getMediaDirectories':
        result = await getMediaDirectories();
        break;

      case 'removeMediaDirectory':
        result = await removeMediaDirectory(payload.directoryPath);
        break;

      case 'setDirectoryActiveState':
        result = await setDirectoryActiveState(
          payload.directoryPath,
          payload.isActive,
        );
        break;

      default:
        result = { success: false, error: `Unknown message type: ${type}` };
    }
  } catch (error) {
    console.error(
      `[worker] Error processing message id=${id}, type=${type}:`,
      error,
    );
    result = { success: false, error: error.message };
  }

  // Send the result back to the main thread
  parentPort.postMessage({ id, result });
});

console.log('[database-worker.js] Worker thread started and ready.');

// Signal that the worker is ready, primarily for testing environments
parentPort.postMessage({ type: 'ready' });
