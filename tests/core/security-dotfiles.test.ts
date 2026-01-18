import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authorizeFilePath, isRestrictedPath, isSensitiveDirectory } from '../../src/core/security';
import fs from 'fs/promises';
import * as database from '../../src/core/database';

vi.mock('fs/promises', () => {
  return {
    default: {
      realpath: vi.fn(),
      readFile: vi.fn(),
    },
  };
});
vi.mock('../../src/core/database');

describe('authorizeFilePath Dotfile Security', () => {
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

  it('should deny access to dotfiles not in the sensitive list (e.g. .bashrc)', async () => {
    vi.mocked(fs.realpath).mockResolvedValue('/allowed/.bashrc');
    const result = await authorizeFilePath('/allowed/.bashrc');
    console.log('Access to .bashrc allowed:', result.isAllowed);
    expect(result.isAllowed).toBe(false);
    expect(result.message).toBe('Access to sensitive file denied');
  });

  it('should deny access to hidden directories not in the sensitive list', async () => {
    vi.mocked(fs.realpath).mockResolvedValue('/allowed/.hidden/file.txt');
    const result = await authorizeFilePath('/allowed/.hidden/file.txt');
    console.log('Access to .hidden/file.txt allowed:', result.isAllowed);
    expect(result.isAllowed).toBe(false);
    expect(result.message).toBe('Access to sensitive file denied');
  });
});

describe('Path Restriction Dotfile Security', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('isRestrictedPath should block dot-directories', () => {
        expect(isRestrictedPath('/home/user/.hidden')).toBe(true);
        expect(isRestrictedPath('/home/user/.config')).toBe(true);
        expect(isRestrictedPath('/home/user/normal')).toBe(false);
    });

    it('isSensitiveDirectory should block adding dot-directories', () => {
        expect(isSensitiveDirectory('/home/user/.hidden')).toBe(true);
        expect(isSensitiveDirectory('/home/user/.config')).toBe(true);
        expect(isSensitiveDirectory('/home/user/normal')).toBe(false);
    });
});
