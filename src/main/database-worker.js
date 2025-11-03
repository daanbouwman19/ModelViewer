/**
 * @file Database Worker Thread - Handles all sqlite3 operations
 * This worker runs in a separate thread to avoid blocking the main process.
 * It receives messages from the main thread to perform database operations
 * and sends results back via the worker messaging API.
 */

const { parentPort } = require('worker_threads');
const crypto = require('crypto');
const sqlite3 = require('sqlite3');

let db = null;

/**
 * Generates a unique MD5 hash for a given file path.
 * @param {string} filePath - The path to the file.
 * @returns {string} The MD5 hash of the file path.
 */
function generateFileId(filePath) {
  return crypto.createHash('md5').update(filePath).digest('hex');
}
/**
 * Promisifies the db.run method.
 * @param {string} sql - The SQL query to run.
 * @param {Array<any>} params - The parameters for the SQL query.
 * @returns {Promise<void>}
 */
function dbRun(sql, params = []) {
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
 * Initialize the database connection in the worker thread
 */
async function initDatabase(dbPath) {
  try {
    if (db) {
      await new Promise((resolve, reject) => {
        db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      console.log(
        '[database-worker.js] Closed existing DB connection before re-init.',
      );
    }

    db = new sqlite3.Database(dbPath);

    // Create tables
    await dbRun(
      `CREATE TABLE IF NOT EXISTS media_views (
      file_path_hash TEXT PRIMARY KEY,
      file_path TEXT UNIQUE,
      view_count INTEGER DEFAULT 0,
      last_viewed TEXT
    )`,
    );

    await dbRun(
      `CREATE TABLE IF NOT EXISTS app_cache (
      cache_key TEXT PRIMARY KEY,
      cache_value TEXT,
      last_updated TEXT
    )`,
    );

    await dbRun(
      `CREATE TABLE IF NOT EXISTS media_directories (
      path TEXT PRIMARY KEY,
      is_active INTEGER DEFAULT 1
    )`,
    );

    console.log('[database-worker.js] SQLite database initialized at:', dbPath);
    return { success: true };
  } catch (error) {
    console.error('[database-worker.js] Failed to initialize database:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Record a view for a media file
 */
async function recordMediaView(filePath) {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }

  const fileId = generateFileId(filePath);
  const now = new Date().toISOString();

  try {
    await dbRun('BEGIN TRANSACTION');
    await dbRun(
      `INSERT OR IGNORE INTO media_views (file_path_hash, file_path, view_count, last_viewed) VALUES (?, ?, 0, ?)`,
      [fileId, filePath, now],
    );
    await dbRun(
      `UPDATE media_views SET view_count = view_count + 1, last_viewed = ? WHERE file_path_hash = ?`,
      [now, fileId],
    );
    await dbRun('COMMIT');

    return { success: true };
  } catch (error) {
    await dbRun('ROLLBACK');
    console.error(
      `[database-worker.js] Error recording view for ${filePath}:`,
      error,
    );
    return { success: false, error: error.message };
  }
}

/**
 * Get view counts for multiple file paths
 */
function getMediaViewCounts(filePaths) {
  if (!db || !filePaths || filePaths.length === 0) {
    return { success: true, data: {} };
  }

  return new Promise((resolve) => {
    const viewCountsMap = {};
    const placeholders = filePaths.map(() => '?').join(',');
    const fileIds = filePaths.map(generateFileId);

    const sql = `SELECT file_path_hash, view_count FROM media_views WHERE file_path_hash IN (${placeholders})`;

    db.all(sql, fileIds, (err, rows) => {
      if (err) {
        console.error('[database-worker.js] Error fetching view counts:', err);
        resolve({ success: false, error: err.message });
        return;
      }

      const countsByHash = {};
      rows.forEach((row) => {
        countsByHash[row.file_path_hash] = row.view_count;
      });

      filePaths.forEach((filePath) => {
        const fileId = generateFileId(filePath);
        viewCountsMap[filePath] = countsByHash[fileId] || 0;
      });

      resolve({ success: true, data: viewCountsMap });
    });
  });
}

/**
 * Cache models in the database
 */
async function cacheModels(cacheKey, models) {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }

  try {
    await dbRun(
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
 */
function getCachedModels(cacheKey) {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }
  return new Promise((resolve) => {
    const sql = `SELECT cache_value FROM app_cache WHERE cache_key = ?`;
    db.get(sql, [cacheKey], (err, row) => {
      if (err) {
        console.error('[database-worker.js] Error reading cached models:', err);
        resolve({ success: false, error: err.message });
        return;
      }
      if (row && row.cache_value) {
        console.log('[database-worker.js] Loaded models from cache.');
        resolve({ success: true, data: JSON.parse(row.cache_value) });
      } else {
        console.log('[database-worker.js] No cached models found.');
        resolve({ success: true, data: null });
      }
    });
  });
}

/**
 * Close the database connection
 */
async function closeDatabase() {
  if (db) {
    try {
      await new Promise((resolve, reject) => {
        db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      console.log('[database-worker.js] Database connection closed.');
      db = null;
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
 * @param {string} directoryPath - The absolute path of the directory to add.
 * @returns {{success: boolean, error?: string}}
 */
async function addMediaDirectory(directoryPath) {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }
  try {
    await dbRun('INSERT OR IGNORE INTO media_directories (path) VALUES (?)', [
      directoryPath,
    ]);
    console.log(`[database-worker.js] Added media directory: ${directoryPath}`);
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
 * @returns {{success: boolean, data?: {path: string, isActive: boolean}[], error?: string}}
 */
function getMediaDirectories() {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }
  return new Promise((resolve) => {
    db.all('SELECT path, is_active FROM media_directories', (err, rows) => {
      if (err) {
        console.error(
          '[database-worker.js] Error fetching media directories:',
          err,
        );
        resolve({ success: false, error: err.message });
        return;
      }
      const directories = rows.map((row) => ({
        path: row.path,
        isActive: !!row.is_active,
      }));
      resolve({ success: true, data: directories });
    });
  });
}

/**
 * Removes a media directory path from the database.
 * @param {string} directoryPath - The absolute path of the directory to remove.
 * @returns {{success: boolean, error?: string}}
 */
async function removeMediaDirectory(directoryPath) {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }
  try {
    await dbRun('DELETE FROM media_directories WHERE path = ?', [
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
 * @param {string} directoryPath - The path of the directory to update.
 * @param {boolean} isActive - The new active state.
 * @returns {{success: boolean, error?: string}}
 */
async function setDirectoryActiveState(directoryPath, isActive) {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }
  try {
    await dbRun('UPDATE media_directories SET is_active = ? WHERE path = ?', [
      isActive ? 1 : 0,
      directoryPath,
    ]);
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

// Message handler - receives commands from main thread
parentPort.on('message', async (message) => {
  const { id, type, payload } = message;

  let result;

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

  // Send result back to main thread
  parentPort.postMessage({ id, result });
});

console.log('[database-worker.js] Worker thread started and ready.');
