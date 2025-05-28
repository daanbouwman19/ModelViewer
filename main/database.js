const path = require('path');
const crypto = require('crypto');
const { app } = require('electron'); // Required for app.getPath('userData')
const Database = require('better-sqlite3');
const { FILE_INDEX_CACHE_KEY } = require('./constants.js'); // Import from constants

let db;

function generateFileId(filePath) {
    return crypto.createHash('md5').update(filePath).digest('hex');
}

function initDatabase() {
    if (db) {
        try {
            db.close();
            if (process.env.NODE_ENV !== 'test') {
                console.log('[database.js] Closed existing DB connection before re-init.');
            }
        } catch (closeError) {
            if (process.env.NODE_ENV !== 'test') {
                console.error('[database.js] Error closing existing DB connection:', closeError);
            }
            // Depending on the error, you might still want to proceed or throw
        }
        db = null; // Nullify the reference in any case after attempting to close
    }

    try {
        const dbPath = path.join(app.getPath('userData'), 'media_slideshow_stats.sqlite');
        db = new Database(dbPath); // Create new instance
        db.exec(`CREATE TABLE IF NOT EXISTS media_views (file_path_hash TEXT PRIMARY KEY, file_path TEXT UNIQUE, view_count INTEGER DEFAULT 0, last_viewed TEXT);`);
        db.exec(`CREATE TABLE IF NOT EXISTS app_cache (cache_key TEXT PRIMARY KEY, cache_value TEXT, last_updated TEXT);`);
        if (process.env.NODE_ENV !== 'test') {
            console.log('[database.js] SQLite database initialized.');
        }
    } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
            console.error('[database.js] CRITICAL ERROR: Failed to initialize SQLite database.', error);
        }
        db = null; 
        throw error; 
    }
    return db;
}

function getDb() {
    if (!db) {
        if (process.env.NODE_ENV !== 'test') {
            console.warn('[database.js] DB accessed before explicit initialization. Attempting to initialize...');
        }
        initDatabase(); 
        if (!db) {
            if (process.env.NODE_ENV !== 'test') {
                console.error('[database.js] CRITICAL: DB is not available after attempted init.');
            }
             // Option: throw new Error("Database is not available and initialization failed.");
             return null;
        }
    }
    return db;
}

async function recordMediaView(filePath) {
    const currentDb = getDb();
    if (!currentDb) {
        if (process.env.NODE_ENV !== 'test') {
            console.warn('[database.js] Database not available for record-media-view');
        }
        return;
    }
    const fileId = generateFileId(filePath);
    try {
        const stmt_insert = currentDb.prepare(`INSERT OR IGNORE INTO media_views (file_path_hash, file_path, view_count, last_viewed) VALUES (?, ?, 0, ?)`);
        const stmt_update = currentDb.prepare(`UPDATE media_views SET view_count = view_count + 1, last_viewed = ? WHERE file_path_hash = ?`);
        currentDb.transaction(() => {
            stmt_insert.run(fileId, filePath, new Date().toISOString());
            stmt_update.run(new Date().toISOString(), fileId);
        })();
    } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
            console.error(`[database.js] Error recording view for ${filePath} (ID: ${fileId}) in SQLite:`, error);
        }
    }
}

async function getMediaViewCounts(filePaths) {
    const currentDb = getDb();
    if (!currentDb || !filePaths || filePaths.length === 0) return {};
    
    const viewCountsMap = {};
    try {
        const placeholders = filePaths.map(() => '?').join(',');
        const fileIds = filePaths.map(generateFileId);
        const stmt = currentDb.prepare(`SELECT file_path_hash, view_count FROM media_views WHERE file_path_hash IN (${placeholders})`);
        const rows = stmt.all(fileIds);
        const countsByHash = {};
        rows.forEach(row => { countsByHash[row.file_path_hash] = row.view_count; });
        filePaths.forEach(filePath => {
            const fileId = generateFileId(filePath);
            viewCountsMap[filePath] = countsByHash[fileId] || 0;
        });
    } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
            console.error('[database.js] Error fetching view counts from SQLite:', error);
        }
    }
    return viewCountsMap;
}

async function cacheModels(models) {
    const currentDb = getDb();
    if (!currentDb) {
        if (process.env.NODE_ENV !== 'test') {
            console.warn('[database.js] Database not available for cacheModels');
        }
        return;
    }
    try {
        currentDb.prepare(`INSERT OR REPLACE INTO app_cache (cache_key, cache_value, last_updated) VALUES (?, ?, ?)`).run(FILE_INDEX_CACHE_KEY, JSON.stringify(models), new Date().toISOString());
        if (process.env.NODE_ENV !== 'test') {
            console.log('[database.js] File index successfully scanned and cached in SQLite.');
        }
    } catch (e) {
        if (process.env.NODE_ENV !== 'test') {
            console.error('[database.js] Error caching file index to SQLite:', e);
        }
    }
}

async function getCachedModels() {
    const currentDb = getDb();
    if (!currentDb) {
        if (process.env.NODE_ENV !== 'test') {
            console.warn('[database.js] Database not available for getCachedModels');
        }
        return null;
    }
    try {
        const row = currentDb.prepare(`SELECT cache_value FROM app_cache WHERE cache_key = ?`).get(FILE_INDEX_CACHE_KEY);
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
            console.error('[database.js] Error reading file index from SQLite cache.', e);
        }
    }
    return null;
}

module.exports = {
    initDatabase,
    recordMediaView,
    getMediaViewCounts,
    cacheModels,
    getCachedModels,
    generateFileId 
};
