import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  authorizeFilePath,
  escapeHtml,
  isRestrictedPath,
  isSensitiveDirectory,
} from '../../src/core/security';
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
    expect(isSensitiveDirectory('C:\\')).toBe(true);
    expect(isSensitiveDirectory('c:\\windows')).toBe(true);
    expect(isSensitiveDirectory('C:\\Program Files')).toBe(true);
    expect(isSensitiveDirectory('C:\\Users\\User\\Videos')).toBe(false);
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
    expect(isRestrictedPath('C:\\Windows')).toBe(true);
    expect(isRestrictedPath('c:\\program files')).toBe(true);
    expect(isRestrictedPath('C:\\')).toBe(false); // Allowed for navigation
    expect(isRestrictedPath('C:\\Users')).toBe(false);
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
