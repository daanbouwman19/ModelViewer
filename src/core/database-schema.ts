/**
 * @file Database schema definitions and migration logic.
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';

export const DB_SCHEMA = {
  MEDIA_VIEWS: `CREATE TABLE IF NOT EXISTS media_views (
    file_path_hash TEXT PRIMARY KEY,
    file_path TEXT UNIQUE,
    view_count INTEGER DEFAULT 0,
    last_viewed TEXT
  )`,

  APP_CACHE: `CREATE TABLE IF NOT EXISTS app_cache (
    cache_key TEXT PRIMARY KEY,
    cache_value TEXT,
    last_updated TEXT
  )`,

  MEDIA_DIRECTORIES: `CREATE TABLE IF NOT EXISTS media_directories (
    id TEXT PRIMARY KEY,
    path TEXT UNIQUE,
    type TEXT DEFAULT 'local',
    name TEXT,
    is_active INTEGER DEFAULT 1
  )`,

  MEDIA_METADATA: `CREATE TABLE IF NOT EXISTS media_metadata (
    file_path_hash TEXT PRIMARY KEY,
    file_path TEXT,
    duration REAL,
    size INTEGER,
    created_at TEXT,
    rating INTEGER DEFAULT 0,
    extraction_status TEXT DEFAULT 'pending'
  )`,

  SMART_PLAYLISTS: `CREATE TABLE IF NOT EXISTS smart_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    criteria TEXT NOT NULL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  SETTINGS: `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT
  )`,
};

/**
 * Initializes the database schema.
 */
export function initializeSchema(db: Database.Database): void {
  for (const schema of Object.values(DB_SCHEMA)) {
    db.prepare(schema).run();
  }
}

/**
 * Migrates media_directories table if needed.
 */
export function migrateMediaDirectories(db: Database.Database): void {
  const dirTableInfo = db
    .prepare('PRAGMA table_info(media_directories)')
    .all() as { name: string }[];
  const hasId = dirTableInfo.some((col) => col.name === 'id');
  const tableExists = dirTableInfo.length > 0;

  // If table exists but has no 'id' column, it's the old schema and needs migration.
  // Note: if table didn't exist, initializeSchema would have created the new one, so hasId would be true.
  if (tableExists && !hasId) {
    console.log('[worker] Migrating media_directories table...');

    const migrate = db.transaction(() => {
      // 1. Rename old table
      db.prepare(
        'ALTER TABLE media_directories RENAME TO media_directories_old',
      ).run();

      // 2. Create new table
      db.prepare(DB_SCHEMA.MEDIA_DIRECTORIES).run();

      // 3. Migrate data
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
    });

    migrate();
    console.log('[worker] Migration complete.');
  }
}

/**
 * Migrates media_metadata table if needed.
 */
export function migrateMediaMetadata(db: Database.Database): void {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(media_metadata)').all() as {
      name: string;
    }[];

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
}
