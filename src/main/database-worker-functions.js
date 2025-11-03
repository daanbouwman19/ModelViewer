/**
 * @file Database Worker Functions - Core database operations
 * These functions are extracted for testability and used by the worker thread.
 */

import crypto from 'crypto';

/**
 * Generates a unique MD5 hash for a given file path.
 * @param {string} filePath - The path to the file.
 * @returns {string} The MD5 hash of the file path.
 */
export function generateFileId(filePath) {
  return crypto.createHash('md5').update(filePath).digest('hex');
}

/**
 * Promisifies the db.run method.
 * @param {object} db - The database instance.
 * @param {string} sql - The SQL query to run.
 * @param {Array<any>} params - The parameters for the SQL query.
 * @returns {Promise<void>}
 */
export function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Promisifies the db.all method.
 * @param {object} db - The database instance.
 * @param {string} sql - The SQL query to run.
 * @param {Array<any>} params - The parameters for the SQL query.
 * @returns {Promise<Array>}
 */
export function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

/**
 * Promisifies the db.get method.
 * @param {object} db - The database instance.
 * @param {string} sql - The SQL query to run.
 * @param {Array<any>} params - The parameters for the SQL query.
 * @returns {Promise<any>}
 */
export function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

/**
 * Promisifies the db.close method.
 * @param {object} db - The database instance.
 * @returns {Promise<void>}
 */
