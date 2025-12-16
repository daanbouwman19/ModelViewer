/**
 * @file Preload script for Electron's renderer process.
 * This script runs in a privileged environment before the renderer's web page is loaded.
 * It uses the `contextBridge` to securely expose a limited and controlled API
 * from the main process to the renderer process. This is essential for maintaining
 * process isolation and security in the Electron application.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type {
  Album,
  SmartPlaylist,
  MediaMetadata,
  MediaLibraryItem,
  MediaDirectory,
} from '../core/types';

import type { FileSystemEntry } from '../core/file-system';

export interface LoadResult {
  type: 'data-url' | 'http-url' | 'error';
  url?: string;
  message?: string;
}

export interface ElectronAPI {
  loadFileAsDataURL: (filePath: string) => Promise<LoadResult>;
  recordMediaView: (filePath: string) => Promise<void>;
  getMediaViewCounts: (
    filePaths: string[],
  ) => Promise<{ [filePath: string]: number }>;
  getAlbumsWithViewCounts: () => Promise<Album[]>;
  reindexMediaLibrary: () => Promise<Album[]>;
  addMediaDirectory: (path?: string) => Promise<string | null>;
  removeMediaDirectory: (directoryPath: string) => Promise<void>;
  setDirectoryActiveState: (
    directoryPath: string,
    isActive: boolean,
  ) => Promise<void>;
  getMediaDirectories: () => Promise<MediaDirectory[]>;
  getSupportedExtensions: () => Promise<{
    images: string[];
    videos: string[];
    all: string[];
  }>;
  getServerPort: () => Promise<number>;
  openInVlc: (
    filePath: string,
  ) => Promise<{ success: boolean; message?: string }>;
  getVideoMetadata: (
    filePath: string,
  ) => Promise<{ duration?: number; error?: string }>;
  listDirectory: (directoryPath: string) => Promise<FileSystemEntry[]>;
  getParentDirectory: (path: string) => Promise<string | null>;

  // Smart Playlists & Metadata
  upsertMetadata: (filePath: string, metadata: MediaMetadata) => Promise<void>;
  getMetadata: (
    filePaths: string[],
  ) => Promise<{ [path: string]: MediaMetadata }>;
  setRating: (filePath: string, rating: number) => Promise<void>;
  createSmartPlaylist: (
    name: string,
    criteria: string,
  ) => Promise<{ id: number }>;
  getSmartPlaylists: () => Promise<SmartPlaylist[]>;
  deleteSmartPlaylist: (id: number) => Promise<void>;
  updateSmartPlaylist: (
    id: number,
    name: string,
    criteria: string,
  ) => Promise<void>;

  getAllMetadataAndStats: () => Promise<MediaLibraryItem[]>;
  extractMetadata: (filePaths: string[]) => Promise<void>;

  // Google Drive
  startGoogleDriveAuth: () => Promise<string>;
  submitGoogleDriveAuthCode: (code: string) => Promise<boolean>;
  addGoogleDriveSource: (folderId: string) => Promise<{ success: boolean; name?: string; error?: string }>;
}

// Expose a controlled API to the renderer process via `window.electronAPI`.
const api: ElectronAPI = {
  /**
   * Asynchronously loads a file from the given path.
   * For smaller files, it returns a Data URL. For larger video files, it returns
   * a URL to the local HTTP server to enable streaming.
   * @param filePath - The absolute path to the file to load.
   * @returns A promise that resolves with the load result object.
   */
  loadFileAsDataURL: (filePath: string) =>
    ipcRenderer.invoke('load-file-as-data-url', filePath),

  /**
   * Sends a request to the main process to record a view for a specific media file.
   * @param filePath - The absolute path to the media file that was viewed.
   * @returns A promise that resolves when the view has been recorded.
   */
  recordMediaView: (filePath: string) =>
    ipcRenderer.invoke('record-media-view', filePath),

  /**
   * Retrieves the view counts for a given list of media files.
   * @param filePaths - An array of absolute paths to the media files.
   * @returns A promise that resolves to an object mapping each file path to its view count.
   */
  getMediaViewCounts: (filePaths: string[]) =>
    ipcRenderer.invoke('get-media-view-counts', filePaths),

  /**
   * Retrieves the complete list of all albums, including their media files and view counts.
   * @returns A promise that resolves to an array of album objects.
   */
  getAlbumsWithViewCounts: () =>
    ipcRenderer.invoke('get-albums-with-view-counts'),

  /**
   * Triggers a full re-scan of the media library on disk.
   * @returns A promise that resolves to the newly scanned array of album objects.
   */
  reindexMediaLibrary: () => ipcRenderer.invoke('reindex-media-library'),

  /**
   * Opens a dialog to select a new media directory, adds it, and triggers a re-index.
   * @returns A promise that resolves to the updated list of albums, or null if the user cancels.
   */
  addMediaDirectory: (path?: string) =>
    ipcRenderer.invoke('add-media-directory', path),

  /**
   * Removes a media directory from the database.
   * @param directoryPath - The path of the directory to remove.
   */
  removeMediaDirectory: (directoryPath: string) =>
    ipcRenderer.invoke('remove-media-directory', directoryPath),

  /**
   * Sets the active state of a media directory.
   * @param directoryPath - The path of the directory.
   * @param isActive - The new active state.
   */
  setDirectoryActiveState: (directoryPath: string, isActive: boolean) =>
    ipcRenderer.invoke('set-directory-active-state', {
      directoryPath,
      isActive,
    }),

  /**
   * Retrieves the list of all configured media directories.
   * @returns A promise that resolves to an array of directory objects.
   */
  getMediaDirectories: () => ipcRenderer.invoke('get-media-directories'),

  /**
   * Retrieves the lists of supported file extensions.
   * @returns A promise that resolves to an object containing arrays of supported extensions.
   */
  getSupportedExtensions: () => ipcRenderer.invoke('get-supported-extensions'),

  /**
   * Retrieves the port the local server is running on.
   * @returns A promise that resolves to the server port.
   */
  getServerPort: () => ipcRenderer.invoke('get-server-port'),

  /**
   * Opens the given file in VLC Media Player.
   * @param filePath - The absolute path to the file to open.
   * @returns A promise that resolves to the result object.
   */
  openInVlc: (filePath: string) => ipcRenderer.invoke('open-in-vlc', filePath),

  /**
   * Retrieves metadata for a video file.
   * @param filePath - The absolute path to the video file.
   * @returns A promise that resolves to the metadata object.
   */
  getVideoMetadata: (filePath: string) =>
    ipcRenderer.invoke('get-video-metadata', filePath),

  /**
   * Lists the contents of a directory.
   * @param directoryPath - The absolute path of the directory.
   * @returns A promise that resolves to an array of file system entries.
   */
  listDirectory: (directoryPath: string) =>
    ipcRenderer.invoke('list-directory', directoryPath),

  /**
   * Gets the parent directory of a given path.
   * @param path - The path to look up.
   * @returns A promise that resolves to the parent path string or null.
   */
  getParentDirectory: (path: string) =>
    ipcRenderer.invoke('get-parent-directory', path),

  upsertMetadata: (filePath: string, metadata: MediaMetadata) =>
    ipcRenderer.invoke('db:upsert-metadata', { filePath, metadata }),

  getMetadata: (filePaths: string[]) =>
    ipcRenderer.invoke('db:get-metadata', filePaths),

  setRating: (filePath: string, rating: number) =>
    ipcRenderer.invoke('db:set-rating', { filePath, rating }),

  createSmartPlaylist: (name: string, criteria: string) =>
    ipcRenderer.invoke('db:create-smart-playlist', { name, criteria }),

  getSmartPlaylists: () => ipcRenderer.invoke('db:get-smart-playlists'),

  deleteSmartPlaylist: (id: number) =>
    ipcRenderer.invoke('db:delete-smart-playlist', id),

  updateSmartPlaylist: (id: number, name: string, criteria: string) =>
    ipcRenderer.invoke('db:update-smart-playlist', { id, name, criteria }),

  getAllMetadataAndStats: () =>
    ipcRenderer.invoke('db:get-all-metadata-and-stats'),

  extractMetadata: (filePaths: string[]) =>
    ipcRenderer.invoke('media:extract-metadata', filePaths),

  // Google Drive
  startGoogleDriveAuth: () => ipcRenderer.invoke('auth:google-drive-start'),
  submitGoogleDriveAuthCode: (code: string) => ipcRenderer.invoke('auth:google-drive-code', code),
  addGoogleDriveSource: (folderId: string) => ipcRenderer.invoke('add-google-drive-source', folderId),
};

contextBridge.exposeInMainWorld('electronAPI', api);
