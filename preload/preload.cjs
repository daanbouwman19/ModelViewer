"use strict";
const electron = require("electron");
const api = {
  /**
   * Asynchronously loads a file from the given path.
   * For smaller files, it returns a Data URL. For larger video files, it returns
   * a URL to the local HTTP server to enable streaming.
   * @param filePath - The absolute path to the file to load.
   * @returns A promise that resolves with the load result object.
   */
  loadFileAsDataURL: (filePath) => electron.ipcRenderer.invoke("load-file-as-data-url", filePath),
  /**
   * Sends a request to the main process to record a view for a specific media file.
   * @param filePath - The absolute path to the media file that was viewed.
   * @returns A promise that resolves when the view has been recorded.
   */
  recordMediaView: (filePath) => electron.ipcRenderer.invoke("record-media-view", filePath),
  /**
   * Retrieves the view counts for a given list of media files.
   * @param filePaths - An array of absolute paths to the media files.
   * @returns A promise that resolves to an object mapping each file path to its view count.
   */
  getMediaViewCounts: (filePaths) => electron.ipcRenderer.invoke("get-media-view-counts", filePaths),
  /**
   * Retrieves the complete list of all albums, including their media files and view counts.
   * @returns A promise that resolves to an array of album objects.
   */
  getAlbumsWithViewCounts: () => electron.ipcRenderer.invoke("get-albums-with-view-counts"),
  /**
   * Triggers a full re-scan of the media library on disk.
   * @returns A promise that resolves to the newly scanned array of album objects.
   */
  reindexMediaLibrary: () => electron.ipcRenderer.invoke("reindex-media-library"),
  /**
   * Opens a dialog to select a new media directory, adds it, and triggers a re-index.
   * @returns A promise that resolves to the updated list of albums, or null if the user cancels.
   */
  addMediaDirectory: (path) => electron.ipcRenderer.invoke("add-media-directory", path),
  /**
   * Removes a media directory from the database.
   * @param directoryPath - The path of the directory to remove.
   */
  removeMediaDirectory: (directoryPath) => electron.ipcRenderer.invoke("remove-media-directory", directoryPath),
  /**
   * Sets the active state of a media directory.
   * @param directoryPath - The path of the directory.
   * @param isActive - The new active state.
   */
  setDirectoryActiveState: (directoryPath, isActive) => electron.ipcRenderer.invoke("set-directory-active-state", {
    directoryPath,
    isActive
  }),
  /**
   * Retrieves the list of all configured media directories.
   * @returns A promise that resolves to an array of directory objects.
   */
  getMediaDirectories: () => electron.ipcRenderer.invoke("get-media-directories"),
  /**
   * Retrieves the lists of supported file extensions.
   * @returns A promise that resolves to an object containing arrays of supported extensions.
   */
  getSupportedExtensions: () => electron.ipcRenderer.invoke("get-supported-extensions"),
  /**
   * Retrieves the port the local server is running on.
   * @returns A promise that resolves to the server port.
   */
  getServerPort: () => electron.ipcRenderer.invoke("get-server-port"),
  /**
   * Opens the given file in VLC Media Player.
   * @param filePath - The absolute path to the file to open.
   * @returns A promise that resolves to the result object.
   */
  openInVlc: (filePath) => electron.ipcRenderer.invoke("open-in-vlc", filePath),
  /**
   * Lists the contents of a directory.
   * @param directoryPath - The absolute path of the directory.
   * @returns A promise that resolves to an array of file system entries.
   */
  listDirectory: (directoryPath) => electron.ipcRenderer.invoke("list-directory", directoryPath),
  /**
   * Gets the parent directory of a given path.
   * @param path - The path to look up.
   * @returns A promise that resolves to the parent path string or null.
   */
  getParentDirectory: (path) => electron.ipcRenderer.invoke("get-parent-directory", path)
};
electron.contextBridge.exposeInMainWorld("electronAPI", api);