export function dbClose(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Initialize the database connection
 * @param {object} Database - The sqlite3.Database constructor
 * @param {string} dbPath - Path to the database file
 * @param {object|null} existingDb - Existing database connection to close
 * @returns {Promise<{db: object, success: boolean, error?: string}>}
 */
export async function initDatabase(Database, dbPath, existingDb = null) {
  try {
    if (existingDb) {
      await dbClose(existingDb);
      console.log(
        '[database-worker.js] Closed existing DB connection before re-init.',
      );
    }

    const db = new Database(dbPath);

    // Create tables
    await dbRun(
      db,
      `CREATE TABLE IF NOT EXISTS media_views (
      file_path_hash TEXT PRIMARY KEY,
      file_path TEXT UNIQUE,
      view_count INTEGER DEFAULT 0,
      last_viewed TEXT
    )`,
    );

    await dbRun(
      db,
      `CREATE TABLE IF NOT EXISTS app_cache (
      cache_key TEXT PRIMARY KEY,
      cache_value TEXT,
      last_updated TEXT
    )`,
    );

    await dbRun(
      db,
      `CREATE TABLE IF NOT EXISTS media_directories (
      path TEXT PRIMARY KEY,
      is_active INTEGER DEFAULT 1
    )`,
    );

    console.log('[database-worker.js] SQLite database initialized at:', dbPath);
    return { db, success: true };
  } catch (error) {
    console.error('[database-worker.js] Failed to initialize database:', error);
    return { db: null, success: false, error: error.message };
  }
}

/**
 * Record a view for a media file
 * @param {object} db - The database instance
 * @param {string} filePath - The file path to record a view for
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function recordMediaView(db, filePath) {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }

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
    await dbRun(db, 'ROLLBACK').catch(() => {});
    console.error(
      `[database-worker.js] Error recording view for ${filePath}:`,
      error,
    );
    return { success: false, error: error.message };
  }
}

/**
 * Get view counts for multiple file paths
 * @param {object} db - The database instance
 * @param {string[]} filePaths - Array of file paths
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function getMediaViewCounts(db, filePaths) {
  if (!db || !filePaths || filePaths.length === 0) {
    return { success: true, data: {} };
  }

  try {
    const viewCountsMap = {};
    const placeholders = filePaths.map(() => '?').join(',');
    const fileIds = filePaths.map(generateFileId);

    const sql = `SELECT file_path_hash, view_count FROM media_views WHERE file_path_hash IN (${placeholders})`;

    const rows = await dbAll(db, sql, fileIds);

    const countsByHash = {};
    rows.forEach((row) => {
      countsByHash[row.file_path_hash] = row.view_count;
    });

    filePaths.forEach((filePath) => {
      const fileId = generateFileId(filePath);
      viewCountsMap[filePath] = countsByHash[fileId] || 0;
    });

    return { success: true, data: viewCountsMap };
  } catch (error) {
    console.error('[database-worker.js] Error fetching view counts:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Cache models in the database
 * @param {object} db - The database instance
 * @param {string} cacheKey - The cache key
 * @param {Array} models - The models to cache
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function cacheModels(db, cacheKey, models) {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }

  try {
    await dbRun(
      db,
      `INSERT OR REPLACE INTO app_cache (cache_key, cache_value, last_updated) VALUES (?, ?, ?)`,
      [cacheKey, JSON.stringify(models), new Date().toISOString()],
    );

    console.log('[database-worker.js] Models cached successfully.');
    return { success: true };
  } catch (error) {
    console.error('[database-worker.js] Error caching models:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get cached models from the database
 * @param {object} db - The database instance
 * @param {string} cacheKey - The cache key
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function getCachedModels(db, cacheKey) {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }

  try {
    const sql = `SELECT cache_value FROM app_cache WHERE cache_key = ?`;
    const row = await dbGet(db, sql, [cacheKey]);

    if (row && row.cache_value) {
      console.log('[database-worker.js] Loaded models from cache.');
      return { success: true, data: JSON.parse(row.cache_value) };
    }

    console.log('[database-worker.js] No cached models found.');
    return { success: true, data: null };
  } catch (error) {
    console.error('[database-worker.js] Error reading cached models:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Close the database connection
 * @param {object} db - The database instance
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function closeDatabase(db) {
  if (db) {
    try {
      await dbClose(db);
      console.log('[database-worker.js] Database connection closed.');
      return { success: true };
    } catch (error) {
      console.error('[database-worker.js] Error closing database:', error);
      return { success: false, error: error.message };
    }
  }
  return { success: true };
}

/**
 * Adds a new media directory path to the database.
 * @param {object} db - The database instance
 * @param {string} directoryPath - The absolute path of the directory to add.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function addMediaDirectory(db, directoryPath) {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }
  try {
    const sql = `
      INSERT INTO media_directories (path, is_active)
      VALUES (?, 1)
      ON CONFLICT(path) DO UPDATE SET is_active = 1;
    `;
    await dbRun(db, sql, [directoryPath]);
    console.log(
      `[database-worker.js] Ensured media directory is present and active: ${directoryPath}`,
    );
    return { success: true };
  } catch (error) {
    console.error(
      `[database-worker.js] Error adding media directory ${directoryPath}:`,
      error,
    );
    return { success: false, error: error.message };
  }
}

/**
 * Retrieves all media directory paths from the database.
 * @param {object} db - The database instance
 * @returns {Promise<{success: boolean, data?: {path: string, isActive: boolean}[], error?: string}>}
 */
export async function getMediaDirectories(db) {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }

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
    console.error(
      '[database-worker.js] Error fetching media directories:',
      error,
    );
    return { success: false, error: error.message };
  }
}

/**
 * Removes a media directory path from the database.
 * @param {object} db - The database instance
 * @param {string} directoryPath - The absolute path of the directory to remove.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function removeMediaDirectory(db, directoryPath) {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }
  try {
    await dbRun(db, 'DELETE FROM media_directories WHERE path = ?', [
      directoryPath,
    ]);
    console.log(
      `[database-worker.js] Removed media directory: ${directoryPath}`,
    );
    return { success: true };
  } catch (error) {
    console.error(
      `[database-worker.js] Error removing media directory ${directoryPath}:`,
      error,
    );
    return { success: false, error: error.message };
  }
}

/**
 * Updates the active state of a media directory.
 * @param {object} db - The database instance
 * @param {string} directoryPath - The path of the directory to update.
 * @param {boolean} isActive - The new active state.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function setDirectoryActiveState(db, directoryPath, isActive) {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }
  try {
    await dbRun(
      db,
      'UPDATE media_directories SET is_active = ? WHERE path = ?',
      [isActive ? 1 : 0, directoryPath],
    );
    console.log(
      `[database-worker.js] Set directory ${directoryPath} active state to ${isActive}`,
    );
    return { success: true };
  } catch (error) {
    console.error(
      `[database-worker.js] Error updating active state for ${directoryPath}:`,
      error,
    );
    return { success: false, error: error.message };
  }
}
