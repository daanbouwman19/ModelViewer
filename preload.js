const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getModels: () => ipcRenderer.invoke('get-models'),
  loadFileAsDataURL: (filePath) => ipcRenderer.invoke('load-file-as-data-url', filePath),
  recordMediaView: (filePath) => ipcRenderer.invoke('record-media-view', filePath),
  getMediaViewCounts: (filePaths) => ipcRenderer.invoke('get-media-view-counts', filePaths),
  getModelsWithViewCounts: () => ipcRenderer.invoke('get-models-with-view-counts'),
  reindexMediaLibrary: () => ipcRenderer.invoke('reindex-media-library')
});
