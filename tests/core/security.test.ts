import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authorizeFilePath } from '../../src/core/security';
import fs from 'fs/promises';
import * as database from '../../src/core/database';

vi.mock('fs/promises', () => {
  return {
    default: {
      realpath: vi.fn(),
    },
  };
});
vi.mock('../../src/core/database');

describe('authorizeFilePath Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(database.getMediaDirectories).mockResolvedValue([
      {
        path: '/allowed',
        type: 'local',
        id: '1',
        name: 'Allowed',
        isActive: true,
      },
    ]);
  });

  it('prevents file enumeration: returns uniform error message', async () => {
    // Case 1: File does not exist -> fs.realpath throws
    vi.mocked(fs.realpath).mockRejectedValue(new Error('ENOENT'));

    const resultMissing = await authorizeFilePath('/missing');

    // Case 2: File exists but not allowed -> fs.realpath returns path
    vi.mocked(fs.realpath).mockResolvedValue('/secret/passwd');

    const resultForbidden = await authorizeFilePath('/secret/passwd');

    // VERIFY FIX: Messages should be identical "Access denied"
    expect(resultMissing.message).toBe('Access denied');
    expect(resultForbidden.message).toBe('Access denied');
  });
});
