import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import {
  initializeSchema,
  createIndexes,
  migrateMediaMetadata,
} from '../../src/core/database-schema';

describe('Database Schema Optimization', () => {
  let dbPath: string;
  let tempDir: string;
  let db: Database.Database;

  beforeEach(() => {
    const testDir = path.join(process.cwd(), 'tests', 'temp-schema');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    tempDir = fs.mkdtempSync(path.join(testDir, 'test-db-'));
    dbPath = path.join(tempDir, 'test.sqlite');
    db = new Database(dbPath);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.warn(`Failed to clean up temp dir ${tempDir}:`, e);
    }
  });

  it('should create performance indexes', () => {
    // 1. Initialize Schema (Creates tables)
    initializeSchema(db);

    // 2. Ensure columns exist (in case schema needs migration logic to run)
    // initializeSchema creates the LATEST schema, so columns should be there.
    // But let's run migration just to be consistent with worker flow.
    migrateMediaMetadata(db);

    // 3. Create Indexes
    createIndexes(db);

    // 4. Inspect DB
    const indexes = db
      .prepare(
        `
      SELECT name FROM sqlite_master
      WHERE type='index' AND name LIKE 'idx_%'
    `,
      )
      .all() as { name: string }[];

    const indexNames = indexes.map((i) => i.name);

    // Verify specific indexes
    expect(indexNames).toContain('idx_media_metadata_status');
    expect(indexNames).toContain('idx_media_views_last_viewed');
  });

  it('should be idempotent (safe to run multiple times)', () => {
    initializeSchema(db);
    createIndexes(db);

    // Run again
    expect(() => createIndexes(db)).not.toThrow();

    const indexes = db
      .prepare(
        `
      SELECT name FROM sqlite_master
      WHERE type='index' AND name LIKE 'idx_%'
    `,
      )
      .all() as { name: string }[];

    // Should still have unique indexes (not duplicated or errored)
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_media_metadata_status');
    expect(indexNames).toContain('idx_media_views_last_viewed');
  });
});
