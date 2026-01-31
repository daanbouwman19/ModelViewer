
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema, migrateMediaMetadata } from '../../src/core/database-schema';

describe('Database Schema vs Application Types', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    migrateMediaMetadata(db);
  });

  afterAll(() => {
    db.close();
  });

  it('verifies that aliasing columns produces camelCase properties matching application types', () => {
    const insertStmt = db.prepare(`
      INSERT INTO media_metadata (file_path_hash, file_path, duration, size, created_at, rating, extraction_status, watched_segments)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run('hash1', '/path/to/file.mp4', 120, 1024, '2023-01-01T00:00:00.000Z', 5, 'success', null);

    // This query simulates the fix we are applying in database-worker.ts
    const row = db.prepare(`
      SELECT
        file_path,
        duration,
        size,
        created_at as createdAt,
        rating,
        extraction_status as status
      FROM media_metadata WHERE file_path = ?
    `).get('/path/to/file.mp4') as any;

    console.log('Row keys:', Object.keys(row));

    expect(row).toHaveProperty('createdAt');
    expect(row).not.toHaveProperty('created_at');
    expect(row).toHaveProperty('status');
    expect(row).not.toHaveProperty('extraction_status');
    expect(row.createdAt).toBe('2023-01-01T00:00:00.000Z');
    expect(row.status).toBe('success');
  });
});
