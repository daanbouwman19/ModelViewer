import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
  initDatabase,
  closeDatabase,
  upsertMetadata,
  recordMediaView,
  executeSmartPlaylist,
} from '../../src/core/database-worker';

describe('Smart Playlist SQL Generation', () => {
  const TEST_DB_PATH = path.join(__dirname, 'test_smart_playlist.sqlite');

  beforeAll(async () => {
    // Clean up previous run
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    initDatabase(TEST_DB_PATH);

    // Seed Data
    // Item 1: High rating, long duration
    await upsertMetadata({
      filePath: '/high-rating.mp4',
      duration: 500,
      rating: 5,
      size: 1000,
    });
    // Item 2: Low rating, short duration
    await upsertMetadata({
      filePath: '/low-rating.mp4',
      duration: 50,
      rating: 1,
      size: 500,
    });
    // Item 3: Medium rating, viewed
    await upsertMetadata({
      filePath: '/viewed.mp4',
      duration: 200,
      rating: 3,
      size: 750,
    });

    // Record views for Item 3 (viewed now)
    await recordMediaView('/viewed.mp4');
    await recordMediaView('/viewed.mp4'); // 2 views
  });

  afterAll(() => {
    closeDatabase();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  it('should filter by minRating', async () => {
    const result = await executeSmartPlaylist(JSON.stringify({ minRating: 4 }));
    expect(result.success).toBe(true);
    const rows = result.data as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].file_path).toBe('/high-rating.mp4');
  });

  it('should filter by minDuration', async () => {
    const result = await executeSmartPlaylist(
      JSON.stringify({ minDuration: 100 }),
    );
    expect(result.success).toBe(true);
    const rows = result.data as any[];
    // high-rating (500) and viewed (200) match
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.file_path === '/high-rating.mp4')).toBeDefined();
    expect(rows.find((r) => r.file_path === '/viewed.mp4')).toBeDefined();
  });

  it('should filter by minViews', async () => {
    const result = await executeSmartPlaylist(JSON.stringify({ minViews: 1 }));
    expect(result.success).toBe(true);
    const rows = result.data as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].file_path).toBe('/viewed.mp4');
  });

  it('should filter by maxViews', async () => {
    const result = await executeSmartPlaylist(JSON.stringify({ maxViews: 0 }));
    expect(result.success).toBe(true);
    const rows = result.data as any[];
    // high-rating (0) and low-rating (0) match
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.file_path === '/high-rating.mp4')).toBeDefined();
    expect(rows.find((r) => r.file_path === '/low-rating.mp4')).toBeDefined();
  });

  it('should handle multiple criteria', async () => {
    const result = await executeSmartPlaylist(
      JSON.stringify({ minRating: 2, minDuration: 100 }),
    );
    expect(result.success).toBe(true);
    const rows = result.data as any[];
    // high-rating (5, 500) matches
    // viewed (3, 200) matches
    expect(rows.length).toBe(2);
  });

  it('should handle minDaysSinceView correctly', async () => {
    // viewed.mp4 was viewed just now (diffDays ~ 0)
    // unviewed items (last_viewed is null) should match "not viewed in X days" logic?
    // Wait, let's verify logic:
    // JS: if (diffDays < minDays) match = false;
    // SQL: (v.last_viewed IS NULL OR (now - last_viewed) >= minDays)

    // Test 1: minDaysSinceView = 1 (should exclude viewed.mp4, include others)
    let result = await executeSmartPlaylist(
      JSON.stringify({ minDaysSinceView: 1 }),
    );
    expect(result.success).toBe(true);
    let rows = result.data as any[];
    expect(rows.find((r) => r.file_path === '/viewed.mp4')).toBeUndefined();
    expect(rows.find((r) => r.file_path === '/high-rating.mp4')).toBeDefined(); // Never viewed -> Matches

    // Test 2: minDaysSinceView = 0 (should include everything)
    result = await executeSmartPlaylist(
      JSON.stringify({ minDaysSinceView: 0 }),
    );
    expect(result.success).toBe(true);
    rows = result.data as any[];
    expect(rows.length).toBe(3);
  });

  it('should handle empty criteria (return all)', async () => {
    const result = await executeSmartPlaylist('{}');
    expect(result.success).toBe(true);
    const rows = result.data as any[];
    expect(rows.length).toBe(3);
  });
});
