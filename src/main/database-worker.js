/**
 * @file Database Worker Thread - Handles all sqlite3 operations
 * This worker runs in a separate thread to avoid blocking the main process.
 * It receives messages from the main thread to perform database operations
 * and sends results back via the worker messaging API.
 */

import { parentPort } from 'worker_threads';
import sqlite3 from 'sqlite3';
import * as dbFunctions from './database-worker-functions.js';

let db = null;

/**
 * Initialize the database connection in the worker thread
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
 * Record a view for a media file
 */
async function recordMediaView(filePath) {
  return dbFunctions.recordMediaView(db, filePath);
}

/**
 * Get view counts for multiple file paths
 */
async function getMediaViewCounts(filePaths) {
  return dbFunctions.getMediaViewCounts(db, filePaths);
}

/**
 * Cache models in the database
 */
async function cacheModels(cacheKey, models) {
  return dbFunctions.cacheModels(db, cacheKey, models);
}

/**
 * Get cached models from the database
 */
async function getCachedModels(cacheKey) {
  return dbFunctions.getCachedModels(db, cacheKey);
}

/**
 * Close the database connection
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
 */
async function addMediaDirectory(directoryPath) {
  return dbFunctions.addMediaDirectory(db, directoryPath);
}

/**
 * Retrieves all media directory paths from the database.
 */
async function getMediaDirectories() {
  return dbFunctions.getMediaDirectories(db);
}

/**
 * Removes a media directory path from the database.
 */
async function removeMediaDirectory(directoryPath) {
  return dbFunctions.removeMediaDirectory(db, directoryPath);
}

/**
 * Updates the active state of a media directory.
 */
async function setDirectoryActiveState(directoryPath, isActive) {
  return dbFunctions.setDirectoryActiveState(db, directoryPath, isActive);
}

// Message handler - receives commands from main thread
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
  // Send result back to main thread
  parentPort.postMessage({ id, result });
});

console.log('[database-worker.js] Worker thread started and ready.');
