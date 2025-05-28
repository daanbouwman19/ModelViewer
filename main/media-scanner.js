const fs = require('fs');
const path = require('path');
const { ALL_SUPPORTED_EXTENSIONS } = require('./constants.js'); // Import constants

// Moved from main.js
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
    console.error(`[media-scanner.js] Error reading directory ${directoryPath}:`, err); 
  }
  return mediaFilesList;
}

// New function containing the core disk scanning logic
async function performFullMediaScan(baseMediaDirectory) {
    console.log(`[media-scanner.js] Starting disk scan in ${baseMediaDirectory}...`);
    const models = [];
    try {
        if (!fs.existsSync(baseMediaDirectory)) {
            console.error(`[media-scanner.js] Base media directory not found: ${baseMediaDirectory}`);
            return [];
        }
        const modelFolders = fs.readdirSync(baseMediaDirectory, { withFileTypes: true })
                                  .filter(d => d.isDirectory())
                                  .map(d => d.name);
        for (const f of modelFolders) {
            const p = path.join(baseMediaDirectory, f);
            const files = findAllMediaFiles(p); // Uses the local findAllMediaFiles
            if (files.length > 0) {
                models.push({ name: f, textures: files });
            }
        }
        console.log(`[media-scanner.js] Found ${models.length} models during scan.`);
    } catch (e) {
        console.error(`[media-scanner.js] Error scanning disk for models:`, e);
        return []; // Return empty if scan fails
    }
    return models;
}

module.exports = {
    findAllMediaFiles, // Though primarily used internally by performFullMediaScan
    performFullMediaScan
};
