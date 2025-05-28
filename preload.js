const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadFileAsDataURL: (filePath) => ipcRenderer.invoke('load-file-as-data-url', filePath),
  recordMediaView: (filePath) => ipcRenderer.invoke('record-media-view', filePath),
  getMediaViewCounts: (filePaths) => ipcRenderer.invoke('get-media-view-counts', filePaths),
  getModelsWithViewCounts: () => ipcRenderer.invoke('get-models-with-view-counts'),

  // --- IPC function for re-indexing ---
  /**
   * Triggers a re-scan of the media library and updates the cache.
   * Returns the newly indexed models with their view counts.
   * @returns {Promise<Array>}
   */
  reindexMediaLibrary: () => ipcRenderer.invoke('reindex-media-library')
});
