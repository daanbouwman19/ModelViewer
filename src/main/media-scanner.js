/**
 * @file Provides functionality to scan the filesystem for media files.
 * This module is responsible for finding all supported media files within a
 * given directory structure and organizing them into a hierarchical tree of "albums".
 * @requires fs
 * @requires path
 * @requires ./constants.js
 */
import fs from 'fs';
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
 * Recursively scans a directory to build a hierarchical album structure.
 * An album is created for any directory that contains media files or has subdirectories
 * that contain media files.
 * @param {string} directoryPath - The absolute path to the directory to scan.
 * @returns {Album|null} An Album object if media is found, otherwise null.
 */
function scanDirectoryRecursive(directoryPath) {
  try {
    const items = fs.readdirSync(directoryPath, { withFileTypes: true });
    const textures = [];
    const children = [];

    for (const item of items) {
      const fullPath = path.join(directoryPath, item.name);
      if (item.isDirectory()) {
        const childAlbum = scanDirectoryRecursive(fullPath);
        if (childAlbum) {
          children.push(childAlbum);
        }
      } else if (item.isFile()) {
        const fileExtension = path.extname(item.name).toLowerCase();
        if (ALL_SUPPORTED_EXTENSIONS.includes(fileExtension)) {
          textures.push({ name: item.name, path: fullPath });
        }
      }
    }

    // Only create an album if it contains textures directly or has children with textures.
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
      // If a child with the same name exists, merge their textures and recursively merge their children.
      const targetChild = targetChildrenMap.get(sourceChild.name);
      targetChild.textures.push(...sourceChild.textures);
      mergeChildren(targetChild.children, sourceChild.children);
    } else {
      // Otherwise, add the new child.
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
    for (const baseDir of baseMediaDirectories) {
      try {
        if (!fs.existsSync(baseDir)) {
          if (process.env.NODE_ENV !== 'test') {
            console.error(
              `[media-scanner.js] Media directory not found: ${baseDir}`,
            );
          }
          continue;
        }

        const album = scanDirectoryRecursive(baseDir);
        if (album) {
          if (rootAlbumsMap.has(album.name)) {
            // Merge with existing root album
            const existingAlbum = rootAlbumsMap.get(album.name);
            existingAlbum.textures.push(...album.textures);
            mergeChildren(existingAlbum.children, album.children);
          } else {
            rootAlbumsMap.set(album.name, album);
          }
        }
      } catch (dirError) {
        if (process.env.NODE_ENV !== 'test') {
          console.error(
            `[media-scanner.js] Error scanning directory ${baseDir}: ${dirError.message}`,
          );
        }
        // Continue to the next directory
      }
    }

    const albums = Array.from(rootAlbumsMap.values());
    if (process.env.NODE_ENV !== 'test') {
      console.log(
        `[media-scanner.js] Found ${albums.length} root albums during scan.`,
      );
    }
    return albums;
  } catch (e) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[media-scanner.js] Error scanning disk for albums:`, e);
    }
    return [];
  }
}

export { performFullMediaScan };
