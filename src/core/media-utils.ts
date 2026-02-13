import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

import { GDRIVE_PROTOCOL } from './constants.ts';

/**
 * Checks if the given path is a Google Drive path.
 * @param filePath The file path to check.
 */
export function isDrivePath(filePath: string): boolean {
  return filePath.startsWith(GDRIVE_PROTOCOL);
}

/**
 * Extracts the Google Drive file ID from a gdrive:// path.
 * @param filePath The gdrive:// path.
 */
export function getDriveId(filePath: string): string {
  if (!isDrivePath(filePath)) return filePath;
  return filePath.slice(GDRIVE_PROTOCOL.length);
}

/**
 * Creates a gdrive:// path from a file ID.
 * @param fileId The Google Drive file ID.
 */
export function createDrivePath(fileId: string): string {
  return `${GDRIVE_PROTOCOL}${fileId}`;
}

export function getThumbnailCachePath(filePath: string, cacheDir: string) {
  const hash = crypto.createHash('md5').update(filePath).digest('hex');
  return path.join(cacheDir, `${hash}.jpg`);
}

export async function checkThumbnailCache(cacheFile: string): Promise<boolean> {
  try {
    await fs.promises.access(cacheFile);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes a file path, handling platform-specific quirks (e.g., Windows drive letters in URLs).
 * @param filePath The raw file path from the request.
 * @param platform The platform to normalize for (defaults to process.platform).
 */
export function normalizeFilePath(filePath: string, platform: string = process.platform): string {
  let normalized = decodeURIComponent(filePath);
  // On Windows, pathname start with a slash like /C:/Users... Express req.path preserves it.
  if (platform === 'win32' && normalized.startsWith('/')) {
    normalized = normalized.substring(1);
  }
  return normalized;
}
