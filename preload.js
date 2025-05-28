// ModelViewer-App/preload.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getModels: () => ipcRenderer.invoke('get-models'), // Kept for now, but getModelsWithViewCounts is primary
  loadFileAsDataURL: (filePath) => ipcRenderer.invoke('load-file-as-data-url', filePath),
  recordMediaView: (filePath) => ipcRenderer.invoke('record-media-view', filePath),
  getMediaViewCounts: (filePaths) => ipcRenderer.invoke('get-media-view-counts', filePaths),
  getModelsWithViewCounts: () => ipcRenderer.invoke('get-models-with-view-counts'),

  // --- New IPC function for re-indexing ---
  /**
   * Triggers a re-scan of the media library and updates the cache.
   * Returns the newly indexed models with their view counts.
   * @returns {Promise<Array>}
   */
  reindexMediaLibrary: () => ipcRenderer.invoke('reindex-media-library'),

  // --- New IPC functions for base media directory ---
  /**
   * Opens a dialog for the user to select the base media directory.
   * Saves the selected directory to settings.
   * @returns {Promise<Object>} e.g., { status: 'success', path: '/new/path' } or { status: 'canceled' }
   */
  setBaseMediaDirectory: () => ipcRenderer.invoke('set-base-media-directory'),

  /**
   * Retrieves the currently configured base media directory.
   * @returns {Promise<string|null>} The path to the base media directory, or null if not set.
   */
  getCurrentBaseMediaDirectory: () => ipcRenderer.invoke('get-current-base-media-directory'),

  /**
   * Updates the settings (isRandom, isSelectedForGlobal) for a specific model.
   * @param {Object} settings - An object containing modelName, isRandom, and isSelectedForGlobal.
   * @returns {Promise<Object>} e.g., { success: true } or { success: false, error: 'message' }
   */
  updateModelSettings: (settings) => ipcRenderer.invoke('update-model-settings', settings)
});
