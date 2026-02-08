import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { isRestrictedPath } from '../src/core/security';
import { listDirectory } from '../src/core/file-system';

const TEST_DIR = path.join(process.cwd(), 'test-data', 'security-symlink');
const SYMLINK_PATH = path.join(TEST_DIR, 'link_to_tmp');
const TARGET_PATH = '/tmp'; // Restricted path on Linux

// Helper to mimic the fixed route logic
async function safeListDirectory(dirPath: string) {
  let resolvedPath = dirPath;
  try {
    resolvedPath = await fs.realpath(dirPath);
  } catch {
    throw new Error('Invalid path or access denied');
  }

  if (isRestrictedPath(resolvedPath)) {
    throw new Error('Access denied');
  }

  return listDirectory(resolvedPath);
}

describe('Symlink Traversal Security Fix', () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    try {
      await fs.symlink(TARGET_PATH, SYMLINK_PATH);
    } catch {
      // Ignore if exists
    }
  });

  afterAll(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should still allow raw symlink listing via listDirectory directly (base function is dumb)', async () => {
    // This confirms the underlying function wasn't changed, only the consumer
    const contents = await listDirectory(SYMLINK_PATH);
    expect(contents.length).toBeGreaterThan(0);
  });

  it('should block symlink listing when using the secure logic (mimicking routes)', async () => {
    await expect(safeListDirectory(SYMLINK_PATH)).rejects.toThrow(
      'Access denied',
    );
  });

  it('should block direct listing of restricted path', async () => {
    await expect(safeListDirectory(TARGET_PATH)).rejects.toThrow(
      'Access denied',
    );
  });
});
