/**
 * @file Database Worker Thread - Handles all better-sqlite3 operations
 * This worker runs in a separate thread to avoid blocking the main process.
 * It receives messages from the main thread to perform database operations
 * and sends results back via the worker messaging API.
 */

const { parentPort, workerData } = require('worker_threads');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

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
 * Initialize the database connection in the worker thread
 */
function initDatabase(dbPath) {
  try {
    if (db) {
      db.close();
      console.log('[database-worker.js] Closed existing DB connection before re-init.');
    }

    db = new Database(dbPath);
    
    // Create tables
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
function recordMediaView(filePath) {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }

  const fileId = generateFileId(filePath);
  const now = new Date().toISOString();
  
  try {
    const stmt_insert = db.prepare(
      `INSERT OR IGNORE INTO media_views (file_path_hash, file_path, view_count, last_viewed) VALUES (?, ?, 0, ?)`
    );
    const stmt_update = db.prepare(
      `UPDATE media_views SET view_count = view_count + 1, last_viewed = ? WHERE file_path_hash = ?`
    );
    
    db.transaction(() => {
      stmt_insert.run(fileId, filePath, now);
      stmt_update.run(now, fileId);
    })();
    
    return { success: true };
  } catch (error) {
    console.error(`[database-worker.js] Error recording view for ${filePath}:`, error);
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

  try {
    const viewCountsMap = {};
    const placeholders = filePaths.map(() => '?').join(',');
    const fileIds = filePaths.map(generateFileId);
    
    const stmt = db.prepare(
      `SELECT file_path_hash, view_count FROM media_views WHERE file_path_hash IN (${placeholders})`
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

    return { success: true, data: viewCountsMap };
  } catch (error) {
    console.error('[database-worker.js] Error fetching view counts:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Cache models in the database
 */
function cacheModels(cacheKey, models) {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }

  try {
    db.prepare(
      `INSERT OR REPLACE INTO app_cache (cache_key, cache_value, last_updated) VALUES (?, ?, ?)`
    ).run(cacheKey, JSON.stringify(models), new Date().toISOString());
    
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

  try {
    const row = db.prepare(
      `SELECT cache_value FROM app_cache WHERE cache_key = ?`
    ).get(cacheKey);
    
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
 */
function closeDatabase() {
  if (db) {
    try {
      db.close();
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

// Message handler - receives commands from main thread
parentPort.on('message', (message) => {
  const { id, type, payload } = message;

  let result;
  
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
      
    case 'cacheModels':
      result = cacheModels(payload.cacheKey, payload.models);
      break;
      
    case 'getCachedModels':
      result = getCachedModels(payload.cacheKey);
      break;
      
    case 'close':
      result = closeDatabase();
      break;
      
    default:
      result = { success: false, error: `Unknown message type: ${type}` };
  }

  // Send result back to main thread
  parentPort.postMessage({ id, result });
});

console.log('[database-worker.js] Worker thread started and ready.');
