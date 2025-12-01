/**
 * @file Database Worker Thread - Handles all sqlite3 operations.
 * This worker runs in a separate thread to avoid blocking the main process.
 * It receives messages from the main thread to perform database operations
 * and sends results back via the worker messaging API.
 * @requires worker_threads
 * @requires better-sqlite3
 */

import { parentPort } from 'worker_threads';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';

/**
 * The database instance for this worker thread.
 * @type {import('better-sqlite3').Database | null}
 */
let db = null;

/**
 * Cache for prepared statements.
 * @type {Object.<string, import('better-sqlite3').Statement>}
 */
const statements = {};

// Helper Functions

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

// Core Worker Functions

/**
 * Initializes the database connection in the worker thread.
 * @param {string} dbPath - The path to the SQLite database file.
 * @returns {{success: boolean, error?: string}} The result of the initialization.
 */
function initDatabase(dbPath) {
  try {
    if (db) {
      db.close();
      console.log('[worker] Closed existing DB connection before re-init.');
    }

    db = new Database(dbPath);
    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');

    db.prepare(
      `CREATE TABLE IF NOT EXISTS media_views (
        file_path_hash TEXT PRIMARY KEY,
        file_path TEXT UNIQUE,
        view_count INTEGER DEFAULT 0,
        last_viewed TEXT
      )`,
    ).run();

    db.prepare(
      `CREATE TABLE IF NOT EXISTS app_cache (
        cache_key TEXT PRIMARY KEY,
        cache_value TEXT,
        last_updated TEXT
      )`,
    ).run();

    db.prepare(
      `CREATE TABLE IF NOT EXISTS media_directories (
        path TEXT PRIMARY KEY,
        is_active INTEGER DEFAULT 1
      )`,
    ).run();

    // Prepare statements for reuse
    statements.insertMediaView = db.prepare(
      `INSERT OR IGNORE INTO media_views (file_path_hash, file_path, view_count, last_viewed) VALUES (?, ?, 0, ?)`,
    );
    statements.updateMediaView = db.prepare(
      `UPDATE media_views SET view_count = view_count + 1, last_viewed = ? WHERE file_path_hash = ?`,
    );
    statements.getMediaView = db.prepare(
      `SELECT file_path_hash, view_count FROM media_views WHERE file_path_hash = ?`,
    );
    statements.cacheAlbum = db.prepare(
      `INSERT OR REPLACE INTO app_cache (cache_key, cache_value, last_updated) VALUES (?, ?, ?)`,
    );
    statements.getCachedAlbum = db.prepare(
      `SELECT cache_value FROM app_cache WHERE cache_key = ?`,
    );
    statements.addMediaDirectory = db.prepare(`
      INSERT INTO media_directories (path, is_active)
      VALUES (?, 1)
      ON CONFLICT(path) DO UPDATE SET is_active = 1;
    `);
    statements.getMediaDirectories = db.prepare(
      'SELECT path, is_active FROM media_directories',
    );
    statements.removeMediaDirectory = db.prepare(
      'DELETE FROM media_directories WHERE path = ?',
    );
    statements.setDirectoryActiveState = db.prepare(
      'UPDATE media_directories SET is_active = ? WHERE path = ?',
    );

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
 * @returns {{success: boolean, error?: string}} The result of the operation.
 */
function recordMediaView(filePath) {
  if (!db) return { success: false, error: 'Database not initialized' };

  const fileId = generateFileId(filePath);
  const now = new Date().toISOString();

  try {
    const transaction = db.transaction(() => {
      statements.insertMediaView.run(fileId, filePath, now);
      statements.updateMediaView.run(now, fileId);
    });

    transaction();
    return { success: true };
  } catch (error) {
    console.error(`[worker] Error recording view for ${filePath}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Gets view counts for multiple file paths.
 * @param {string[]} filePaths - An array of file paths.
 * @returns {{success: boolean, data?: {[filePath: string]: number}, error?: string}} The result including the view count map.
 */
function getMediaViewCounts(filePaths) {
  if (!db) return { success: false, error: 'Database not initialized' };
  if (!filePaths || filePaths.length === 0) {
    return { success: true, data: {} };
  }

  try {
    const viewCountsMap = {};

    // Since we are using better-sqlite3, we can just iterate and query individually
    // for small batches, or use a transaction for larger ones.
    // Given the prepared statement reuse, individual queries are quite fast.
    // However, for consistency with previous batch logic, let's keep it simple.
    // Actually, `WHERE IN` with prepared statements is tricky because the number of params varies.
    // A simpler approach with cached statements is to loop and query by ID.
    // Wrapped in a transaction, this is very performant.

    const transaction = db.transaction((paths) => {
      paths.forEach((filePath) => {
        const fileId = generateFileId(filePath);
        const row = statements.getMediaView.get(fileId);
        viewCountsMap[filePath] = row ? row.view_count : 0;
      });
    });

    transaction(filePaths);

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
 * @returns {{success: boolean, error?: string}} The result of the operation.
 */
function cacheAlbums(cacheKey, albums) {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    statements.cacheAlbum.run(
      cacheKey,
      JSON.stringify(albums),
      new Date().toISOString(),
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
 * @returns {{success: boolean, data?: any, error?: string}} The result including the cached data.
 */
function getCachedAlbums(cacheKey) {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    const row = statements.getCachedAlbum.get(cacheKey);
    const data = row && row.cache_value ? JSON.parse(row.cache_value) : null;
    return { success: true, data };
  } catch (error) {
    console.error('[worker] Error reading cached albums:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Closes the database connection.
 * @returns {{success: boolean, error?: string}} The result of the operation.
 */
function closeDatabase() {
  if (!db) return { success: true };
  try {
    db.close();
    db = null;
    // Clear statements cache
    for (const key in statements) {
      delete statements[key];
    }
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
 * @returns {{success: boolean, error?: string}} The result of the operation.
 */
function addMediaDirectory(directoryPath) {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    statements.addMediaDirectory.run(directoryPath);
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
 * @returns {{success: boolean, data?: {path: string, isActive: boolean}[], error?: string}} The result including the list of directories.
 */
function getMediaDirectories() {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    const rows = statements.getMediaDirectories.all();
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
 * @returns {{success: boolean, error?: string}} The result of the operation.
 */
function removeMediaDirectory(directoryPath) {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    statements.removeMediaDirectory.run(directoryPath);
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
 * @returns {{success: boolean, error?: string}} The result of the operation.
 */
function setDirectoryActiveState(directoryPath, isActive) {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    statements.setDirectoryActiveState.run(isActive ? 1 : 0, directoryPath);
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
    // Note: Internal functions are now synchronous, but we keep the async handler
    // structure in case we need async operations in the future or for consistency.
    // The await keyword is not strictly necessary for sync functions but harmless.
    switch (type) {
      case 'init':
        result = initDatabase(payload.dbPath);
        break;
      case 'recordMediaView':
        result = recordMediaView(payload.filePath);
        break;
      case 'getMediaViewCounts':
        result = getMediaViewCounts(payload.filePaths);
        break;
      case 'cacheAlbums':
        result = cacheAlbums(payload.cacheKey, payload.albums);
        break;
      case 'getCachedAlbums':
        result = getCachedAlbums(payload.cacheKey);
        break;
      case 'close':
        result = closeDatabase();
        break;
      case 'addMediaDirectory':
        result = addMediaDirectory(payload.directoryPath);
        break;
      case 'getMediaDirectories':
        result = getMediaDirectories();
        break;
      case 'removeMediaDirectory':
        result = removeMediaDirectory(payload.directoryPath);
        break;
      case 'setDirectoryActiveState':
        result = setDirectoryActiveState(
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
