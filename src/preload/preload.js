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
 * @typedef {import('../main/media-scanner.js').Album} Album
 * @typedef {import('../main/media-scanner.js').MediaFile} MediaFile
 */

/**
 * @typedef {Object} LoadResult
 * @property {'data-url' | 'http-url' | 'error'} type - The type of the result.
 * @property {string} [url] - The Data URL or HTTP URL of the file.
 * @property {string} [message] - An error message if the type is 'error'.
 */

/**
 * @typedef {Object} ElectronAPI
 * @property {(filePath: string) => Promise<LoadResult>} loadFileAsDataURL
 * @property {(filePath: string) => Promise<void>} recordMediaView
 * @property {(filePaths: string[]) => Promise<{[filePath: string]: number}>} getMediaViewCounts
 * @property {() => Promise<Album[]>} getAlbumsWithViewCounts
 * @property {() => Promise<Album[]>} reindexMediaLibrary
 * @property {() => Promise<Album[] | null>} addMediaDirectory
 * @property {(directoryPath: string) => Promise<void>} removeMediaDirectory
 * @property {(directoryPath: string, isActive: boolean) => Promise<void>} setDirectoryActiveState
 * @property {() => Promise<{path: string, isActive: boolean}[]>} getMediaDirectories
 * @property {() => Promise<{images: string[], videos: string[], all: string[]}>} getSupportedExtensions
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
   * @param {string} filePath - The absolute path to the media file that was viewed.
   * @returns {Promise<void>} A promise that resolves when the view has been recorded.
   */
  recordMediaView: (filePath) =>
    ipcRenderer.invoke('record-media-view', filePath),

  /**
   * Retrieves the view counts for a given list of media files.
   * @param {string[]} filePaths - An array of absolute paths to the media files.
   * @returns {Promise<Object<string, number>>} A promise that resolves to an object mapping each file path to its view count.
   */
  getMediaViewCounts: (filePaths) =>
    ipcRenderer.invoke('get-media-view-counts', filePaths),

  /**
   * Retrieves the complete list of all albums, including their media files and view counts.
   * @returns {Promise<Album[]>} A promise that resolves to an array of album objects.
   */
  getAlbumsWithViewCounts: () =>
    ipcRenderer.invoke('get-albums-with-view-counts'),

  /**
   * Triggers a full re-scan of the media library on disk.
   * @returns {Promise<Album[]>} A promise that resolves to the newly scanned array of album objects.
   */
  reindexMediaLibrary: () => ipcRenderer.invoke('reindex-media-library'),

  /**
   * Opens a dialog to select a new media directory, adds it, and triggers a re-index.
   * @returns {Promise<Album[]|null>} A promise that resolves to the updated list of albums, or null if the user cancels.
   */
  addMediaDirectory: () => ipcRenderer.invoke('add-media-directory'),

  /**
   * Removes a media directory from the database.
   * @param {string} directoryPath - The path of the directory to remove.
   * @returns {Promise<void>}
   */
  removeMediaDirectory: (directoryPath) =>
    ipcRenderer.invoke('remove-media-directory', directoryPath),

  /**
   * Sets the active state of a media directory.
   * @param {string} directoryPath - The path of the directory.
   * @param {boolean} isActive - The new active state.
   * @returns {Promise<void>}
   */
  setDirectoryActiveState: (directoryPath, isActive) =>
    ipcRenderer.invoke('set-directory-active-state', {
      directoryPath,
      isActive,
    }),

  /**
   * Retrieves the list of all configured media directories.
   * @returns {Promise<{path: string, isActive: boolean}[]>} A promise that resolves to an array of directory objects.
   */
  getMediaDirectories: () => ipcRenderer.invoke('get-media-directories'),

  /**
   * Retrieves the lists of supported file extensions.
   * @returns {Promise<{images: string[], videos: string[], all: string[]}>} A promise that resolves to an object containing arrays of supported extensions.
   */
  getSupportedExtensions: () => ipcRenderer.invoke('get-supported-extensions'),

  /**
   * Retrieves the port the local server is running on.
   * @returns {Promise<number>} A promise that resolves to the server port.
   */
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
});
