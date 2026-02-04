import fs from 'fs/promises';
import path from 'path';
import { getMediaDirectories } from './database.ts';
import { MediaDirectory } from './types.ts';
import { isDrivePath } from './media-utils.ts';
import { ConcurrencyLimiter } from './utils/concurrency-limiter.ts';
import { MAX_PATH_LENGTH, DISK_SCAN_CONCURRENCY } from './constants.ts';
import { hasSensitiveSegments } from './utils/sensitive-paths.ts';

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

/**
 * Validates if a file path is within the allowed media directories.
 * @param filePath - The path to validate.
 * @returns Authorization result containing allowed status, resolved path, or error/denied message.
 */
/**
 * Filters a list of file paths, returning only those authorized.
 * Fetches media directories once to optimize performance.
 */
export async function filterAuthorizedPaths(
  filePaths: string[],
): Promise<string[]> {
  const mediaDirectories = await getMediaDirectories();
  const limiter = new ConcurrencyLimiter(DISK_SCAN_CONCURRENCY);

  const results = await Promise.all(
    filePaths.map((p) =>
      limiter.run(async () => {
        const auth = await authorizeFilePath(p, mediaDirectories);
        return auth.isAllowed ? p : null;
      }),
    ),
  );
  return results.filter((p): p is string => p !== null);
}

export async function authorizeFilePath(
  filePath: string,
  mediaDirectories?: MediaDirectory[],
): Promise<AuthorizationResult> {
  const inputResult = validateInput(filePath);
  if (inputResult) return inputResult;

  const dirs = mediaDirectories || (await getMediaDirectories());
  const allowedPaths = dirs.map((d) => d.path);

  if (isDrivePath(filePath)) {
    return (
      authorizeVirtualPath(filePath, allowedPaths) ?? {
        isAllowed: false,
        message: 'Access denied',
      }
    );
  }

  const localResult = await authorizeLocalPath(filePath, allowedPaths);
  if (localResult) return localResult;

  // No allowed directory produced a valid real path
  console.warn(
    `[Security] Access denied to file outside media directories: (resolved from ${filePath})`,
  );
  return {
    isAllowed: false,
    message: 'Access denied',
  };
}

/**
 * Basic sanity checks for file paths.
 */
function validateInput(filePath: string): AuthorizationResult | null {
  if (
    !filePath ||
    filePath.includes('\0') ||
    filePath.includes('\r') ||
    filePath.includes('\n')
  ) {
    return { isAllowed: false, message: 'Invalid file path' };
  }

  if (filePath.length > MAX_PATH_LENGTH) {
    console.warn(
      `[Security] Rejected overly long file path (${filePath.length} chars)`,
    );
    return { isAllowed: false, message: 'Invalid file path (too long)' };
  }

  return null;
}

/**
 * Handles validation for virtual/drive paths (e.g., gdrive://).
 */
function authorizeVirtualPath(
  filePath: string,
  allowedPaths: string[],
): AuthorizationResult | null {
  const trimmed = filePath.trim();
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(trimmed);

  if (!schemeMatch || trimmed.includes('..') || trimmed.includes('\\')) {
    return null;
  }

  for (const allowedDir of allowedPaths) {
    if (isDrivePath(allowedDir)) {
      // [FIX] For Google Drive, path.relative is unreliable on Windows/Node because of the URI scheme.
      // Instead, we check if the file path starts with the allowed directory prefix.
      // Since GDrive paths are flat IDs (gdrive://<ID>), and usually the allowed dir is 'gdrive://',
      // a simple startsWith check is sufficient and safe.
      if (trimmed.startsWith(allowedDir)) {
        return { isAllowed: true, realPath: trimmed };
      }

      const relative = path.relative(allowedDir, trimmed);
      if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
        if (hasSensitiveSegments(relative)) {
          console.warn(
            `[Security] Access denied to sensitive file: ${trimmed}`,
          );
          return {
            isAllowed: false,
            message: 'Access to sensitive file denied',
          };
        }
        return { isAllowed: true, realPath: trimmed };
      }
    }
  }
  return null;
}

/**
 * Handles validation for local filesystem paths.
 */
async function authorizeLocalPath(
  filePath: string,
  allowedPaths: string[],
): Promise<AuthorizationResult | null> {
  // Normalize separators and collapse any "." / ".." segments for consistent handling.
  const safePath = path.normalize(filePath);
  const isAbsolute = path.isAbsolute(safePath);

  if (!isAbsolute) {
    // After normalization, reject any path that still attempts to traverse upwards.
    if (
      safePath === '..' ||
      safePath.startsWith('..' + path.sep) ||
      safePath.includes('/..') ||
      safePath.includes('\\..')
    ) {
      return {
        isAllowed: false,
        message: 'Access denied',
      };
    }

    // On Windows, also defensively reject drive-like prefixes in a "relative" path.
    if (
      process.platform === 'win32' &&
      /^[a-zA-Z]:[\\/]|^\\\\/.test(safePath)
    ) {
      return {
        isAllowed: false,
        message: 'Access denied',
      };
    }
  }

  for (const allowedDir of allowedPaths) {
    if (!allowedDir || !String(allowedDir).trim() || isDrivePath(allowedDir)) {
      continue;
    }

    const result = await validatePathAgainstDir(allowedDir, safePath);
    if (result) {
      return result;
    }
  }
  return null;
}

/**
 * Tries to resolve and validate a path against a specific allowed directory.
 */
export async function validatePathAgainstDir(
  allowedDir: string,
  safePath: string,
): Promise<AuthorizationResult | null> {
  try {
    const allowedRootReal = await fs.realpath(path.resolve(allowedDir));

    // Always resolve candidate paths relative to the allowed root so that
    // the final real path can be strictly contained within this root.
    const candidateResolved = path.resolve(allowedRootReal, safePath);
    const candidateRealPath = await fs.realpath(candidateResolved);

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
      return { isAllowed: true, realPath: candidateRealPath };
    }
  } catch (error) {
    if (!isErrnoException(error) || error.code !== 'ENOENT') {
      console.warn(
        `[Security] File check failed for ${safePath}: ${(error as Error).message}`,
      );
    }
  }
  return null;
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
