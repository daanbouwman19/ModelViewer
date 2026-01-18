import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  authorizeFilePath,
  escapeHtml,
  isRestrictedPath,
  isSensitiveDirectory,
} from '../../src/core/security';
import path from 'path';
import fs from 'fs/promises';
import * as database from '../../src/core/database';

vi.mock('fs/promises', () => {
  return {
    default: {
      realpath: vi.fn(async (p) => p), // Default to returning the path itself
      readFile: vi.fn(),
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
      {
        path: 'gdrive://',
        type: 'google_drive',
        id: '2',
        name: 'Google Drive',
        isActive: true,
      },
    ]);
  });

  it('prevents file enumeration: returns uniform error message', async () => {
    // Case 1: File does not exist -> fs.realpath throws ENOENT for any path
    vi.mocked(fs.realpath).mockRejectedValue(new Error('ENOENT'));
    (vi.mocked(fs.realpath) as any).mockImplementation(async (p: string) => {
      if (p.includes('missing')) throw { code: 'ENOENT' };
      return p; // Return same path for roots etc.
    });

    const resultMissing = await authorizeFilePath('/missing');

    // Case 2: File exists but not allowed -> fs.realpath returns forbidden path
    (vi.mocked(fs.realpath) as any).mockImplementation(async (p: string) => {
      if (p.includes('passwd')) return '/secret/passwd';
      return p; // /allowed remains /allowed
    });

    const resultForbidden = await authorizeFilePath('/secret/passwd');

    // VERIFY FIX: Messages should be identical "Access denied"
    expect(resultMissing.message).toBe('Access denied');
    expect(resultForbidden.message).toBe('Access denied');
  });

  it('rejects empty file path', async () => {
    const result = await authorizeFilePath('');
    expect(result.isAllowed).toBe(false);
    expect(result.message).toBe('Invalid file path');
  });

  it('allows access to valid gdrive:// paths', async () => {
    const result = await authorizeFilePath('gdrive://fileId123');
    expect(result.isAllowed).toBe(true);
    expect(result.realPath).toBe('gdrive://fileId123');
  });

  it('allows access to valid local files within allowed directories', async () => {
    vi.mocked(fs.realpath).mockResolvedValue('/allowed/video.mp4');
    const result = await authorizeFilePath('/allowed/video.mp4');
    expect(result.isAllowed).toBe(true);
    expect(result.realPath).toBe('/allowed/video.mp4');
  });

  it('blocks access to sensitive subdirectories', async () => {
    (vi.mocked(fs.realpath) as any).mockImplementation(async (p: string) =>
      path.resolve(p),
    );
    const result = await authorizeFilePath('/allowed/.env');
    expect(result.isAllowed).toBe(false);
    expect(result.message).toBe('Access to sensitive file denied');

    const result2 = await authorizeFilePath(
      '/allowed/node_modules/package.json',
    );
    expect(result2.isAllowed).toBe(false);
    expect(result2.message).toBe('Access to sensitive file denied');
  });
});

