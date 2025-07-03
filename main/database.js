const path = require('path');
const crypto = require('crypto');
const { app } = require('electron'); // Required for app.getPath('userData')
const Database = require('better-sqlite3');
const { FILE_INDEX_CACHE_KEY } = require('./constants.js');

let db;

/**
 * Generates a unique MD5 hash for a given file path.
 * @param {string} filePath - The path to the file.
 * @returns {string} The MD5 hash of the file path.
 */
function generateFileId(filePath) {
  return crypto.createHash('md5').update(filePath).digest('hex');
}

/**
 * Initializes the SQLite database.
 * Creates tables for media views and application cache if they don't exist.
 * Closes any existing connection before re-initializing.
 * @returns {Database.Database} The database instance.
 * @throws {Error} If database initialization fails.
 */
function initDatabase() {
  if (db) {
    try {
      db.close();
      // Logging closure only if not in test environment to reduce test noise
      if (process.env.NODE_ENV !== 'test') {
        console.log(
          '[database.js] Closed existing DB connection before re-init.',
        );
      }
    } catch (closeError) {
      if (process.env.NODE_ENV !== 'test') {
        console.error(
          '[database.js] Error closing existing DB connection:',
          closeError,
        );
      }
    }
    db = null;
  }

  try {
    const dbPath = path.join(
      app.getPath('userData'),
      'media_slideshow_stats.sqlite',
    );
    db = new Database(dbPath);
    db.exec(`CREATE TABLE IF NOT EXISTS media_views (
                    file_path_hash TEXT PRIMARY KEY,
                    file_path TEXT UNIQUE,
                    view_count INTEGER DEFAULT 0,
                    last_viewed TEXT
                 );`);
    db.exec(`CREATE TABLE IF NOT EXISTS app_cache (
                    cache_key TEXT PRIMARY KEY,
                    cache_value TEXT,
                    last_updated TEXT
                 );`);
    if (process.env.NODE_ENV !== 'test') {
      console.log('[database.js] SQLite database initialized at:', dbPath);
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(
        '[database.js] CRITICAL ERROR: Failed to initialize SQLite database.',
        error,
      );
    }
    db = null;
    throw error;
  }
  return db;
}

/**
 * Gets the current database instance. Initializes it if not already done.
 * @returns {Database.Database | null} The database instance or null if initialization fails.
 */
function getDb() {
  if (!db || !db.open) {
    // Check if db is null or closed
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[database.js] DB accessed before explicit initialization or after being closed. Attempting to initialize...',
      );
    }
    try {
      initDatabase();
    } catch (initError) {
      // Error already logged by initDatabase
      return null;
    }
    if (!db && process.env.NODE_ENV !== 'test') {
      console.error(
        '[database.js] CRITICAL: DB is not available after attempted init.',
      );
    }
  }
  return db;
}

/**
 * Records a view for a media file. Increments its view count and updates the last viewed timestamp.
 * @param {string} filePath - The path to the media file.
 */
async function recordMediaView(filePath) {
  const currentDb = getDb();
  if (!currentDb) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[database.js] Database not available for recordMediaView for path:',
        filePath,
      );
    }
    return;
  }
  const fileId = generateFileId(filePath);
  const now = new Date().toISOString();
  try {
    const stmt_insert = currentDb.prepare(
      `INSERT OR IGNORE INTO media_views (file_path_hash, file_path, view_count, last_viewed) VALUES (?, ?, 0, ?)`,
    );
    const stmt_update = currentDb.prepare(
      `UPDATE media_views SET view_count = view_count + 1, last_viewed = ? WHERE file_path_hash = ?`,
    );
    currentDb.transaction(() => {
      stmt_insert.run(fileId, filePath, now);
      stmt_update.run(now, fileId);
    })();
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(
        `[database.js] Error recording view for ${filePath} (ID: ${fileId}) in SQLite:`,
        error,
      );
    }
  }
}

/**
 * Retrieves view counts for a list of media files.
 * @param {string[]} filePaths - An array of file paths.
 * @returns {Promise<Object<string, number>>} A map of file paths to their view counts.
 */
async function getMediaViewCounts(filePaths) {
  const currentDb = getDb();
  if (!currentDb || !filePaths || filePaths.length === 0) {
    return {};
  }

  const viewCountsMap = {};
  try {
    // Ensure filePaths is an array and not empty before proceeding
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return {};
    }
    const placeholders = filePaths.map(() => '?').join(',');
    const fileIds = filePaths.map(generateFileId);
    const stmt = currentDb.prepare(
      `SELECT file_path_hash, view_count FROM media_views WHERE file_path_hash IN (${placeholders})`,
    );
    const rows = stmt.all(fileIds);

    const countsByHash = {};
    rows.forEach((row) => {
      countsByHash[row.file_path_hash] = row.view_count;
    });

    filePaths.forEach((filePath) => {
      const fileId = generateFileId(filePath);
      viewCountsMap[filePath] = countsByHash[fileId] || 0;
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(
        '[database.js] Error fetching view counts from SQLite:',
        error,
      );
    }
  }
  return viewCountsMap;
}

/**
 * Caches the list of models (file index) into the database.
 * @param {Array<Object>} models - The array of model objects to cache.
 */
async function cacheModels(models) {
  const currentDb = getDb();
  if (!currentDb) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[database.js] Database not available for cacheModels.');
    }
    return;
  }
  try {
    currentDb
      .prepare(
        `INSERT OR REPLACE INTO app_cache (cache_key, cache_value, last_updated) VALUES (?, ?, ?)`,
      )
      .run(
        FILE_INDEX_CACHE_KEY,
        JSON.stringify(models),
        new Date().toISOString(),
      );
    if (process.env.NODE_ENV !== 'test') {
      console.log(
        '[database.js] File index successfully scanned and cached in SQLite.',
      );
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[database.js] Error caching file index to SQLite:', e);
    }
  }
}

/**
 * Retrieves the cached list of models from the database.
 * @returns {Promise<Array<Object> | null>} The cached models or null if not found or error.
 */
async function getCachedModels() {
  const currentDb = getDb();
  if (!currentDb) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[database.js] Database not available for getCachedModels.');
    }
    return null;
  }
  try {
    const row = currentDb
      .prepare(`SELECT cache_value FROM app_cache WHERE cache_key = ?`)
      .get(FILE_INDEX_CACHE_KEY);
    if (row && row.cache_value) {
      if (process.env.NODE_ENV !== 'test') {
        console.log('[database.js] Loaded file index from SQLite cache.');
      }
      return JSON.parse(row.cache_value);
    }
    if (process.env.NODE_ENV !== 'test') {
      console.log('[database.js] No file index cache found in SQLite.');
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(
        '[database.js] Error reading file index from SQLite cache.',
        e,
      );
    }
  }
  return null;
}

/**
 * Closes the current database connection if it's open.
 */
function closeDatabase() {
  if (db) {
    try {
      db.close();
      // Logging closure only if not in test environment to reduce test noise
      if (process.env.NODE_ENV !== 'test') {
        console.log('[database.js] Database connection closed.');
      }
    } catch (closeError) {
      if (process.env.NODE_ENV !== 'test') {
        console.error('[database.js] Error closing DB connection:', closeError);
      }
    } finally {
      db = null; // Important to reset the db variable
    }
  }
}

module.exports = {
  initDatabase,
  recordMediaView,
  getMediaViewCounts,
  cacheModels,
  getCachedModels,
  generateFileId, // Exported for testing purposes
  closeDatabase, // Export the new function
  getDb, // Export for testing and internal use verification
};
