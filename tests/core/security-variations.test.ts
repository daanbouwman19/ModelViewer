import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authorizeFilePath } from '../../src/core/security';
import path from 'path';
import fs from 'fs/promises';
import * as database from '../../src/core/database';

vi.mock('fs/promises', () => {
  return {
    default: {
      realpath: vi.fn(async (p) => p),
      readFile: vi.fn(),
    },
  };
});
vi.mock('../../src/core/database');

describe('authorizeFilePath Extension Security', () => {
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
    // Mock fs.realpath to return the path itself for simplicity
    (vi.mocked(fs.realpath) as any).mockImplementation(async (p: string) =>
      path.resolve(p),
    );
  });

  it('should block .env variants', async () => {
    // .env is blocked by exact match
    const env = await authorizeFilePath('/allowed/.env');
    expect(env.isAllowed).toBe(false);

    // .env.local should be blocked
    const envLocal = await authorizeFilePath('/allowed/.env.local');
    expect(envLocal.isAllowed).toBe(false);

    // .env.production should be blocked
    const envProd = await authorizeFilePath('/allowed/.env.production');
    expect(envProd.isAllowed).toBe(false);
  });

  it('should block id_rsa variants', async () => {
    // id_rsa is blocked by exact match
    const rsa = await authorizeFilePath('/allowed/id_rsa');
    expect(rsa.isAllowed).toBe(false);

    // id_rsa.bak should be blocked
    const rsaBak = await authorizeFilePath('/allowed/id_rsa.bak');
    expect(rsaBak.isAllowed).toBe(false);
  });
});
