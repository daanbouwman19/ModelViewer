/**
 * @file Provides functionality to scan the filesystem for media files.
 * This module is responsible for finding all supported media files within a
 * given directory structure and organizing them into "albums".
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
 * @property {string} name - The name of the album, typically the subdirectory name.
 * @property {MediaFile[]} textures - An array of media files belonging to this album.
 */

/**
 * Recursively finds all supported media files in a directory and its subdirectories.
 * @param {string} directoryPath - The absolute path to the directory to scan.
 * @param {MediaFile[]} [mediaFilesList=[]] - An accumulator array for the media files found (used for recursion).
 * @returns {MediaFile[]} A list of media file objects.
 */
function findAllMediaFiles(directoryPath, mediaFilesList = []) {
  try {
    const items = fs.readdirSync(directoryPath, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(directoryPath, item.name);
      if (item.isDirectory()) {
        findAllMediaFiles(fullPath, mediaFilesList);
      } else if (item.isFile()) {
        const fileExtension = path.extname(item.name).toLowerCase();
        if (ALL_SUPPORTED_EXTENSIONS.includes(fileExtension)) {
          mediaFilesList.push({ name: item.name, path: fullPath });
        }
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(
        `[media-scanner.js] Error reading directory ${directoryPath}:`,
        err.message,
      );
    }
  }
  return mediaFilesList;
}

/**
 * Performs a full scan across multiple base directories to find albums and their associated media files.
 * Albums with the same name from different directories will have their media files merged.
 * @param {string[]} baseMediaDirectories - An array of root directories to scan.
 * @returns {Promise<Album[]>} A promise that resolves to an array of album objects. Returns an empty array on failure.
 */
async function performFullMediaScan(baseMediaDirectories) {
  if (process.env.NODE_ENV !== 'test') {
    console.log(
      `[media-scanner.js] Starting disk scan in directories:`,
      baseMediaDirectories,
    );
  }
  const albumsMap = new Map();
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

        const rootDirName = path.basename(baseDir);
        const rootFiles = fs
          .readdirSync(baseDir, { withFileTypes: true })
          .filter(
            (dirent) =>
              dirent.isFile() &&
              ALL_SUPPORTED_EXTENSIONS.includes(
                path.extname(dirent.name).toLowerCase(),
              ),
          )
          .map((dirent) => ({
            name: dirent.name,
            path: path.join(baseDir, dirent.name),
          }));

        if (rootFiles.length > 0) {
          if (albumsMap.has(rootDirName)) {
            albumsMap.get(rootDirName).textures.push(...rootFiles);
          } else {
            albumsMap.set(rootDirName, {
              name: rootDirName,
              textures: rootFiles,
            });
          }
        }

        const albumFolders = fs
          .readdirSync(baseDir, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => dirent.name);

        for (const folderName of albumFolders) {
          const albumPath = path.join(baseDir, folderName);
          const filesInAlbumFolder = findAllMediaFiles(albumPath);

          if (filesInAlbumFolder.length > 0) {
            if (albumsMap.has(folderName)) {
              const existingAlbum = albumsMap.get(folderName);
              existingAlbum.textures.push(...filesInAlbumFolder);
            } else {
              albumsMap.set(folderName, {
                name: folderName,
                textures: filesInAlbumFolder,
              });
            }
          }
        }
      } catch (dirError) {
        if (process.env.NODE_ENV !== 'test') {
          console.error(
            `[media-scanner.js] Error scanning directory ${baseDir}: ${dirError.message}`,
          );
        }
        continue; // Continue to the next directory
      }
    }
    const albums = Array.from(albumsMap.values());
    if (process.env.NODE_ENV !== 'test') {
      console.log(
        `[media-scanner.js] Found ${albums.length} albums during scan.`,
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

export { findAllMediaFiles, performFullMediaScan };
