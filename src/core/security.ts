import fs from 'fs/promises';
import path from 'path';
import { getMediaDirectories } from './database.ts';
import {
  SENSITIVE_SUBDIRECTORIES,
  WINDOWS_RESTRICTED_ROOT_PATHS,
} from './constants.ts';

export interface AuthorizationResult {
  isAllowed: boolean;
  realPath?: string;
  message?: string;
}

interface ErrnoException extends Error {
  errno?: number;
  code?: string;
  path?: string;
  syscall?: string;
}

function isErrnoException(error: unknown): error is ErrnoException {
  return (
    error instanceof Error && typeof (error as ErrnoException).code === 'string'
  );
}

// Mutable set of sensitive directories, initialized with defaults.
const sensitiveSubdirectoriesSet = new Set(SENSITIVE_SUBDIRECTORIES);

/**
 * Loads security configuration from a JSON file to extend sensitive directories.
 * @param configPath - Path to the security configuration file.
 */
export async function loadSecurityConfig(configPath: string): Promise<void> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    if (
      Array.isArray(config.sensitiveSubdirectories) &&
      config.sensitiveSubdirectories.every(
        (i: unknown) => typeof i === 'string',
      )
    ) {
      for (const dir of config.sensitiveSubdirectories) {
        sensitiveSubdirectoriesSet.add(dir);
      }
      console.log(
        `[Security] Loaded ${config.sensitiveSubdirectories.length} custom sensitive directories.`,
      );
    }
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      // Ignore missing config file, use defaults.
      return;
    }

    console.warn(
      `[Security] Failed to load security config from ${configPath}:`,
      error,
    );
    throw error;
  }
}

/**
 * Validates if a file path is within the allowed media directories.
 * @param filePath - The path to validate.
 * @returns Authorization result containing allowed status, resolved path, or error/denied message.
 */
export async function authorizeFilePath(
  filePath: string,
): Promise<AuthorizationResult> {
  if (!filePath) {
    return { isAllowed: false, message: 'File path is empty' };
  }

  const mediaDirectories = await getMediaDirectories();

  let realPath: string;
  if (filePath.startsWith('gdrive://')) {
    realPath = filePath;
  } else {
    try {
      realPath = await fs.realpath(filePath);
    } catch (error) {
      // Treat missing files or access errors as "Access denied" without logging spam for mundane checks.
      if (!isErrnoException(error) || error.code !== 'ENOENT') {
        console.warn(
          `[Security] File check failed for ${filePath}: ${(error as Error).message}`,
        );
      }
      return {
        isAllowed: false,
        message: 'Access denied',
      };
    }
  }

  const allowedPaths = mediaDirectories.map((d) => d.path);
  let isPathAllowed = false;

  for (const allowedDir of allowedPaths) {
    const relative = path.relative(allowedDir, realPath);
    // Check if file is inside the directory
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      // It is inside. Now check for sensitive subdirectories.
      const segments = relative.split(path.sep);
      const hasSensitiveSegment = segments.some((segment) =>
        sensitiveSubdirectoriesSet.has(segment),
      );

      if (hasSensitiveSegment) {
        console.warn(`[Security] Access denied to sensitive file: ${realPath}`);
        return {
          isAllowed: false,
          message: 'Access to sensitive file denied',
        };
      }

      isPathAllowed = true;
      break;
    }
  }

  if (!isPathAllowed) {
    // Only warn if it's genuinely outside allowed paths, ensuring we don't leak info but helpful for debugging
    // checking if we should log based on environment could be better, but this is fine for now on failures.
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
  return WINDOWS_RESTRICTED_ROOT_PATHS.map((r) => {
    switch (r) {
      case 'Windows':
        return process.env.SystemRoot || `${drive}\\Windows`;
      case 'Program Files':
        return process.env.ProgramFiles || `${drive}\\Program Files`;
      case 'Program Files (x86)':
        return (
          process.env['ProgramFiles(x86)'] || `${drive}\\Program Files (x86)`
        );
      case 'ProgramData':
        return process.env.ProgramData || `${drive}\\ProgramData`;
      default:
        // This case should not be reached with current constants.
        // Adding a warning helps catch future configuration errors.
        console.warn(`[Security] Unhandled restricted path component: ${r}`);
        return `${drive}\\${r}`;
    }
  });
}

// Common Linux/Unix sensitive directories
const LINUX_RESTRICTED_PATHS = [
  '/etc',
  '/proc',
  '/sys',
  '/root',
  '/boot',
  '/dev',
  '/bin',
  '/sbin',
  '/usr',
  '/lib',
  '/lib64',
  '/opt',
  '/srv',
  '/tmp',
  '/run',
  '/var',
];

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
  const segments = normalized.split(p.sep);

  // Check if any segment is a sensitive directory (e.g. .ssh)
  // We use the same list, but check if the *target* directory itself is sensitive
  // or if we are trying to list inside it.
  // Note: listing /home/user is fine, listing /home/user/.ssh is not.
  if (segments.some((s) => sensitiveSubdirectoriesSet.has(s))) {
    return true;
  }

  if (process.platform === 'win32') {
    // Allow C:\ (to navigate), but block C:\Windows etc.
    const restricted = getWindowsRestrictedPaths();
    return restricted.some(
      (r) =>
        normalized.toLowerCase() === r.toLowerCase() ||
        normalized.toLowerCase().startsWith(r.toLowerCase() + '\\'),
    );
  } else {
    // Allow / (to navigate), but block /etc, /proc, /root, etc.
    return LINUX_RESTRICTED_PATHS.some(
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
    // Block /, and all other restricted paths
    const restricted = ['/', ...LINUX_RESTRICTED_PATHS];
    return restricted.some(
      (r) => normalized === r || normalized.startsWith(r + '/'),
    );
  }
}
