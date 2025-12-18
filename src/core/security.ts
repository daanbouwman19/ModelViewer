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
