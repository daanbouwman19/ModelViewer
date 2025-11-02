/**
 * @file Provides functionality to scan the filesystem for media files.
 * This module is responsible for finding all supported media files within a
 * given directory structure and organizing them into "models" (subdirectories).
 * @requires fs
 * @requires path
 * @requires ./constants.js
 */
const fs = require('fs');
const path = require('path');
const { ALL_SUPPORTED_EXTENSIONS } = require('./constants.js');

/**
 * Recursively finds all supported media files in a directory and its subdirectories.
 * It populates a list with objects containing the name and full path of each found file.
 * @param {string} directoryPath - The absolute path to the directory to scan.
 * @param {Array<Object>} [mediaFilesList=[]] - An accumulator array for the media files found. This is used for recursion.
 * @returns {Array<{name: string, path: string}>} A list of objects, where each object represents a media file
 * and has `name` and `path` properties.
 */
function findAllMediaFiles(directoryPath, mediaFilesList = []) {
  try {
    const items = fs.readdirSync(directoryPath, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(directoryPath, item.name);
      if (item.isDirectory()) {
        findAllMediaFiles(fullPath, mediaFilesList); // Recurse into subdirectories
      } else if (item.isFile()) {
        const fileExtension = path.extname(item.name).toLowerCase();
        if (ALL_SUPPORTED_EXTENSIONS.includes(fileExtension)) {
          mediaFilesList.push({ name: item.name, path: fullPath });
        }
      }
    }
  } catch (err) {
    // Log errors only if not in test environment to keep test output clean
    if (process.env.NODE_ENV !== 'test') {
      console.error(
        `[media-scanner.js] Error reading directory ${directoryPath}:`,
        err.message,
      );
    }
    // Optionally, could re-throw or handle more gracefully depending on requirements
  }
  return mediaFilesList;
}

/**
 * Performs a full scan across multiple base media directories to find models and their media files.
 * Models with the same name from different base directories will be merged.
 * @param {string[]} baseMediaDirectories - An array of root directories to scan.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of model objects.
 * Returns an empty array if the scan fails or no models are found.
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
        continue; // Skip non-existent directories
      }

      // --- New: Scan for files directly in the base directory ---
      const rootDirName = path.basename(baseDir);
      const rootFiles = fs.readdirSync(baseDir, { withFileTypes: true })
        .filter(dirent => dirent.isFile() && ALL_SUPPORTED_EXTENSIONS.includes(path.extname(dirent.name).toLowerCase()))
        .map(dirent => ({ name: dirent.name, path: path.join(baseDir, dirent.name) }));

      if (rootFiles.length > 0) {
        if (modelsMap.has(rootDirName)) {
          modelsMap.get(rootDirName).textures.push(...rootFiles);
        } else {
          modelsMap.set(rootDirName, { name: rootDirName, textures: rootFiles });
        }
      }
      // --- End New ---

      const modelFolders = fs
        .readdirSync(baseDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      for (const folderName of modelFolders) {
        const modelPath = path.join(baseDir, folderName);
        const filesInModelFolder = findAllMediaFiles(modelPath);

        if (filesInModelFolder.length > 0) {
          if (modelsMap.has(folderName)) {
            // If model exists, merge textures
            const existingModel = modelsMap.get(folderName);
            existingModel.textures.push(...filesInModelFolder);
          } else {
            // Otherwise, create a new model entry
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
    return []; // Return empty array on error
  }
}

module.exports = {
  // findAllMediaFiles is primarily used internally by performFullMediaScan,
  // but exporting it might be useful for testing or other specific scenarios.
  findAllMediaFiles,
  performFullMediaScan,
};
