import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  authorizeFilePath,
  escapeHtml,
  isRestrictedPath,
  isSensitiveDirectory,
  loadSecurityConfig,
} from '../../src/core/security';
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

  it('rejects empty file path', async () => {
    const result = await authorizeFilePath('');
    expect(result.isAllowed).toBe(false);
    expect(result.message).toBe('File path is empty');
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
    vi.mocked(fs.realpath).mockResolvedValue('/allowed/.env');
    const result = await authorizeFilePath('/allowed/.env');
    expect(result.isAllowed).toBe(false);
    expect(result.message).toBe('Access to sensitive file denied');

    vi.mocked(fs.realpath).mockResolvedValue(
      '/allowed/node_modules/package.json',
    );
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
  });

  it('correctly identifies sensitive system directories (Windows)', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    vi.stubEnv('SystemDrive', 'C:');
    vi.stubEnv('SystemRoot', 'C:\\Windows');
    vi.stubEnv('ProgramFiles', 'C:\\Program Files');
    vi.stubEnv('ProgramFiles(x86)', 'C:\\Program Files (x86)');
    vi.stubEnv('ProgramData', 'C:\\ProgramData');

    expect(isSensitiveDirectory('C:\\')).toBe(true);
    expect(isSensitiveDirectory('c:\\windows')).toBe(true);
    expect(isSensitiveDirectory('C:\\Program Files')).toBe(true);
    expect(isSensitiveDirectory('C:\\Users\\User\\Videos')).toBe(false);
    vi.unstubAllEnvs();
  });

  it('correctly identifies sensitive system directories (Linux)', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(isSensitiveDirectory('/')).toBe(true);
    expect(isSensitiveDirectory('/etc')).toBe(true);
    expect(isSensitiveDirectory('/usr/bin')).toBe(true);
    expect(isSensitiveDirectory('/home/user')).toBe(false);
  });

  it('correctly identifies restricted listing paths (Windows)', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    vi.stubEnv('SystemDrive', 'C:');
    vi.stubEnv('SystemRoot', 'C:\\Windows');
    vi.stubEnv('ProgramFiles', 'C:\\Program Files');
    vi.stubEnv('ProgramFiles(x86)', 'C:\\Program Files (x86)');
    vi.stubEnv('ProgramData', 'C:\\ProgramData');

    expect(isRestrictedPath('C:\\Windows')).toBe(true);
    expect(isRestrictedPath('c:\\program files')).toBe(true);
    expect(isRestrictedPath('C:\\')).toBe(false); // Allowed for navigation
    expect(isRestrictedPath('C:\\Users')).toBe(false);

    // Check sensitive component
    expect(isRestrictedPath('C:\\Users\\name\\.ssh')).toBe(true);
    vi.unstubAllEnvs();
  });

  it('correctly identifies restricted listing paths (Linux)', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(isRestrictedPath('/etc')).toBe(true);
    expect(isRestrictedPath('/root')).toBe(true);
    expect(isRestrictedPath('/')).toBe(false); // Allowed for navigation
    expect(isRestrictedPath('/home')).toBe(false);
  });

  it('handles edge cases', () => {
    expect(isSensitiveDirectory('')).toBe(true); // Fail safe
    expect(isRestrictedPath('')).toBe(true);
  });
});

describe('Security Config Loading', () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads custom sensitive directories from a valid config file', async () => {
    const mockConfig = JSON.stringify({
      sensitiveSubdirectories: ['custom_secret'],
    });
    vi.mocked(fs.readFile).mockResolvedValue(mockConfig);

    await loadSecurityConfig('/path/to/config.json');

    // Verify it was added to the set by checking isRestrictedPath
    // We mock platform to linux to ensure consistent path separator behavior for this test
    Object.defineProperty(process, 'platform', { value: 'linux' });
    // isSensitiveDirectory does not use the dynamic set (it checks system roots), so we don't assert on it here.
    expect(isRestrictedPath('/home/user/custom_secret')).toBe(true);
  });

  it('ignores missing config file (ENOENT)', async () => {
    const error: any = new Error('File not found');
    error.code = 'ENOENT';
    vi.mocked(fs.readFile).mockRejectedValue(error);

    await loadSecurityConfig('/missing/config.json');

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('warns on invalid JSON or read error', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('{ invalid json ');

    await loadSecurityConfig('/bad/config.json');

    expect(consoleWarnSpy).toHaveBeenCalled();
  });
});
