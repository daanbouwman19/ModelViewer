import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

import {
  GDRIVE_PROTOCOL,
  SUPPORTED_IMAGE_EXTENSIONS_SET,
  SUPPORTED_VIDEO_EXTENSIONS_SET,
} from './constants.js';

const KNOWN_MIME_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

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

export function getMimeType(filePath: string): string {
  if (isDrivePath(filePath)) {
    return 'application/octet-stream';
  }

  // Bolt Optimization: Use Set for O(1) lookup and avoid substring(1) until needed
  const ext = path.extname(filePath).toLowerCase();

  if (SUPPORTED_IMAGE_EXTENSIONS_SET.has(ext)) {
    const extNoDot = ext.slice(1);
    return KNOWN_MIME_TYPES[extNoDot] || `image/${extNoDot}`;
  }
  if (SUPPORTED_VIDEO_EXTENSIONS_SET.has(ext)) {
    const extNoDot = ext.slice(1);
    return KNOWN_MIME_TYPES[extNoDot] || `video/${extNoDot}`;
  }
  return 'application/octet-stream';
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
