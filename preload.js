const { contextBridge, ipcRenderer } = require('electron');

// --- Workaround for module loading issues in preload ---
const SUPPORTED_IMAGE_EXTENSIONS_PRELOAD = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const SUPPORTED_VIDEO_EXTENSIONS_PRELOAD = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];

try {
    // This require is expected to fail based on previous logs in some bundled environments.
    // If it fails, the catch block will log it once.
    require('./main/constants.js');
    // console.log('[Preload Script] Successfully required ./main/constants.js. Will use its values if different from hardcoded.');
    // Potentially override _PRELOAD versions if require was successful, though for safety,
    // the API below explicitly uses _PRELOAD versions.
} catch (e) {
    console.warn('[Preload Script] Failed to require constants.js from ./main/constants.js. Using hardcoded extensions for electronAPI. Error:', e.message);
}
// --- End Workaround ---

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Loads a file and returns its content as a Data URL or an HTTP URL for large videos.
   * @param {string} filePath - The absolute path to the file.
   * @returns {Promise<{type: 'data-url' | 'http-url' | 'error', url?: string, message?: string}>}
   */
  loadFileAsDataURL: (filePath) => ipcRenderer.invoke('load-file-as-data-url', filePath),

  /**
   * Records that a media file has been viewed.
   * @param {string} filePath - The absolute path to the media file.
   * @returns {Promise<void>}
   */
  recordMediaView: (filePath) => ipcRenderer.invoke('record-media-view', filePath),

  /**
   * Retrieves the view counts for a list of media files.
   * @param {string[]} filePaths - An array of absolute file paths.
   * @returns {Promise<Object<string, number>>} A map of file paths to their view counts.
   */
  getMediaViewCounts: (filePaths) => ipcRenderer.invoke('get-media-view-counts', filePaths),

  /**
   * Retrieves all models along with their media files and view counts.
   * Tries to load from cache first, then scans disk if cache is empty.
   * @returns {Promise<Array<Object>>}
   */
  getModelsWithViewCounts: () => ipcRenderer.invoke('get-models-with-view-counts'),

  /**
   * Triggers a re-scan of the media library, updates the cache,
   * and returns the newly indexed models with their view counts.
   * @returns {Promise<Array<Object>>}
   */
  reindexMediaLibrary: () => ipcRenderer.invoke('reindex-media-library'),

  /**
   * Gets the list of supported image extensions.
   * @returns {Promise<string[]>}
   */
  getImageExtensions: () => Promise.resolve(SUPPORTED_IMAGE_EXTENSIONS_PRELOAD),

  /**
   * Gets the list of supported video extensions.
   * @returns {Promise<string[]>}
   */
  getVideoExtensions: () => Promise.resolve(SUPPORTED_VIDEO_EXTENSIONS_PRELOAD)
});
