/**
 * @file Preload script for Electron's renderer process.
 * This script runs in a privileged environment before the renderer's web page is loaded.
 * It uses the `contextBridge` to securely expose a limited and controlled API
 * from the main process to the renderer process. This is essential for maintaining
 * process isolation and security in the Electron application.
 * @requires electron
 */
const { contextBridge, ipcRenderer } = require('electron');

/**
 * @typedef {Object} MediaFile
 * @property {string} name - The name of the media file.
 * @property {string} path - The absolute path to the media file.
 * @property {number} [viewCount] - The number of times the file has been viewed.
 */

/**
 * @typedef {Object} Model
 * @property {string} name - The name of the model.
 * @property {Array<MediaFile>} textures - The media files associated with the model.
 */

/**
 * @typedef {Object} LoadResult
 * @property {'data-url' | 'http-url' | 'error'} type - The type of the result.
 * @property {string} [url] - The Data URL or HTTP URL of the file.
 * @property {string} [message] - An error message if the type is 'error'.
 */

// Expose a controlled API to the renderer process via `window.electronAPI`.
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Asynchronously loads a file from the given path.
   * For smaller files, it returns a Data URL. For larger video files, it returns
   * a URL to the local HTTP server to enable streaming.
   * @param {string} filePath - The absolute path to the file to load.
   * @returns {Promise<LoadResult>} A promise that resolves with the load result object.
   */
  loadFileAsDataURL: (filePath) =>
    ipcRenderer.invoke('load-file-as-data-url', filePath),

  /**
   * Sends a request to the main process to record a view for a specific media file.
   * This typically increments a counter in the database.
   * @param {string} filePath - The absolute path to the media file that was viewed.
   * @returns {Promise<void>} A promise that resolves when the view has been recorded.
   */
  recordMediaView: (filePath) =>
    ipcRenderer.invoke('record-media-view', filePath),

  /**
   * Retrieves the view counts for a given list of media files.
   * @param {string[]} filePaths - An array of absolute paths to the media files.
   * @returns {Promise<Object<string, number>>} A promise that resolves to an object
   * mapping each file path to its corresponding view count.
   */
  getMediaViewCounts: (filePaths) =>
    ipcRenderer.invoke('get-media-view-counts', filePaths),

  /**
   * Retrieves the complete list of all models, including their associated media files
   * and the view count for each file. It attempts to load from a cache first and
   * will perform a disk scan if the cache is not available.
   * @returns {Promise<Array<Model>>} A promise that resolves to an array of model objects.
   */
  getModelsWithViewCounts: () =>
    ipcRenderer.invoke('get-models-with-view-counts'),

  /**
   * Triggers a full re-scan of the media library on disk. This rebuilds the
   * file index cache and returns the new, updated list of models.
   * @returns {Promise<Array<Model>>} A promise that resolves to the newly scanned array of model objects.
   */
  reindexMediaLibrary: () => ipcRenderer.invoke('reindex-media-library'),

  /**
   * Opens a dialog to select a new media directory, adds it to the database,
   * and triggers a full re-index.
   * @returns {Promise<Array<Model>|null>} A promise that resolves to the updated
   * list of models, or null if the user cancels the dialog.
   */
  addMediaDirectory: () => ipcRenderer.invoke('add-media-directory'),

  /**
   * Removes a media directory from the database.
   * @param {string} directoryPath - The path of the directory to remove.
   * @returns {Promise<void>}
   */
  removeMediaDirectory: (directoryPath) => ipcRenderer.invoke('remove-media-directory', directoryPath),

  /**
   * Sets the active state of a media directory.
   * @param {string} directoryPath - The path of the directory.
   * @param {boolean} isActive - The new active state.
   * @returns {Promise<void>}
   */
  setDirectoryActiveState: (directoryPath, isActive) => ipcRenderer.invoke('set-directory-active-state', { directoryPath, isActive }),

  /**
   * Retrieves the list of all media directories.
   * @returns {Promise<{path: string, isActive: boolean}[]>} A promise that resolves to an array of directory objects.
   */
  getMediaDirectories: () => ipcRenderer.invoke('get-media-directories'),
});
