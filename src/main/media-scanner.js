/**
 * @file Provides functionality to scan the filesystem for media files.
 * This module is responsible for finding all supported media files within a
 * given directory structure and organizing them into "models".
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
 * @typedef {Object} Model
 * @property {string} name - The name of the model, typically the subdirectory name.
 * @property {MediaFile[]} textures - An array of media files belonging to this model.
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
 * Performs a full scan across multiple base directories to find models and their associated media files.
 * Models with the same name from different directories will have their media files merged.
 * @param {string[]} baseMediaDirectories - An array of root directories to scan.
 * @returns {Promise<Model[]>} A promise that resolves to an array of model objects. Returns an empty array on failure.
 */
async function performFullMediaScan(baseMediaDirectories) {
  if (process.env.NODE_ENV !== 'test') {
    console.log(
      `[media-scanner.js] Starting disk scan in directories:`,
      baseMediaDirectories,
    );
  }
  const modelsMap = new Map();
  try {
    for (const baseDir of baseMediaDirectories) {
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
        if (modelsMap.has(rootDirName)) {
          modelsMap.get(rootDirName).textures.push(...rootFiles);
        } else {
          modelsMap.set(rootDirName, {
            name: rootDirName,
            textures: rootFiles,
          });
        }
      }

      const modelFolders = fs
        .readdirSync(baseDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      for (const folderName of modelFolders) {
        const modelPath = path.join(baseDir, folderName);
        const filesInModelFolder = findAllMediaFiles(modelPath);

        if (filesInModelFolder.length > 0) {
          if (modelsMap.has(folderName)) {
            const existingModel = modelsMap.get(folderName);
            existingModel.textures.push(...filesInModelFolder);
          } else {
            modelsMap.set(folderName, {
              name: folderName,
              textures: filesInModelFolder,
            });
          }
        }
      }
    }
    const models = Array.from(modelsMap.values());
    if (process.env.NODE_ENV !== 'test') {
      console.log(
        `[media-scanner.js] Found ${models.length} models during scan.`,
      );
    }
    return models;
  } catch (e) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[media-scanner.js] Error scanning disk for models:`, e);
    }
    return [];
  }
}

export { findAllMediaFiles, performFullMediaScan };
