/**
 * @file Provides functionality to scan the filesystem for media files.
 * This module is responsible for finding all supported media files within a
 * given directory structure and organizing them into a hierarchical tree of "albums".
 * @requires fs/promises
 * @requires path
 * @requires ./constants.js
 */
import fs from 'fs/promises';
import path from 'path';
import {
  ALL_SUPPORTED_EXTENSIONS,
  DISK_SCAN_CONCURRENCY,
} from './constants.ts';
import type { Album, MediaFile } from './types';
import { listDriveFiles } from '../main/google-drive-service.ts';
import { ConcurrencyLimiter } from './utils/concurrency-limiter.ts';

// Limit concurrent file system scans to avoid EMFILE errors
// Note: This limit applies only to the `readdir` call itself, not the whole recursion.
const scanLimiter = new ConcurrencyLimiter(DISK_SCAN_CONCURRENCY);

// Optimization: Use a Set for O(1) extension lookups in the hot loop
const SUPPORTED_EXTENSIONS_SET = new Set(ALL_SUPPORTED_EXTENSIONS);

/**
 * Asynchronously and recursively scans a directory to build a hierarchical album structure.
 * An album is created for any directory that contains media files or has subdirectories
 * that contain media files.
 * @param directoryPath - The absolute path to the directory to scan.
 * @returns A promise that resolves to an Album object if media is found, otherwise null.
 */
async function scanDirectoryRecursive(
  directoryPath: string,
): Promise<Album | null> {
  try {
    // Only wrap the readdir call to limit concurrent open file descriptors.
    // We do NOT wrap the recursive calls or the whole function, as that would cause a deadlock
    // (parent holding a slot while waiting for children).
    const items = await scanLimiter.run(() =>
      fs.readdir(directoryPath, { withFileTypes: true }),
    );

    const textures: MediaFile[] = [];
    const childrenPromises: Promise<Album | null>[] = [];

    for (const item of items) {
      const fullPath = path.join(directoryPath, item.name);
      if (item.isDirectory()) {
        childrenPromises.push(scanDirectoryRecursive(fullPath));
      } else if (item.isFile()) {
        const fileExtension = path.extname(item.name).toLowerCase();
        // Bolt Optimization: Set.has is O(1) vs Array.includes O(N)
        if (SUPPORTED_EXTENSIONS_SET.has(fileExtension)) {
          textures.push({ name: item.name, path: fullPath });
        }
      }
    }

    const children = (await Promise.all(childrenPromises)).filter(
      (child): child is Album => child !== null,
    );

    if (textures.length > 0 || children.length > 0) {
      return {
        id: directoryPath,
        name: path.basename(directoryPath),
        textures,
        children,
      };
    }
  } catch (err: unknown) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(
        `[media-scanner.js] Error reading directory ${directoryPath}:`,
        (err as Error).message,
      );
    }
  }
  return null;
}

/**
 * Scans a Google Drive folder.
 * @param folderId - The Google Drive folder ID.
 */
async function scanGoogleDrive(folderId: string): Promise<Album | null> {
  try {
    // Our service already does recursive or flat listing and returns an Album
    const album = await listDriveFiles(folderId);
    // If it's empty, we might want to return null, but for now let's return it
    if (album.textures.length > 0 || album.children.length > 0) {
      return album;
    }
    return null;
  } catch (err) {
    console.error(
      `[media-scanner.js] Error scanning Google Drive folder ${folderId}:`,
      err,
    );
    return null;
  }
}

/**
 * Performs a full scan for each base directory and returns a distinct album structure for each.
 * It no longer merges albums with the same root name from different sources.
 * @param baseMediaDirectories - An array of root directories to scan.
 * @returns A promise that resolves to an array of root album objects. Returns an empty array on failure.
 */
async function performFullMediaScan(
  baseMediaDirectories: string[],
): Promise<Album[]> {
  if (process.env.NODE_ENV !== 'test') {
    console.log(
      `[media-scanner.js] Starting disk scan in directories:`,
      baseMediaDirectories,
    );
  }

  try {
    const scanPromises = baseMediaDirectories.map(async (baseDir) => {
      try {
        if (baseDir.startsWith('gdrive://')) {
          const folderId = baseDir.replace('gdrive://', '');
          return scanGoogleDrive(folderId);
        } else {
          await fs.access(baseDir);
          return scanDirectoryRecursive(baseDir);
        }
      } catch (dirError: unknown) {
        if (process.env.NODE_ENV !== 'test') {
          console.error(
            `[media-scanner.js] Error accessing or scanning directory ${baseDir}: ${(dirError as Error).message}`,
          );
        }
        return null;
      }
    });

    const result = (await Promise.all(scanPromises)).filter(
      (album): album is Album => album !== null,
    );

    if (process.env.NODE_ENV !== 'test') {
      console.log(
        `[media-scanner.js] Found ${result.length} root albums during scan.`,
      );
    }
    return result;
  } catch (e) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[media-scanner.js] Error scanning disk for albums:`, e);
    }
    return [];
  }
}

export { performFullMediaScan };
