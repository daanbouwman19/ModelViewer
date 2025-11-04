/**
 * @file Database Worker Thread - Handles all sqlite3 operations.
 * This worker runs in a separate thread to avoid blocking the main process.
 * It receives messages from the main thread to perform database operations
 * and sends results back via the worker messaging API.
 * @requires worker_threads
 * @requires sqlite3
 */

import { parentPort } from 'worker_threads';
import sqlite3 from 'sqlite3';
import crypto from 'crypto';
import fs from 'fs';

/**
 * The database instance for this worker thread.
 * @type {import('sqlite3').Database | null}
 */
let db = null;

// Helper Functions (previously in database-worker-functions.js)

/**
 * Generates a stable, unique identifier for a file.
 * @param {string} filePath - The path to the file.
 * @returns {string} A unique MD5 hash for the file.
 */
function generateFileId(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const uniqueString = `${stats.size}-${stats.mtime.getTime()}`;
    return crypto.createHash('md5').update(uniqueString).digest('hex');
  } catch (error) {
    console.error(`[worker] Error generating file ID for ${filePath}:`, error);
    return crypto.createHash('md5').update(filePath).digest('hex');
  }
}

/**
 * Promisifies the db.run method.
 * @param {import('sqlite3').Database} db - The database instance.
 * @param {string} sql - The SQL query to run.
 * @param {Array<any>} [params=[]] - The parameters for the SQL query.
 * @returns {Promise<void>} A promise that resolves when the query is complete.
 */
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Promisifies the db.all method.
 * @param {import('sqlite3').Database} db - The database instance.
 * @param {string} sql - The SQL query to run.
 * @param {Array<any>} [params=[]] - The parameters for the SQL query.
 * @returns {Promise<Array<any>>} A promise that resolves with an array of rows.
 */
function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

/**
 * Promisifies the db.get method.
 * @param {import('sqlite3').Database} db - The database instance.
 * @param {string} sql - The SQL query to run.
 * @param {Array<any>} [params=[]] - The parameters for the SQL query.
 * @returns {Promise<any>} A promise that resolves with a single row.
 */
function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Promisifies the db.close method.
 * @param {import('sqlite3').Database} db - The database instance.
 * @returns {Promise<void>} A promise that resolves when the database is closed.
 */
