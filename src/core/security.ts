import fs from 'fs/promises';
import path from 'path';
import { getMediaDirectories } from './database';

export interface AuthorizationResult {
  isAllowed: boolean;
  realPath?: string;
  message?: string;
}

/**
 * Validates if a file path is within the allowed media directories.
 * @param filePath - The path to validate.
 * @returns Authorization result containing allowed status, resolved path, or error message.
 */
export async function authorizeFilePath(
  filePath: string,
): Promise<AuthorizationResult> {
  if (!filePath) {
    return { isAllowed: false, message: 'File path is empty' };
  }

  const mediaDirectories = await getMediaDirectories();

  let realPath: string;
  try {
    realPath = await fs.realpath(filePath);
  } catch (error) {
    console.warn(
      `[Security] File existence check failed for ${filePath}:`,
      error,
    );
    return {
      isAllowed: false,
      message: 'Access denied',
    };
  }

  const allowedPaths = mediaDirectories.map((d) => d.path);
  const isAllowed = allowedPaths.some((allowedDir: string) => {
    const relative = path.relative(allowedDir, realPath);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  });

  if (!isAllowed) {
    console.warn(
      `[Security] Access denied to file outside media directories: ${realPath} (resolved from ${filePath})`,
    );
    return {
      isAllowed: false,
      message: 'Access denied',
    };
  }

  return { isAllowed: true, realPath };
}

/**
 * Escapes HTML characters in a string to prevent XSS.
 * @param str - The string to escape.
 * @returns The escaped string.
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Helper to get Windows restricted paths from environment or defaults.
 */
function getWindowsRestrictedPaths(): string[] {
  const drive = process.env.SystemDrive || 'C:';
  return [
    process.env.SystemRoot || `${drive}\\Windows`,
    process.env.ProgramFiles || `${drive}\\Program Files`,
    process.env['ProgramFiles(x86)'] || `${drive}\\Program Files (x86)`,
    process.env.ProgramData || `${drive}\\ProgramData`,
  ];
}

/**
 * Checks if a path is restricted for listing contents.
 * Allows root listing for navigation, but blocks internal system folders.
 * @param dirPath - The path to check.
 * @returns True if the path is restricted.
 */
export function isRestrictedPath(dirPath: string): boolean {
  if (!dirPath) return true;
  const p = process.platform === 'win32' ? path.win32 : path.posix;
  const normalized = p.resolve(dirPath);

  if (process.platform === 'win32') {
    // Allow C:\ (to navigate), but block C:\Windows etc.
    const restricted = getWindowsRestrictedPaths();
    return restricted.some(
      (r) =>
        normalized.toLowerCase() === r.toLowerCase() ||
        normalized.toLowerCase().startsWith(r.toLowerCase() + '\\'),
    );
  } else {
    // Allow / (to navigate), but block /etc, /proc, /root
    const restricted = ['/etc', '/proc', '/sys', '/root', '/boot', '/dev'];
    return restricted.some(
      (r) => normalized === r || normalized.startsWith(r + '/'),
    );
  }
}

/**
 * Checks if a path is a sensitive system root that should not be scanned recursively.
 * Used when adding media directories.
 * @param dirPath - The path to check.
 * @returns True if the path is sensitive.
 */
export function isSensitiveDirectory(dirPath: string): boolean {
  if (!dirPath) return true;
  const p = process.platform === 'win32' ? path.win32 : path.posix;
  const normalized = p.resolve(dirPath);

  if (process.platform === 'win32') {
    // Block C:\, C:\Windows, C:\Program Files, etc.
    const drive = process.env.SystemDrive || 'C:';
    const restricted = [`${drive}\\`, ...getWindowsRestrictedPaths()];
    return restricted.some(
      (r) =>
        normalized.toLowerCase() === r.toLowerCase() ||
        normalized.toLowerCase().startsWith(r.toLowerCase() + '\\'),
    );
  } else {
    // Block /, /etc, /usr, /var, etc.
    const restricted = [
      '/',
      '/etc',
      '/usr',
      '/var',
      '/bin',
      '/sbin',
      '/root',
      '/sys',
      '/proc',
      '/dev',
      '/boot',
    ];
    return restricted.some(
      (r) => normalized === r || normalized.startsWith(r + '/'),
    );
  }
}
