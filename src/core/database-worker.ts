/**
 * @file Database Worker Thread - Handles all sqlite3 operations.
 * This worker runs in a separate thread to avoid blocking the main process.
 * It receives messages from the main thread to perform database operations
 * and sends results back via the worker messaging API.
 */

import { parentPort } from 'worker_threads';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

/**
 * The database instance for this worker thread.
 */
let db: Database.Database | null = null;

/**
 * Cache for prepared statements to improve performance of repeated queries.
 * Keys are the statement names (e.g., 'insertMediaView'), and values are the prepared SQLite statements.
 */
const statements: { [key: string]: Database.Statement } = {};

/**
 * Default batch size for SQL operations.
 * 900 is chosen to be safely within SQLite's default limit of 999 parameters.
 */
const SQL_BATCH_SIZE = 900;

// Helper Functions

/**
 * Generates a stable, unique identifier for a file.
 * @param filePath - The path to the file.
 * @returns A unique MD5 hash for the file.
 */
async function generateFileId(filePath: string): Promise<string> {
  try {
    if (!filePath) {
      throw new Error('File path cannot be null or empty');
    }
    if (filePath.startsWith('gdrive://')) {
      return filePath.replace('gdrive://', '');
    }
    const stats = await fs.stat(filePath);
    const uniqueString = `${stats.size}-${stats.mtime.getTime()}`;
    return crypto.createHash('md5').update(uniqueString).digest('hex');
  } catch (error: unknown) {
    // If we can't stat the file (e.g. invalid path), fallback to hashing the path string
    if ((error as { code?: string }).code !== 'ENOENT') {
      console.error(
        `[worker] Error generating file ID for ${filePath}:`,
        error,
      );
    }
    return crypto.createHash('md5').update(filePath).digest('hex');
  }
}

/**
 * Helper to generate file IDs in batches to avoid EMFILE errors.
 * @param filePaths - List of file paths.
 * @returns Map of filePath to fileId.
 */
async function generateFileIdsBatched(
  filePaths: string[],
): Promise<Map<string, string>> {
  const pathIdMap = new Map<string, string>();
  const BATCH_SIZE = 50;

  for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
    const batch = filePaths.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (filePath) => {
        const fileId = await generateFileId(filePath);
        return { filePath, fileId };
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { filePath, fileId } = result.value;
        pathIdMap.set(filePath, fileId);
      }
    }
  }
  return pathIdMap;
}

// Core Worker Functions

/**
 * Represents the result of a worker operation.
 */
interface WorkerResult {
  /** Indicates whether the operation was successful. */
  success: boolean;
  /** The data returned by the operation, if any. */
  data?: unknown;
  /** An error message, if the operation failed. */
  error?: string;
}

/**
 * Initializes the database connection in the worker thread.
 * @param dbPath - The path to the SQLite database file.
 * @returns The result of the initialization.
 */
