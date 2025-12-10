import { parentPort } from "worker_threads";
import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs/promises";
let db = null;
const statements = {};
async function generateFileId(filePath) {
  try {
    const stats = await fs.stat(filePath);
    const uniqueString = `${stats.size}-${stats.mtime.getTime()}`;
    return crypto.createHash("md5").update(uniqueString).digest("hex");
  } catch (error) {
    console.error(`[worker] Error generating file ID for ${filePath}:`, error);
    return crypto.createHash("md5").update(filePath).digest("hex");
  }
}
function initDatabase(dbPath) {
  try {
    if (db) {
      db.close();
      console.log("[worker] Closed existing DB connection before re-init.");
    }
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.prepare(
      `CREATE TABLE IF NOT EXISTS media_views (
        file_path_hash TEXT PRIMARY KEY,
        file_path TEXT UNIQUE,
        view_count INTEGER DEFAULT 0,
        last_viewed TEXT
      )`
    ).run();
    db.prepare(
      `CREATE TABLE IF NOT EXISTS app_cache (
        cache_key TEXT PRIMARY KEY,
        cache_value TEXT,
        last_updated TEXT
      )`
    ).run();
    db.prepare(
      `CREATE TABLE IF NOT EXISTS media_directories (
        path TEXT PRIMARY KEY,
        is_active INTEGER DEFAULT 1
      )`
    ).run();
    statements.insertMediaView = db.prepare(
      `INSERT OR IGNORE INTO media_views (file_path_hash, file_path, view_count, last_viewed) VALUES (?, ?, 0, ?)`
    );
    statements.updateMediaView = db.prepare(
      `UPDATE media_views SET view_count = view_count + 1, last_viewed = ? WHERE file_path_hash = ?`
    );
    statements.getMediaView = db.prepare(
      `SELECT file_path_hash, view_count FROM media_views WHERE file_path_hash = ?`
    );
    statements.cacheAlbum = db.prepare(
      `INSERT OR REPLACE INTO app_cache (cache_key, cache_value, last_updated) VALUES (?, ?, ?)`
    );
    statements.getCachedAlbum = db.prepare(
      `SELECT cache_value FROM app_cache WHERE cache_key = ?`
    );
    statements.addMediaDirectory = db.prepare(`
      INSERT INTO media_directories (path, is_active)
      VALUES (?, 1)
      ON CONFLICT(path) DO UPDATE SET is_active = 1;
    `);
    statements.getMediaDirectories = db.prepare(
      "SELECT path, is_active FROM media_directories"
    );
    statements.removeMediaDirectory = db.prepare(
      "DELETE FROM media_directories WHERE path = ?"
    );
    statements.setDirectoryActiveState = db.prepare(
      "UPDATE media_directories SET is_active = ? WHERE path = ?"
    );
    console.log("[worker] SQLite database initialized at:", dbPath);
    return { success: true };
  } catch (error) {
    console.error("[worker] Failed to initialize database:", error);
    db = null;
    return { success: false, error: error.message };
  }
}
async function recordMediaView(filePath) {
  if (!db) return { success: false, error: "Database not initialized" };
  try {
    const fileId = await generateFileId(filePath);
    const now = (/* @__PURE__ */ new Date()).toISOString();
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
async function getMediaViewCounts(filePaths) {
  if (!db) return { success: false, error: "Database not initialized" };
  if (!filePaths || filePaths.length === 0) {
    return { success: true, data: {} };
  }
  try {
    const viewCountsMap = {};
    const pathIdMap = /* @__PURE__ */ new Map();
    for (const filePath of filePaths) {
      const fileId = await generateFileId(filePath);
      pathIdMap.set(filePath, fileId);
    }
    const transaction = db.transaction((paths) => {
      paths.forEach((filePath) => {
        const fileId = pathIdMap.get(filePath);
        if (fileId) {
          const row = statements.getMediaView.get(fileId);
          viewCountsMap[filePath] = row ? row.view_count : 0;
        }
      });
    });
    transaction(filePaths);
    return { success: true, data: viewCountsMap };
  } catch (error) {
    console.error("[worker] Error fetching view counts:", error);
    return { success: false, error: error.message };
  }
}
function cacheAlbums(cacheKey, albums) {
  if (!db) return { success: false, error: "Database not initialized" };
  try {
    statements.cacheAlbum.run(
      cacheKey,
      JSON.stringify(albums),
      (/* @__PURE__ */ new Date()).toISOString()
    );
    return { success: true };
  } catch (error) {
    console.error("[worker] Error caching albums:", error);
    return { success: false, error: error.message };
  }
}
function getCachedAlbums(cacheKey) {
  if (!db) return { success: false, error: "Database not initialized" };
  try {
    const row = statements.getCachedAlbum.get(cacheKey);
    const data = row && row.cache_value ? JSON.parse(row.cache_value) : null;
    return { success: true, data };
  } catch (error) {
    console.error("[worker] Error reading cached albums:", error);
    return { success: false, error: error.message };
  }
}
function closeDatabase() {
  if (!db) return { success: true };
  try {
    db.close();
    db = null;
    for (const key in statements) {
      delete statements[key];
    }
    console.log("[worker] Database connection closed.");
    return { success: true };
  } catch (error) {
    console.error("[worker] Error closing database:", error);
    return { success: false, error: error.message };
  }
}
function addMediaDirectory(directoryPath) {
  if (!db) return { success: false, error: "Database not initialized" };
  try {
    statements.addMediaDirectory.run(directoryPath);
    return { success: true };
  } catch (error) {
    console.error(
      `[worker] Error adding media directory ${directoryPath}:`,
      error
    );
    return { success: false, error: error.message };
  }
}
function getMediaDirectories() {
  if (!db) return { success: false, error: "Database not initialized" };
  try {
    const rows = statements.getMediaDirectories.all();
    const directories = rows.map((row) => ({
      path: row.path,
      isActive: !!row.is_active
    }));
    return { success: true, data: directories };
  } catch (error) {
    console.error("[worker] Error fetching media directories:", error);
    return { success: false, error: error.message };
  }
}
function removeMediaDirectory(directoryPath) {
  if (!db) return { success: false, error: "Database not initialized" };
  try {
    statements.removeMediaDirectory.run(directoryPath);
    return { success: true };
  } catch (error) {
    console.error(
      `[worker] Error removing media directory ${directoryPath}:`,
      error
    );
    return { success: false, error: error.message };
  }
}
function setDirectoryActiveState(directoryPath, isActive) {
  if (!db) return { success: false, error: "Database not initialized" };
  try {
    statements.setDirectoryActiveState.run(isActive ? 1 : 0, directoryPath);
    return { success: true };
  } catch (error) {
    console.error(
      `[worker] Error updating active state for ${directoryPath}:`,
      error
    );
    return { success: false, error: error.message };
  }
}
if (parentPort) {
  parentPort.on("message", async (message) => {
    const { id, type, payload } = message;
    let result;
    try {
      switch (type) {
        case "init":
          result = initDatabase(payload.dbPath);
          break;
        case "recordMediaView":
          result = await recordMediaView(payload.filePath);
          break;
        case "getMediaViewCounts":
          result = await getMediaViewCounts(payload.filePaths);
          break;
        case "cacheAlbums":
          result = cacheAlbums(payload.cacheKey, payload.albums);
          break;
        case "getCachedAlbums":
          result = getCachedAlbums(payload.cacheKey);
          break;
        case "close":
          result = closeDatabase();
          break;
        case "addMediaDirectory":
          result = addMediaDirectory(payload.directoryPath);
          break;
        case "getMediaDirectories":
          result = getMediaDirectories();
          break;
        case "removeMediaDirectory":
          result = removeMediaDirectory(payload.directoryPath);
          break;
        case "setDirectoryActiveState":
          result = setDirectoryActiveState(
            payload.directoryPath,
            payload.isActive
          );
          break;
        default:
          result = { success: false, error: `Unknown message type: ${type}` };
      }
    } catch (error) {
      console.error(
        `[worker] Error processing message id=${id}, type=${type}:`,
        error
      );
      result = { success: false, error: error.message };
    }
    parentPort.postMessage({ id, result });
  });
  console.log("[database-worker.js] Worker thread started and ready.");
  parentPort.postMessage({ type: "ready" });
}
