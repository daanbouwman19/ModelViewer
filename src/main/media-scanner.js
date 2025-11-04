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
import { ALL_SUPPORTED_EXTENSIONS } from './constants.js';

/**
 * @typedef {Object} MediaFile
 * @property {string} name - The name of the media file (e.g., 'image.jpg').
 * @property {string} path - The absolute path to the media file.
 */

/**
 * @typedef {Object} Album
 * @property {string} name - The name of the album, typically the directory name.
 * @property {MediaFile[]} textures - An array of media files directly in this album.
 * @property {Album[]} children - An array of child albums (subdirectories).
 */

/**
 * Asynchronously and recursively scans a directory to build a hierarchical album structure.
 * An album is created for any directory that contains media files or has subdirectories
 * that contain media files.
 * @param {string} directoryPath - The absolute path to the directory to scan.
 * @returns {Promise<Album|null>} A promise that resolves to an Album object if media is found, otherwise null.
 */
async function scanDirectoryRecursive(directoryPath) {
  try {
    const items = await fs.readdir(directoryPath, { withFileTypes: true });
    const textures = [];
    const childrenPromises = [];

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

    const children = (await Promise.all(childrenPromises)).filter(Boolean);

    if (textures.length > 0 || children.length > 0) {
      return {
        name: path.basename(directoryPath),
        textures,
        children,
      };
    }
  } catch (err) {
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
 * Merges the children of two albums.
 * @param {Album[]} targetChildren - The list to merge into.
 * @param {Album[]} sourceChildren - The list to merge from.
 */
function mergeChildren(targetChildren, sourceChildren) {
  const targetChildrenMap = new Map(
    targetChildren.map((child) => [child.name, child]),
  );

  for (const sourceChild of sourceChildren) {
    if (targetChildrenMap.has(sourceChild.name)) {
      const targetChild = targetChildrenMap.get(sourceChild.name);
      targetChild.textures.push(...sourceChild.textures);
      mergeChildren(targetChild.children, sourceChild.children);
    } else {
      targetChildren.push(sourceChild);
    }
  }
}

/**
 * Performs a full scan across multiple base directories to find albums and their associated media files,
 * creating a hierarchical structure. Albums with the same name at the root level will be merged.
 * @param {string[]} baseMediaDirectories - An array of root directories to scan.
 * @returns {Promise<Album[]>} A promise that resolves to an array of root album objects. Returns an empty array on failure.
 */
async function performFullMediaScan(baseMediaDirectories) {
  if (process.env.NODE_ENV !== 'test') {
    console.log(
      `[media-scanner.js] Starting disk scan in directories:`,
      baseMediaDirectories,
    );
  }
  const rootAlbumsMap = new Map();

  try {
    const scanPromises = baseMediaDirectories.map(async (baseDir) => {
      try {
        await fs.access(baseDir);
        return scanDirectoryRecursive(baseDir);
      } catch (dirError) {
        if (process.env.NODE_ENV !== 'test') {
          console.error(
            `[media-scanner.js] Error accessing or scanning directory ${baseDir}: ${dirError.message}`,
          );
        }
        return null;
      }
    });

    const albums = (await Promise.all(scanPromises)).filter(Boolean);

    for (const album of albums) {
      if (rootAlbumsMap.has(album.name)) {
        const existingAlbum = rootAlbumsMap.get(album.name);
        existingAlbum.textures.push(...album.textures);
        mergeChildren(existingAlbum.children, album.children);
      } else {
        rootAlbumsMap.set(album.name, album);
      }
    }

    const result = Array.from(rootAlbumsMap.values());
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
