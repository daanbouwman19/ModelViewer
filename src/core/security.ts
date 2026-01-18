import fs from 'fs/promises';
import path from 'path';
import { getMediaDirectories } from './database.ts';
import { isDrivePath } from './media-utils.ts';
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
// Ensure all initial values are lowercase for case-insensitive checks.
const sensitiveSubdirectoriesSet = new Set(
  Array.from(SENSITIVE_SUBDIRECTORIES).map((d) => d.toLowerCase()),
);

/**
 * Registers a new sensitive file or directory name to block.
 * @param filename - The name of the file or directory.
 */
export function registerSensitiveFile(filename: string): void {
  if (!filename) return;
  sensitiveSubdirectoriesSet.add(filename.toLowerCase());
}

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
        registerSensitiveFile(dir);
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
  // Basic sanity checks: reject empty or obviously malicious paths early.
  if (
    !filePath ||
    filePath.includes('\0') ||
    filePath.includes('\r') ||
    filePath.includes('\n')
  ) {
    return { isAllowed: false, message: 'Invalid file path' };
  }

  const mediaDirectories = await getMediaDirectories();
  const allowedPaths = mediaDirectories.map((d) => d.path);

  let realPath: string | undefined;

  if (isDrivePath(filePath)) {
    // Treat drive paths as logical identifiers (e.g., gdrive://...) rather than filesystem paths.
    // Enforce a conservative format and reject traversal-like segments.
    const trimmed = filePath.trim();
    // Basic scheme check: must look like "<scheme>://..."
    const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(trimmed);
    if (!schemeMatch) {
      return {
        isAllowed: false,
        message: 'Access denied',
      };
    }
    // Disallow any parent-directory segments or backslashes in virtual paths
    if (trimmed.includes('..') || trimmed.includes('\\')) {
      return {
        isAllowed: false,
        message: 'Access denied',
      };
    }

    // Check if the drive path is within allowed media directories
    for (const allowedDir of allowedPaths) {
      if (isDrivePath(allowedDir)) {
        const relative = path.relative(allowedDir, trimmed);
        if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
          // It is inside. Now check for sensitive subdirectories.
          if (hasSensitiveSegments(relative)) {
            console.warn(
              `[Security] Access denied to sensitive file: ${trimmed}`,
            );
            return {
              isAllowed: false,
              message: 'Access to sensitive file denied',
            };
          }
          realPath = trimmed;
          break;
        }
      }
    }
  } else {
    // For non-drive paths, resolve relative to each allowed media directory.
    // We normalize both the allowed directory and the candidate path and then
    // enforce that the candidate is contained within the allowed root.
    for (const allowedDir of allowedPaths) {
      // Skip misconfigured/empty roots defensively
      if (!allowedDir || !String(allowedDir).trim()) {
        continue;
      }

      try {
        // Normalize and resolve the allowed directory itself to a real absolute root
        const allowedRootReal = await fs.realpath(path.resolve(allowedDir));

        const candidateRealPath = await fs.realpath(
          path.resolve(allowedRootReal, filePath),
        );

        // Fast containment check using prefix with trailing separator
        const normalizedRoot = allowedRootReal.endsWith(path.sep)
          ? allowedRootReal
          : allowedRootReal + path.sep;

        if (
          candidateRealPath === allowedRootReal ||
          candidateRealPath.startsWith(normalizedRoot)
        ) {
          const relative = path.relative(allowedRootReal, candidateRealPath);
          if (hasSensitiveSegments(relative)) {
            console.warn(
              `[Security] Access denied to sensitive file: ${candidateRealPath}`,
            );
            return {
              isAllowed: false,
              message: 'Access to sensitive file denied',
            };
          }

          realPath = candidateRealPath;
          break;
        }
      } catch (error) {
        // Treat missing files or access errors as "Access denied" without logging spam for mundane checks.
        if (!isErrnoException(error) || error.code !== 'ENOENT') {
          console.warn(
            `[Security] File check failed for ${filePath}: ${(error as Error).message}`,
          );
        }
        // Try next allowedDir, if any
      }
    }

    if (!realPath) {
      // No allowed directory produced a valid real path
      console.warn(
        `[Security] Access denied to file outside media directories: (resolved from ${filePath})`,
      );
      return {
        isAllowed: false,
        message: 'Access denied',
      };
    }
  }

  return { isAllowed: true, realPath };
}

/**
 * Checks if a relative path contains sensitive segments.
 */
function hasSensitiveSegments(relativePath: string): boolean {
  const segments = relativePath.split(path.sep);
  return segments.some(
    (segment) =>
      sensitiveSubdirectoriesSet.has(segment.toLowerCase()) ||
      segment.toLowerCase().startsWith('.env'),
  );
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
  if (segments.some((s) => sensitiveSubdirectoriesSet.has(s.toLowerCase()))) {
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
  const segments = normalized.split(p.sep);

  // Check against sensitive subdirectories (e.g. .ssh, .env)
  // This prevents adding a sensitive directory (like ~/.ssh) as a media root
  if (segments.some((s) => sensitiveSubdirectoriesSet.has(s.toLowerCase()))) {
    return true;
  }

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
