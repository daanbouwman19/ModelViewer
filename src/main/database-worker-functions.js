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
 * @param {import('sqlite3').Database} db - The database instance.
 * @param {string} sql - The SQL query to run.
 * @param {Array<any>} [params=[]] - The parameters for the SQL query.
 * @returns {Promise<void>} A promise that resolves when the query is complete.
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
 * @param {import('sqlite3').Database} db - The database instance.
 * @param {string} sql - The SQL query to run.
 * @param {Array<any>} [params=[]] - The parameters for the SQL query.
 * @returns {Promise<Array<any>>} A promise that resolves with an array of rows.
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
 * @param {import('sqlite3').Database} db - The database instance.
 * @param {string} sql - The SQL query to run.
 * @param {Array<any>} [params=[]] - The parameters for the SQL query.
 * @returns {Promise<any>} A promise that resolves with a single row.
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
 * @param {import('sqlite3').Database} db - The database instance.
 * @returns {Promise<void>} A promise that resolves when the database is closed.
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
 * Initializes the database connection and creates tables if they don't exist.
 * @param {import('sqlite3').Database} Database - The sqlite3.Database constructor.
 * @param {string} dbPath - Path to the database file.
 * @param {import('sqlite3').Database|null} [existingDb=null] - An existing database connection to close before creating a new one.
 * @returns {Promise<{db: import('sqlite3').Database|null, success: boolean, error?: string}>} An object containing the new database instance and success status.
 */
export async function initDatabase(Database, dbPath, existingDb = null) {
  try {
    if (existingDb) {
      await dbClose(existingDb);
      console.log(
        '[db-functions] Closed existing DB connection before re-init.',
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

    console.log('[db-functions] SQLite database initialized at:', dbPath);
    return { db, success: true };
  } catch (error) {
    console.error('[db-functions] Failed to initialize database:', error);
    return { db: null, success: false, error: error.message };
  }
}

/**
 * Records a view for a media file, incrementing its view count.
 * @param {import('sqlite3').Database} db - The database instance.
 * @param {string} filePath - The file path to record a view for.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating the success of the operation.
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
    await dbRun(db, 'ROLLBACK').catch(console.error);
    console.error(
      `[db-functions] Error recording view for ${filePath}:`,
      error,
    );
    return { success: false, error: error.message };
  }
}

/**
 * Gets view counts for multiple file paths in batches to avoid SQLite's SQLITE_MAX_VARIABLE_NUMBER limit.
 * @param {import('sqlite3').Database} db - The database instance.
 * @param {string[]} filePaths - Array of file paths.
 * @returns {Promise<{success: boolean, data?: {[filePath: string]: number}, error?: string}>} An object containing a map of file paths to view counts.
 */
export async function getMediaViewCounts(db, filePaths) {
  if (!db || !filePaths || filePaths.length === 0) {
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
    console.error('[db-functions] Error fetching view counts:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Caches a key-value pair (e.g., models) in the database.
 * @param {import('sqlite3').Database} db - The database instance.
 * @param {string} cacheKey - The key for the cache entry.
 * @param {any} models - The data to be cached (will be JSON stringified).
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating the success of the operation.
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

    console.log('[db-functions] Models cached successfully.');
    return { success: true };
  } catch (error) {
    console.error('[db-functions] Error caching models:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Gets cached data from the database.
 * @param {import('sqlite3').Database} db - The database instance.
 * @param {string} cacheKey - The key of the cache entry to retrieve.
 * @returns {Promise<{success: boolean, data?: any, error?: string}>} An object containing the parsed cached data, or null if not found.
 */
export async function getCachedModels(db, cacheKey) {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }

  try {
    const sql = `SELECT cache_value FROM app_cache WHERE cache_key = ?`;
    const row = await dbGet(db, sql, [cacheKey]);

    if (row && row.cache_value) {
      console.log('[db-functions] Loaded models from cache.');
      return { success: true, data: JSON.parse(row.cache_value) };
    }

    console.log('[db-functions] No cached models found.');
    return { success: true, data: null };
  } catch (error) {
    console.error('[db-functions] Error reading cached models:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Closes the database connection.
 * @param {import('sqlite3').Database} db - The database instance to close.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating the success of the operation.
 */
export async function closeDatabase(db) {
  if (db) {
    try {
      await dbClose(db);
      console.log('[db-functions] Database connection closed.');
      return { success: true };
    } catch (error) {
      console.error('[db-functions] Error closing database:', error);
      return { success: false, error: error.message };
    }
  }
  return { success: true };
}

/**
 * Adds a new media directory path to the database or activates it if it exists.
 * @param {import('sqlite3').Database} db - The database instance.
 * @param {string} directoryPath - The absolute path of the directory to add.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating the success of the operation.
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
      `[db-functions] Ensured media directory is present and active: ${directoryPath}`,
    );
    return { success: true };
  } catch (error) {
    console.error(
      `[db-functions] Error adding media directory ${directoryPath}:`,
      error,
    );
    return { success: false, error: error.message };
  }
}

/**
 * Retrieves all media directory paths from the database.
 * @param {import('sqlite3').Database} db - The database instance.
 * @returns {Promise<{success: boolean, data?: {path: string, isActive: boolean}[], error?: string}>} An object containing an array of directory objects.
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
    console.error('[db-functions] Error fetching media directories:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Removes a media directory path from the database.
 * @param {import('sqlite3').Database} db - The database instance.
 * @param {string} directoryPath - The absolute path of the directory to remove.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating the success of the operation.
 */
export async function removeMediaDirectory(db, directoryPath) {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }
  try {
    await dbRun(db, 'DELETE FROM media_directories WHERE path = ?', [
      directoryPath,
    ]);
    console.log(`[db-functions] Removed media directory: ${directoryPath}`);
    return { success: true };
  } catch (error) {
    console.error(
      `[db-functions] Error removing media directory ${directoryPath}:`,
      error,
    );
    return { success: false, error: error.message };
  }
}

/**
 * Updates the active state of a media directory.
 * @param {import('sqlite3').Database} db - The database instance.
 * @param {string} directoryPath - The path of the directory to update.
 * @param {boolean} isActive - The new active state.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating the success of the operation.
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
      `[db-functions] Set directory ${directoryPath} active state to ${isActive}`,
    );
    return { success: true };
  } catch (error) {
    console.error(
      `[db-functions] Error updating active state for ${directoryPath}:`,
      error,
    );
    return { success: false, error: error.message };
  }
}
