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
import { ALL_SUPPORTED_EXTENSIONS } from './constants';

export interface MediaFile {
  name: string;
  path: string;
  viewCount?: number;
}

export interface Album {
  name: string;
  textures: MediaFile[];
  children: Album[];
}

/**
 * Asynchronously and recursively scans a directory to build a hierarchical album structure.
 * An album is created for any directory that contains media files or has subdirectories
 * that contain media files.
 * @param directoryPath - The absolute path to the directory to scan.
 * @returns A promise that resolves to an Album object if media is found, otherwise null.
 */
async function scanDirectoryRecursive(directoryPath: string): Promise<Album | null> {
  try {
    const items = await fs.readdir(directoryPath, { withFileTypes: true });
    const textures: MediaFile[] = [];
    const childrenPromises: Promise<Album | null>[] = [];

    for (const item of items) {
      const fullPath = path.join(directoryPath, item.name);
      if (item.isDirectory()) {
        childrenPromises.push(scanDirectoryRecursive(fullPath));
      } else if (item.isFile()) {
        const fileExtension = path.extname(item.name).toLowerCase();
        if (ALL_SUPPORTED_EXTENSIONS.includes(fileExtension)) {
          textures.push({ name: item.name, path: fullPath });
        }
      }
    }

    const children = (await Promise.all(childrenPromises)).filter((child): child is Album => child !== null);

    if (textures.length > 0 || children.length > 0) {
      return {
        name: path.basename(directoryPath),
        textures,
        children,
      };
    }
  } catch (err: any) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(
        `[media-scanner.js] Error reading directory ${directoryPath}:`,
        err.message,
      );
    }
  }
  return null;
}

/**
 * Performs a full scan for each base directory and returns a distinct album structure for each.
 * It no longer merges albums with the same root name from different sources.
 * @param baseMediaDirectories - An array of root directories to scan.
 * @returns A promise that resolves to an array of root album objects. Returns an empty array on failure.
 */
async function performFullMediaScan(baseMediaDirectories: string[]): Promise<Album[]> {
  if (process.env.NODE_ENV !== 'test') {
    console.log(
      `[media-scanner.js] Starting disk scan in directories:`,
      baseMediaDirectories,
    );
  }

  try {
    const scanPromises = baseMediaDirectories.map(async (baseDir) => {
      try {
        await fs.access(baseDir);
        return scanDirectoryRecursive(baseDir);
      } catch (dirError: any) {
        if (process.env.NODE_ENV !== 'test') {
          console.error(
            `[media-scanner.js] Error accessing or scanning directory ${baseDir}: ${dirError.message}`,
          );
        }
        return null;
      }
    });

    const result = (await Promise.all(scanPromises)).filter((album): album is Album => album !== null);

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