describe('escapeHtml Security', () => {
  it('escapes special characters', () => {
    const input = '<script>alert("xss")</script>';
    const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
    expect(escapeHtml(input)).toBe(expected);
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('handles strings without special characters', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('Path Restriction Security', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    vi.unstubAllEnvs();
  });

  describe('Windows', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.stubEnv('SystemDrive', 'C:');
      vi.stubEnv('SystemRoot', 'C:\\Windows');
      vi.stubEnv('ProgramFiles', 'C:\\Program Files');
      vi.stubEnv('ProgramFiles(x86)', 'C:\\Program Files (x86)');
      vi.stubEnv('ProgramData', 'C:\\ProgramData');
    });

    const sensitiveDirCases: [string, boolean][] = [
      ['C:\\', true],
      ['c:\\windows', true],
      ['C:\\Program Files', true],
      ['C:\\ProgramData', true],
      ['C:\\Users\\User\\Videos', false],
      ['D:\\Videos', false],
      ['C:\\SomeOtherFolder', false],
      // Case insensitivity
      ['c:\\WINDOWS', true],
      ['C:\\program files', true],
      // Edge cases
      ['', true], // Fail safe
    ];

    it.each(sensitiveDirCases)(
      'isSensitiveDirectory("%s") should be %s',
      (path, expected) => {
        expect(isSensitiveDirectory(path)).toBe(expected);
      },
    );

    const restrictedPathCases: [string, boolean][] = [
      ['C:\\Windows', true],
      ['c:\\program files', true],
      ['C:\\', false], // Allowed for navigation
      ['C:\\Users', false],
      // Sensitive component
      ['C:\\Users\\name\\.ssh', true],
      ['C:\\Users\\name\\.env', true],
      // Case insensitivity
      ['c:\\windows\\system32', true],
      // Unrestricted
      ['C:\\MyMedia', false],
      ['', true], // Fail safe
    ];

    it.each(restrictedPathCases)(
      'isRestrictedPath("%s") should be %s',
      (path, expected) => {
        expect(isRestrictedPath(path)).toBe(expected);
      },
    );
  });

  describe('Linux', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
    });

    const sensitiveDirCases: [string, boolean][] = [
      ['/', true],
      ['/etc', true],
      ['/usr/bin', true],
      ['/var/log', true],
      ['/home/user', false],
      ['/mnt/media', false],
      ['', true], // Fail safe
    ];

    it.each(sensitiveDirCases)(
      'isSensitiveDirectory("%s") should be %s',
      (path, expected) => {
        expect(isSensitiveDirectory(path)).toBe(expected);
      },
    );

    const restrictedPathCases: [string, boolean][] = [
      ['/etc', true],
      ['/root', true],
      ['/bin', true],
      ['/sbin', true],
      ['/usr', true],
      ['/lib', true],
      ['/opt', true],
      ['/var', true],
      // Allowed for navigation
      ['/', false],
      ['/home', false],
      ['/media', false],
      // Sensitive component
      ['/home/user/.ssh', true],
      ['/home/user/.env', true],
      ['/home/user/project/.git', true],
      ['', true], // Fail safe
    ];

    it.each(restrictedPathCases)(
      'isRestrictedPath("%s") should be %s',
      (path, expected) => {
        expect(isRestrictedPath(path)).toBe(expected);
      },
    );
  });
});

describe('Security Config Loading', () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock('fs/promises', () => ({
      default: {
        realpath: vi.fn(),
        readFile: vi.fn(),
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock('fs/promises');
  });

  it('loads custom sensitive directories from a valid config file', async () => {
    const mockConfig = JSON.stringify({
      sensitiveSubdirectories: ['custom_secret'],
    });
    const fsMock = await import('fs/promises');
    vi.mocked(fsMock.default.readFile).mockResolvedValue(mockConfig);

    const { loadSecurityConfig: loadConfig, isRestrictedPath: checkPath } =
      await import('../../src/core/security');

    await loadConfig('/path/to/config.json');

    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(checkPath('/home/user/custom_secret')).toBe(true);
  });

  it('ignores missing config file (ENOENT)', async () => {
    const error: any = new Error('File not found');
    error.code = 'ENOENT';
    const fsMock = await import('fs/promises');
    vi.mocked(fsMock.default.readFile).mockRejectedValue(error);

    const { loadSecurityConfig: loadConfig } =
      await import('../../src/core/security');
    await loadConfig('/missing/config.json');

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('warns and throws on invalid JSON or read error', async () => {
    // Re-import fs to get the fresh mock instance after resetModules
    const fsMock = await import('fs/promises');
    vi.mocked(fsMock.default.readFile).mockResolvedValue('{ invalid json ');

    const { loadSecurityConfig: loadConfig } =
      await import('../../src/core/security');
    await expect(loadConfig('/bad/config.json')).rejects.toThrow();

    expect(consoleWarnSpy).toHaveBeenCalled();
  });
});
