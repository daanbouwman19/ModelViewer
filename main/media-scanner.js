const fs = require('fs');
const path = require('path');
const { ALL_SUPPORTED_EXTENSIONS } = require('./constants.js');

/**
 * Recursively finds all supported media files in a directory and its subdirectories.
 * @param {string} directoryPath - The path to the directory to scan.
 * @param {Array<Object>} mediaFilesList - Accumulator for media files found.
 * @returns {Array<Object>} A list of objects, each with 'name' and 'path' of a media file.
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
            console.error(`[media-scanner.js] Error reading directory ${directoryPath}:`, err.message);
        }
        // Optionally, could re-throw or handle more gracefully depending on requirements
    }
    return mediaFilesList;
}

/**
 * Performs a full scan of the base media directory to find models and their associated media files.
 * A model is assumed to be a subfolder in the baseMediaDirectory.
 * @param {string} baseMediaDirectory - The root directory to scan for models.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of model objects.
 * Each model object has a 'name' and 'textures' (array of media files).
 * Returns an empty array if the scan fails or no models are found.
 */
async function performFullMediaScan(baseMediaDirectory) {
    if (process.env.NODE_ENV !== 'test') {
        console.log(`[media-scanner.js] Starting disk scan in ${baseMediaDirectory}...`);
    }
    const models = [];
    try {
        if (!fs.existsSync(baseMediaDirectory)) {
            if (process.env.NODE_ENV !== 'test') {
                console.error(`[media-scanner.js] Base media directory not found: ${baseMediaDirectory}`);
            }
            return []; // Return empty if base directory doesn't exist
        }

        const modelFolders = fs.readdirSync(baseMediaDirectory, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const folderName of modelFolders) {
            const modelPath = path.join(baseMediaDirectory, folderName);
            const filesInModelFolder = findAllMediaFiles(modelPath); // Scan this model's folder
            if (filesInModelFolder.length > 0) {
                models.push({ name: folderName, textures: filesInModelFolder });
            }
        }

        if (process.env.NODE_ENV !== 'test') {
            console.log(`[media-scanner.js] Found ${models.length} models during scan.`);
        }
    } catch (e) {
        if (process.env.NODE_ENV !== 'test') {
            console.error(`[media-scanner.js] Error scanning disk for models:`, e);
        }
        return []; // Return empty array on error
    }
    return models;
}

module.exports = {
    // findAllMediaFiles is primarily used internally by performFullMediaScan,
    // but exporting it might be useful for testing or other specific scenarios.
    findAllMediaFiles,
    performFullMediaScan
};
