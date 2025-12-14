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
  } catch (error: unknown) {
    console.error('[worker] Failed to initialize database:', error);
    db = null; // Ensure db is null on failure
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
      const results = await Promise.all(
        batch.map(async (filePath) => {
          const fileId = await generateFileId(filePath);
          return { filePath, fileId };
        }),
      );

      for (const { filePath, fileId } of results) {
        pathIdMap.set(filePath, fileId);
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