function dbClose(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Core Worker Functions

/**
 * Initializes the database connection in the worker thread.
 * @param {string} dbPath - The path to the SQLite database file.
 * @returns {Promise<{success: boolean, error?: string}>} The result of the initialization.
 */
async function initDatabase(dbPath) {
  try {
    if (db) {
      await dbClose(db);
      console.log('[worker] Closed existing DB connection before re-init.');
    }

    const newDb = new sqlite3.Database(dbPath);

    await dbRun(
      newDb,
      `CREATE TABLE IF NOT EXISTS media_views (
        file_path_hash TEXT PRIMARY KEY,
        file_path TEXT UNIQUE,
        view_count INTEGER DEFAULT 0,
        last_viewed TEXT
      )`,
    );

    await dbRun(
      newDb,
      `CREATE TABLE IF NOT EXISTS app_cache (
        cache_key TEXT PRIMARY KEY,
        cache_value TEXT,
        last_updated TEXT
      )`,
    );

    await dbRun(
      newDb,
      `CREATE TABLE IF NOT EXISTS media_directories (
        path TEXT PRIMARY KEY,
        is_active INTEGER DEFAULT 1
      )`,
    );

    db = newDb; // Assign to the global `db` variable only on success
    console.log('[worker] SQLite database initialized at:', dbPath);
    return { success: true };
  } catch (error) {
    console.error('[worker] Failed to initialize database:', error);
    db = null; // Ensure db is null on failure
    return { success: false, error: error.message };
  }
}

/**
 * Records a view for a media file.
 * @param {string} filePath - The path of the file that was viewed.
 * @returns {Promise<{success: boolean, error?: string}>} The result of the operation.
 */
async function recordMediaView(filePath) {
  if (!db) return { success: false, error: 'Database not initialized' };

  const fileId = generateFileId(filePath);
  const now = new Date().toISOString();

  try {
    await dbRun(db, 'BEGIN TRANSACTION');
    await dbRun(
      db,
      `INSERT OR IGNORE INTO media_views (file_path_hash, file_path, view_count, last_viewed) VALUES (?, ?, 0, ?)`,
      [fileId, filePath, now],
    );
    await dbRun(
      db,
      `UPDATE media_views SET view_count = view_count + 1, last_viewed = ? WHERE file_path_hash = ?`,
      [now, fileId],
    );
    await dbRun(db, 'COMMIT');
    return { success: true };
  } catch (error) {
    await dbRun(db, 'ROLLBACK').catch(console.error);
    console.error(`[worker] Error recording view for ${filePath}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Gets view counts for multiple file paths.
 * @param {string[]} filePaths - An array of file paths.
 * @returns {Promise<{success: boolean, data?: {[filePath: string]: number}, error?: string}>} The result including the view count map.
 */
async function getMediaViewCounts(filePaths) {
  if (!db) return { success: false, error: 'Database not initialized' };
  if (!filePaths || filePaths.length === 0) {
    return { success: true, data: {} };
  }

  try {
    const viewCountsMap = {};
    const BATCH_SIZE = 500; // Process in batches to avoid SQLite variable limit

    for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
      const batch = filePaths.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => '?').join(',');
      const fileIds = batch.map(generateFileId);
      const sql = `SELECT file_path_hash, view_count FROM media_views WHERE file_path_hash IN (${placeholders})`;
      const rows = await dbAll(db, sql, fileIds);

      const countsByHash = {};
      rows.forEach((row) => {
        countsByHash[row.file_path_hash] = row.view_count;
      });

      batch.forEach((filePath) => {
        const fileId = generateFileId(filePath);
        viewCountsMap[filePath] = countsByHash[fileId] || 0;
      });
    }

    return { success: true, data: viewCountsMap };
  } catch (error) {
    console.error('[worker] Error fetching view counts:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Caches album data in the database.
 * @param {string} cacheKey - The key to use for caching.
 * @param {any} albums - The album data to cache.
 * @returns {Promise<{success: boolean, error?: string}>} The result of the operation.
 */
async function cacheAlbums(cacheKey, albums) {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    await dbRun(
      db,
      `INSERT OR REPLACE INTO app_cache (cache_key, cache_value, last_updated) VALUES (?, ?, ?)`,
      [cacheKey, JSON.stringify(albums), new Date().toISOString()],
    );
    return { success: true };
  } catch (error) {
    console.error('[worker] Error caching albums:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Retrieves cached albums from the database.
 * @param {string} cacheKey - The key of the cache to retrieve.
 * @returns {Promise<{success: boolean, data?: any, error?: string}>} The result including the cached data.
 */
async function getCachedAlbums(cacheKey) {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    const row = await dbGet(
      db,
      `SELECT cache_value FROM app_cache WHERE cache_key = ?`,
      [cacheKey],
    );
    const data = row && row.cache_value ? JSON.parse(row.cache_value) : null;
    return { success: true, data };
  } catch (error) {
    console.error('[worker] Error reading cached albums:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Closes the database connection.
 * @returns {Promise<{success: boolean, error?: string}>} The result of the operation.
 */
async function closeDatabase() {
  if (!db) return { success: true };
  try {
    await dbClose(db);
    db = null;
    console.log('[worker] Database connection closed.');
    return { success: true };
  } catch (error) {
    console.error('[worker] Error closing database:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Adds a new media directory path to the database.
 * @param {string} directoryPath - The path of the directory to add.
 * @returns {Promise<{success: boolean, error?: string}>} The result of the operation.
 */
async function addMediaDirectory(directoryPath) {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    const sql = `
      INSERT INTO media_directories (path, is_active)
      VALUES (?, 1)
      ON CONFLICT(path) DO UPDATE SET is_active = 1;
    `;
    await dbRun(db, sql, [directoryPath]);
    return { success: true };
  } catch (error) {
    console.error(
      `[worker] Error adding media directory ${directoryPath}:`,
      error,
    );
    return { success: false, error: error.message };
  }
}

/**
 * Retrieves all media directory paths from the database.
 * @returns {Promise<{success: boolean, data?: {path: string, isActive: boolean}[], error?: string}>} The result including the list of directories.
 */
async function getMediaDirectories() {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    const rows = await dbAll(
      db,
      'SELECT path, is_active FROM media_directories',
    );
    const directories = rows.map((row) => ({
      path: row.path,
      isActive: !!row.is_active,
    }));
    return { success: true, data: directories };
  } catch (error) {
    console.error('[worker] Error fetching media directories:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Removes a media directory path from the database.
 * @param {string} directoryPath - The path of the directory to remove.
 * @returns {Promise<{success: boolean, error?: string}>} The result of the operation.
 */
async function removeMediaDirectory(directoryPath) {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    await dbRun(db, 'DELETE FROM media_directories WHERE path = ?', [
      directoryPath,
    ]);
    return { success: true };
  } catch (error) {
    console.error(
      `[worker] Error removing media directory ${directoryPath}:`,
      error,
    );
    return { success: false, error: error.message };
  }
}

/**
 * Updates the active state of a media directory.
 * @param {string} directoryPath - The path of the directory to update.
 * @param {boolean} isActive - The new active state.
 * @returns {Promise<{success: boolean, error?: string}>} The result of the operation.
 */
async function setDirectoryActiveState(directoryPath, isActive) {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    await dbRun(
      db,
      'UPDATE media_directories SET is_active = ? WHERE path = ?',
      [isActive ? 1 : 0, directoryPath],
    );
    return { success: true };
  } catch (error) {
    console.error(
      `[worker] Error updating active state for ${directoryPath}:`,
      error,
    );
    return { success: false, error: error.message };
  }
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
      case 'cacheAlbums':
        result = await cacheAlbums(payload.cacheKey, payload.albums);
        break;
      case 'getCachedAlbums':
        result = await getCachedAlbums(payload.cacheKey);
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

  parentPort.postMessage({ id, result });
});

console.log('[database-worker.js] Worker thread started and ready.');

// Signal that the worker is ready, primarily for testing environments
parentPort.postMessage({ type: 'ready' });
