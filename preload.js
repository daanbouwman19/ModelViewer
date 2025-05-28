const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// specific IPC functionality without exposing the entire ipcRenderer object.
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
  reindexMediaLibrary: () => ipcRenderer.invoke('reindex-media-library')
});
