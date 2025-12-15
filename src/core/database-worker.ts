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

/**
 * The database instance for this worker thread.
 */
let db: Database.Database | null = null;

/**
 * Cache for prepared statements to improve performance of repeated queries.
 * Keys are the statement names (e.g., 'insertMediaView'), and values are the prepared SQLite statements.
 */
const statements: { [key: string]: Database.Statement } = {};

// Helper Functions

/**
 * Generates a stable, unique identifier for a file.
 * @param filePath - The path to the file.
 * @returns A unique MD5 hash for the file.
 */
async function generateFileId(filePath: string): Promise<string> {
  try {
    const stats = await fs.stat(filePath);
    const uniqueString = `${stats.size}-${stats.mtime.getTime()}`;
    return crypto.createHash('md5').update(uniqueString).digest('hex');
  } catch (error) {
    console.error(`[worker] Error generating file ID for ${filePath}:`, error);
    return crypto.createHash('md5').update(filePath).digest('hex');
  }
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

    db.prepare(
      `CREATE TABLE IF NOT EXISTS media_directories (
        path TEXT PRIMARY KEY,
        is_active INTEGER DEFAULT 1
      )`,
    ).run();

    db.prepare(
      `CREATE TABLE IF NOT EXISTS media_metadata (
        file_path_hash TEXT PRIMARY KEY,
        file_path TEXT,
        duration REAL,
        size INTEGER,
        created_at TEXT,
        rating INTEGER DEFAULT 0
      )`,
    ).run();

    // Migration: Add file_path to media_metadata if it doesn't exist
    try {
      const tableInfo = db
        .prepare('PRAGMA table_info(media_metadata)')
        .all() as { name: string }[];
      const hasFilePath = tableInfo.some((col) => col.name === 'file_path');
      if (!hasFilePath) {
        db.prepare(
          'ALTER TABLE media_metadata ADD COLUMN file_path TEXT',
        ).run();
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
    statements.upsertMetadata = db.prepare(
      `INSERT INTO media_metadata (file_path_hash, file_path, duration, size, created_at, rating)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(file_path_hash) DO UPDATE SET
       file_path = excluded.file_path,
       duration = COALESCE(excluded.duration, media_metadata.duration),
       size = COALESCE(excluded.size, media_metadata.size),
       created_at = COALESCE(excluded.created_at, media_metadata.created_at),
       rating = COALESCE(excluded.rating, media_metadata.rating)`,
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
    statements.deleteSmartPlaylist = db.prepare(
      'DELETE FROM smart_playlists WHERE id = ?',
    );
    statements.updateSmartPlaylist = db.prepare(
      'UPDATE smart_playlists SET name = ?, criteria = ? WHERE id = ?',
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
}

/**
 * Upserts metadata for a file.
 */
async function upsertMetadata(payload: MetadataPayload): Promise<WorkerResult> {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    const fileId = await generateFileId(payload.filePath);
    // We need to be careful not to overwrite existing rating if we are just updating duration, etc.
    // The SQL query above replaces everything.
    // Let's change strategy: fetch existing first or use specific update statements.
    // Actually, distinct functions for "scan update" vs "user rating" is safer.

    statements.upsertMetadata.run(
      fileId,
      payload.filePath,
      payload.duration === undefined ? null : payload.duration,
      payload.size === undefined ? null : payload.size,
      payload.createdAt === undefined ? null : payload.createdAt,
      payload.rating === undefined ? null : payload.rating,
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
 * Retrieves metadata for a list of files.
 */
async function getMetadata(filePaths: string[]): Promise<WorkerResult> {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    if (filePaths.length === 0) {
      return { success: true, data: {} };
    }

    const fileIds = await Promise.all(
      filePaths.map((filePath) => generateFileId(filePath)),
    );

    const placeholders = fileIds.map(() => '?').join(',');
    const query = `SELECT * FROM media_metadata WHERE file_path_hash IN (${placeholders})`;

    const rows = db.prepare(query).all(...fileIds) as {
      file_path: string;
      [key: string]: unknown;
    }[];

    const metadataMap: { [key: string]: unknown } = {};
    for (const row of rows) {
      if (row.file_path) {
        metadataMap[row.file_path] = row;
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
 * Executes a smart playlist criteria to find matching files.
 * This is the complex part where we translate JSON criteria to SQL or JS filtering.
 * For now, let's fetch all metadata and join with view counts, then filter in JS/Worker.
 * This is safer than constructing dynamic SQL for now, although less performant for huge DBs.
 */
async function executeSmartPlaylist(/* criteriaJson: string */): Promise<WorkerResult> {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    // 1. Fetch all files with their metadata and view stats
    // We join media_metadata (optional) and media_views (optional)
    // Actually media_metadata has the file_hash, but we need the file path.
    // media_views has file_path.
    // But we might have files in metadata that are not in views, and vice versa.
    // The "source of truth" for ALL files is the file system scan (Albums).
    // The DB only stores auxiliary data.
    // SO: We cannot purely query the DB to get "all files matching criteria" because the DB doesn't know about all files yet
    // unless we strictly enforce that all files are in metadata table.
    //
    // Strategy:
    // The frontend sends criteria. The worker returns a list of file paths.
    // BUT the worker doesn't know the full file list unless we sync it.
    //
    // Alternative: Return *all* metadata and view stats to the renderer, and let the renderer filter
    // the list of known files (from AlbumTree) against this metadata.
    //
    // Let's implement `getAllMetadataAndStats()`
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
    // Return a map keyed by file_path or hash
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
      statements.updateMediaView.run(now, fileId);
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
    const pathIdMap = new Map<string, string>();

    // Optimization: Process file ID generation in parallel batches
    // instead of sequentially to reduce I/O bottleneck.
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

    const transaction = db.transaction((paths: string[]) => {
      paths.forEach((filePath) => {
        const fileId = pathIdMap.get(filePath);
        if (fileId) {
          const row = statements.getMediaView.get(fileId) as
            | { view_count: number }
            | undefined;
          viewCountsMap[filePath] = row ? row.view_count : 0;
        }
      });
    });

    transaction(filePaths);

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
 * @param directoryPath - The path of the directory to add.
 * @returns The result of the operation.
 */
function addMediaDirectory(directoryPath: string): WorkerResult {
  if (!db) return { success: false, error: 'Database not initialized' };
  try {
    statements.addMediaDirectory.run(directoryPath);
    return { success: true };
  } catch (error: unknown) {
    console.error(
      `[worker] Error adding media directory ${directoryPath}:`,
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
      path: string;
      is_active: number;
    }[];
    const directories = rows.map((row) => ({
      path: row.path,
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

// Color functions removed as deprecated

if (parentPort) {
  /**
   * Listen for messages from the main thread.
   * This is the entry point for all database operations requested by the main process.
   * It dispatches the request to the appropriate function based on the message type
   * and sends the result back to the main thread.
   *
   * @param message - The message object containing the operation ID, type, and payload.
   */
  parentPort.on('message', async (message) => {
    const { id, type, payload } = message;
    let result: WorkerResult;

    try {
      // Note: Internal functions are now synchronous, but we keep the async handler
      // structure in case we need async operations in the future or for consistency.
      // The await keyword is not strictly necessary for sync functions but harmless.
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
        case 'upsertMetadata':
          result = await upsertMetadata(payload);
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
        case 'executeSmartPlaylist':
          result = await executeSmartPlaylist();
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

  // Signal that the worker is ready, primarily for testing environments
  parentPort.postMessage({ type: 'ready' });
}