function initDatabase(dbPath: string): WorkerResult {
  try {
    if (db) {
      db.close();
      console.log('[worker] Closed existing DB connection before re-init.');
    }

    db = new Database(dbPath);
    // Enable WAL mode for better concurrency
    // db.pragma('journal_mode = WAL');

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

    // Check if media_directories exists and has the new schema
    const dirTableInfo = db
      .prepare('PRAGMA table_info(media_directories)')
      .all() as { name: string }[];
    const hasId = dirTableInfo.some((col) => col.name === 'id');
    const tableExists = dirTableInfo.length > 0;

    if (!tableExists) {
      // Create new schema directly
      db.prepare(
        `CREATE TABLE media_directories (
              id TEXT PRIMARY KEY,
              path TEXT UNIQUE,
              type TEXT DEFAULT 'local',
              name TEXT,
              is_active INTEGER DEFAULT 1
            )`,
      ).run();
    } else if (!hasId) {
      // Migration needed
      console.log('[worker] Migrating media_directories table...');
      // 1. Rename old table
      db.prepare(
        'ALTER TABLE media_directories RENAME TO media_directories_old',
      ).run();

      // 2. Create new table
      db.prepare(
        `CREATE TABLE media_directories (
              id TEXT PRIMARY KEY,
              path TEXT UNIQUE,
              type TEXT DEFAULT 'local',
              name TEXT,
              is_active INTEGER DEFAULT 1
            )`,
      ).run();

      // 3. Migrate data
      // For existing rows, we generate a UUID for ID, use 'local' as type, and basename as name.
      const oldRows = db
        .prepare('SELECT path, is_active FROM media_directories_old')
        .all() as { path: string; is_active: number }[];
      const insertStmt = db.prepare(
        'INSERT INTO media_directories (id, path, type, name, is_active) VALUES (?, ?, ?, ?, ?)',
      );

      for (const row of oldRows) {
        const id = crypto.randomUUID();
        const name = path.basename(row.path) || row.path;
        insertStmt.run(id, row.path, 'local', name, row.is_active);
      }

      // 4. Drop old table
      db.prepare('DROP TABLE media_directories_old').run();
      console.log('[worker] Migration complete.');
    }

    db.prepare(
      `CREATE TABLE IF NOT EXISTS media_metadata (
        file_path_hash TEXT PRIMARY KEY,
        file_path TEXT,
        duration REAL,
        size INTEGER,
        created_at TEXT,
        rating INTEGER DEFAULT 0,
        extraction_status TEXT DEFAULT 'pending'
      )`,
    ).run();

    // Migration: Add missing columns to media_metadata if they don't exist
    try {
      const tableInfo = db
        .prepare('PRAGMA table_info(media_metadata)')
        .all() as { name: string }[];

      const columns = new Set(tableInfo.map((col) => col.name));

      const migrations = [
        { name: 'file_path', type: 'TEXT' },
        { name: 'size', type: 'INTEGER' },
        { name: 'created_at', type: 'TEXT' },
        { name: 'rating', type: 'INTEGER DEFAULT 0' },
        { name: 'extraction_status', type: "TEXT DEFAULT 'pending'" },
      ];

      for (const col of migrations) {
        if (!columns.has(col.name)) {
          console.log(
            `[worker] Adding missing column ${col.name} to media_metadata...`,
          );
          db.prepare(
            `ALTER TABLE media_metadata ADD COLUMN ${col.name} ${col.type}`,
          ).run();
        }
      }
    } catch (err) {
      console.error('Error migrating media_metadata table:', err);
    }

    db.prepare(
      `CREATE TABLE IF NOT EXISTS smart_playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        criteria TEXT NOT NULL,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    ).run();

    db.prepare(
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      )`,
    ).run();

    // Prepare statements for reuse
    statements.insertMediaView = db.prepare(
      `INSERT OR IGNORE INTO media_views (file_path_hash, file_path, view_count, last_viewed) VALUES (?, ?, 0, ?)`,
    );
    statements.updateMediaView = db.prepare(
      `UPDATE media_views SET view_count = view_count + 1, last_viewed = ? WHERE file_path_hash = ?`,
    );
    statements.updateMediaViewWithPath = db.prepare(
      `UPDATE media_views SET view_count = view_count + 1, last_viewed = ?, file_path = ? WHERE file_path_hash = ?`,
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
      INSERT INTO media_directories (id, path, type, name, is_active)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(path) DO UPDATE SET is_active = 1;
    `);
    statements.getMediaDirectories = db.prepare(
      'SELECT id, path, type, name, is_active FROM media_directories',
    );
    statements.removeMediaDirectory = db.prepare(
      'DELETE FROM media_directories WHERE path = ?',
    );
    statements.setDirectoryActiveState = db.prepare(
      'UPDATE media_directories SET is_active = ? WHERE path = ?',
    );
    statements.upsertMetadata = db.prepare(
      `INSERT INTO media_metadata (file_path_hash, file_path, duration, size, created_at, rating, extraction_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(file_path_hash) DO UPDATE SET
       file_path = excluded.file_path,
       duration = COALESCE(excluded.duration, media_metadata.duration),
       size = COALESCE(excluded.size, media_metadata.size),
       created_at = COALESCE(excluded.created_at, media_metadata.created_at),
       rating = COALESCE(excluded.rating, media_metadata.rating),
       extraction_status = COALESCE(excluded.extraction_status, media_metadata.extraction_status)`,
    );
    statements.getPendingMetadata = db.prepare(
      `SELECT file_path FROM media_metadata WHERE (extraction_status = 'pending' OR extraction_status IS NULL) AND file_path IS NOT NULL LIMIT 100`,
    );
    statements.updateRating = db.prepare(
      // Only update rating if the row exists, or insert if capable?
      // For now assume metadata row might not exist, so we use upsert with default values for others if needed.
      // Actually simpler: just update rating if exists, if not insert new row with rating.
      `INSERT INTO media_metadata (file_path_hash, rating) VALUES (?, ?)
       ON CONFLICT(file_path_hash) DO UPDATE SET rating = excluded.rating`,
    );
    statements.createSmartPlaylist = db.prepare(
      'INSERT INTO smart_playlists (name, criteria) VALUES (?, ?)',
    );
    statements.getSmartPlaylists = db.prepare(
      'SELECT id, name, criteria, createdAt FROM smart_playlists ORDER BY id DESC',
    );
    statements.getRecentlyPlayed = db.prepare(
      `SELECT
        v.file_path,
        v.file_path_hash,
        v.view_count,
        v.last_viewed,
        m.duration,
        m.size,
        m.rating,
        m.created_at
       FROM media_views v
       LEFT JOIN media_metadata m ON v.file_path_hash = m.file_path_hash
       WHERE v.last_viewed IS NOT NULL
       ORDER BY v.last_viewed DESC
       LIMIT ?`,
    );
    statements.deleteSmartPlaylist = db.prepare(
      'DELETE FROM smart_playlists WHERE id = ?',
    );
    statements.updateSmartPlaylist = db.prepare(
      'UPDATE smart_playlists SET name = ?, criteria = ? WHERE id = ?',
    );
    statements.saveSetting = db.prepare(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
    );
    statements.getSetting = db.prepare(
      'SELECT value FROM settings WHERE key = ?',
    );

    // Optimized batch statements
    const placeholders = Array(SQL_BATCH_SIZE).fill('?').join(',');
    statements.getMediaViewCountsBatch = db.prepare(
      `SELECT file_path, view_count FROM media_views WHERE file_path IN (${placeholders})`,
    );

    console.log('[worker] SQLite database initialized at:', dbPath);
    return { success: true };
  } catch (error: unknown) {
    console.error('[worker] Failed to initialize database:', error);
    db = null; // Ensure db is null on failure
    return { success: false, error: (error as Error).message };
  }
}

interface MetadataPayload {
  filePath: string;
  duration?: number;
  size?: number;
  createdAt?: string; // ISO string
  rating?: number;
  status?: string;
}

/**
 * Upserts metadata for a file.
 */
async function upsertMetadata(payload: MetadataPayload): Promise<WorkerResult> {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    const fileId = await generateFileId(payload.filePath);
    statements.upsertMetadata.run(
      fileId,
      payload.filePath,
      payload.duration === undefined ? null : payload.duration,
      payload.size === undefined ? null : payload.size,
      payload.createdAt === undefined ? null : payload.createdAt,
      payload.rating === undefined ? null : payload.rating,
      payload.status === undefined ? null : payload.status,
    );
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Updates the rating for a file.
 */
async function setRating(
  filePath: string,
  rating: number,
): Promise<WorkerResult> {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    const fileId = await generateFileId(filePath);
    statements.updateRating.run(fileId, rating);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Bulk upserts metadata for multiple files.
 */
async function bulkUpsertMetadata(
  payloads: MetadataPayload[],
): Promise<WorkerResult> {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    const idMap = await generateFileIdsBatched(payloads.map((p) => p.filePath));

    // Map payloads to include fileId, failing if any ID is missing
    const itemsWithIds = payloads.map((p) => {
      const fileId = idMap.get(p.filePath);
      if (!fileId) {
        throw new Error(`Failed to generate ID for path: ${p.filePath}`);
      }
      return { ...p, fileId };
    });

    const transaction = db.transaction((items: typeof itemsWithIds) => {
      for (const item of items) {
        statements.upsertMetadata.run(
          item.fileId,
          item.filePath,
          item.duration === undefined ? null : item.duration,
          item.size === undefined ? null : item.size,
          item.createdAt === undefined ? null : item.createdAt,
          item.rating === undefined ? null : item.rating,
          item.status === undefined ? null : item.status,
        );
      }
    });

    transaction(itemsWithIds);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Retrieves metadata for a list of files.
 */
async function getMetadata(filePaths: string[]): Promise<WorkerResult> {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    if (filePaths.length === 0) {
      return { success: true, data: {} };
    }

    const idMap = await generateFileIdsBatched(filePaths);
    const allFileIds = Array.from(new Set(idMap.values()));

    const metadataMap: { [key: string]: unknown } = {};

    for (let i = 0; i < allFileIds.length; i += SQL_BATCH_SIZE) {
      const batchIds = allFileIds.slice(i, i + SQL_BATCH_SIZE);
      if (batchIds.length === 0) continue;

      const placeholders = batchIds.map(() => '?').join(',');
      const query = `SELECT * FROM media_metadata WHERE file_path_hash IN (${placeholders})`;

      const rows = db.prepare(query).all(...batchIds) as {
        file_path: string;
        [key: string]: unknown;
      }[];

      for (const row of rows) {
        if (row.file_path) {
          metadataMap[row.file_path] = row;
        }
      }
    }

    return { success: true, data: metadataMap };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

// Smart Playlist Functions

/**
 * Creates a new smart playlist.
 */
function createSmartPlaylist(name: string, criteria: string): WorkerResult {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    const result = statements.createSmartPlaylist.run(name, criteria);
    return { success: true, data: { id: result.lastInsertRowid } };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Retrieves all smart playlists.
 */
function getSmartPlaylists(): WorkerResult {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    const playlists = statements.getSmartPlaylists.all();
    return { success: true, data: playlists };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Deletes a smart playlist.
 */
function deleteSmartPlaylist(id: number): WorkerResult {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    statements.deleteSmartPlaylist.run(id);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Updates a smart playlist.
 */
function updateSmartPlaylist(
  id: number,
  name: string,
  criteria: string,
): WorkerResult {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    statements.updateSmartPlaylist.run(name, criteria, id);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Retrieves recently played media items.
 * @param limit - The maximum number of items to return.
 */
function getRecentlyPlayed(limit: number): WorkerResult {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    const rows = statements.getRecentlyPlayed.all(limit);
    return { success: true, data: rows };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Saves a setting (key-value pair) to the database.
 */
function saveSetting(key: string, value: string): WorkerResult {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    statements.saveSetting.run(key, value, new Date().toISOString());
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Retrieves a setting value from the database.
 */
function getSetting(key: string): WorkerResult {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    const row = statements.getSetting.get(key) as { value: string } | undefined;
    return { success: true, data: row ? row.value : null };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Executes a smart playlist criteria to find matching files.
 */
async function executeSmartPlaylist(/* criteriaJson: string */): Promise<WorkerResult> {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    const query = `
      SELECT
        m.file_path_hash,
        COALESCE(m.file_path, v.file_path) as file_path,
        m.duration,
        m.rating,
        m.created_at,
        COALESCE(v.view_count, 0) as view_count,
        v.last_viewed
      FROM media_metadata m
      LEFT JOIN media_views v ON m.file_path_hash = v.file_path_hash
      UNION
      SELECT
        v.file_path_hash,
        COALESCE(m.file_path, v.file_path) as file_path,
        m.duration,
        m.rating,
        m.created_at,
        v.view_count,
        v.last_viewed
      FROM media_views v
      LEFT JOIN media_metadata m ON v.file_path_hash = m.file_path_hash
    `;
    const rows = db.prepare(query).all();
    return { success: true, data: rows };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Records a view for a media file.
 * @param filePath - The path of the file that was viewed.
 * @returns The result of the operation.
 */
async function recordMediaView(filePath: string): Promise<WorkerResult> {
  if (!db) return { success: false, error: 'Database not initialized' };

  try {
    const fileId = await generateFileId(filePath);
    const now = new Date().toISOString();

    const transaction = db.transaction(() => {
      statements.insertMediaView.run(fileId, filePath, now);
      // Attempt to update path (handles renames/moves), but fallback if unique constraint violated
      try {
        statements.updateMediaViewWithPath.run(now, filePath, fileId);
      } catch (err: unknown) {
        // If unique constraint failed (path already exists on another ID),
        // fallback to legacy update (update count only, keep old path)
        if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
          statements.updateMediaView.run(now, fileId);
        } else {
          throw err;
        }
      }
    });

    transaction();
    return { success: true };
  } catch (error: unknown) {
    console.error(`[worker] Error recording view for ${filePath}:`, error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Gets view counts for multiple file paths.
 * @param filePaths - An array of file paths.
 * @returns The result including the view count map.
 */
async function getMediaViewCounts(filePaths: string[]): Promise<WorkerResult> {
  if (!db) return { success: false, error: 'Database not initialized' };
  if (!filePaths || filePaths.length === 0) {
    return { success: true, data: {} };
  }

  try {
    const viewCountsMap: { [key: string]: number } = {};

    // Optimization: Direct path lookup instead of fs.stat -> hash -> lookup.
    // This assumes paths in DB are kept up-to-date by recordMediaView.
    for (let i = 0; i < filePaths.length; i += SQL_BATCH_SIZE) {
      const batchPaths = filePaths.slice(i, i + SQL_BATCH_SIZE);
      let rows: { file_path: string; view_count: number }[];

      if (batchPaths.length === SQL_BATCH_SIZE) {
        // Use cached prepared statement for full batches
        // No iteration allocation needed, just spread
        rows = statements.getMediaViewCountsBatch.all(...batchPaths) as {
          file_path: string;
          view_count: number;
        }[];
      } else {
        // Use dynamic prepare for the partial last batch
        const placeholders = batchPaths.map(() => '?').join(',');
        rows = db
          .prepare(
            `SELECT file_path, view_count FROM media_views WHERE file_path IN (${placeholders})`,
          )
          .all(...batchPaths) as { file_path: string; view_count: number }[];
      }

      for (const row of rows) {
        viewCountsMap[row.file_path] = row.view_count;
      }
    }

    // Fill in 0 for paths not found
    for (const filePath of filePaths) {
      if (viewCountsMap[filePath] === undefined) {
        viewCountsMap[filePath] = 0;
      }
    }

    return { success: true, data: viewCountsMap };
  } catch (error: unknown) {
    console.error('[worker] Error fetching view counts:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Caches album data in the database.
 * @param cacheKey - The key to use for caching.
 * @param albums - The album data to cache.
 * @returns The result of the operation.
 */
function cacheAlbums(cacheKey: string, albums: unknown): WorkerResult {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    statements.cacheAlbum.run(
      cacheKey,
      JSON.stringify(albums),
      new Date().toISOString(),
    );
    return { success: true };
  } catch (error: unknown) {
    console.error('[worker] Error caching albums:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Retrieves cached albums from the database.
 * @param cacheKey - The key of the cache to retrieve.
 * @returns The result including the cached data.
 */
function getCachedAlbums(cacheKey: string): WorkerResult {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    const row = statements.getCachedAlbum.get(cacheKey) as
      | { cache_value: string }
      | undefined;
    const data = row && row.cache_value ? JSON.parse(row.cache_value) : null;
    return { success: true, data };
  } catch (error: unknown) {
    console.error('[worker] Error reading cached albums:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Closes the database connection.
 * @returns The result of the operation.
 */
function closeDatabase(): WorkerResult {
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
  } catch (error: unknown) {
    console.error('[worker] Error closing database:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Adds a new media directory path to the database.
 * @param payload - The directory object to add.
 * @returns The result of the operation.
 */
function addMediaDirectory(payload: {
  id?: string;
  path: string;
  type?: string;
  name?: string;
}): WorkerResult {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    const id = payload.id || crypto.randomUUID();
    const type = payload.type || 'local';
    const name = payload.name || path.basename(payload.path) || payload.path;

    statements.addMediaDirectory.run(id, payload.path, type, name);
    return { success: true };
  } catch (error: unknown) {
    console.error(
      `[worker] Error adding media directory ${payload.path}:`,
      error,
    );
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Retrieves all media directory paths from the database.
 * @returns The result including the list of directories.
 */
function getMediaDirectories(): WorkerResult {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    const rows = statements.getMediaDirectories.all() as {
      id: string;
      path: string;
      type: string;
      name: string;
      is_active: number;
    }[];
    const directories = rows.map((row) => ({
      id: row.id,
      path: row.path,
      type: row.type as 'local' | 'google_drive',
      name: row.name,
      isActive: !!row.is_active,
    }));
    return { success: true, data: directories };
  } catch (error: unknown) {
    console.error('[worker] Error fetching media directories:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Removes a media directory path from the database.
 * @param directoryPath - The path of the directory to remove.
 * @returns The result of the operation.
 */
function removeMediaDirectory(directoryPath: string): WorkerResult {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    statements.removeMediaDirectory.run(directoryPath);
    return { success: true };
  } catch (error: unknown) {
    console.error(
      `[worker] Error removing media directory ${directoryPath}:`,
      error,
    );
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Updates the active state of a media directory.
 * @param directoryPath - The path of the directory to update.
 * @param isActive - The new active state.
 * @returns The result of the operation.
 */
function setDirectoryActiveState(
  directoryPath: string,
  isActive: boolean,
): WorkerResult {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    statements.setDirectoryActiveState.run(isActive ? 1 : 0, directoryPath);
    return { success: true };
  } catch (error: unknown) {
    console.error(
      `[worker] Error updating active state for ${directoryPath}:`,
      error,
    );
    return { success: false, error: (error as Error).message };
  }
}

if (parentPort) {
  /**
   * Listen for messages from the main thread.
   */
  parentPort.on('message', async (message) => {
    const { id, type, payload } = message;
    let result: WorkerResult;

    try {
      switch (type) {
        case 'init':
          result = initDatabase(payload.dbPath);
          break;
        case 'recordMediaView':
          result = await recordMediaView(payload.filePath);
          break;
        case 'getMediaViewCounts':
          result = await getMediaViewCounts(payload.filePaths);
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
          // Accepts simple string or object now
          result = addMediaDirectory(payload.directoryObj);
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
        case 'upsertMetadata':
          result = await upsertMetadata(payload);
          break;
        case 'bulkUpsertMetadata':
          result = await bulkUpsertMetadata(payload);
          break;
        case 'setRating':
          result = await setRating(payload.filePath, payload.rating);
          break;
        case 'getMetadata':
          result = await getMetadata(payload.filePaths);
          break;
        case 'createSmartPlaylist':
          result = createSmartPlaylist(payload.name, payload.criteria);
          break;
        case 'getSmartPlaylists':
          result = getSmartPlaylists();
          break;
        case 'deleteSmartPlaylist':
          result = deleteSmartPlaylist(payload.id);
          break;
        case 'updateSmartPlaylist':
          result = updateSmartPlaylist(
            payload.id,
            payload.name,
            payload.criteria,
          );
          break;
        case 'saveSetting':
          result = saveSetting(payload.key, payload.value);
          break;
        case 'getSetting':
          result = getSetting(payload.key);
          break;
        case 'executeSmartPlaylist':
          result = await executeSmartPlaylist();
          break;
        case 'getRecentlyPlayed':
          result = getRecentlyPlayed(payload.limit);
          break;
        case 'getPendingMetadata':
          if (!db) {
            result = { success: false, error: 'DB not ready' };
            break;
          }
          const pending = statements.getPendingMetadata.all() as {
            file_path: string;
          }[];
          result = { success: true, data: pending.map((p) => p.file_path) };
          break;
        default:
          result = { success: false, error: `Unknown message type: ${type}` };
      }
    } catch (error: unknown) {
      console.error(
        `[worker] Error processing message id=${id}, type=${type}:`,
        error,
      );
      result = { success: false, error: (error as Error).message };
    }

    parentPort!.postMessage({ id, result });
  });

  console.log('[database-worker.js] Worker thread started and ready.');
  parentPort.postMessage({ type: 'ready' });
}
