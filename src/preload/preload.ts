/**
 * @file Preload script for Electron's renderer process.
 * This script runs in a privileged environment before the renderer's web page is loaded.
 * It uses the `contextBridge` to securely expose a limited and controlled API
 * from the main process to the renderer process. This is essential for maintaining
 * process isolation and security in the Electron application.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { Album } from '../core/types';

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
  getMediaDirectories: () => Promise<{ path: string; isActive: boolean }[]>;
  getSupportedExtensions: () => Promise<{
    images: string[];
    videos: string[];
    all: string[];
  }>;
  getServerPort: () => Promise<number>;
  openInVlc: (
    filePath: string,
  ) => Promise<{ success: boolean; message?: string }>;
  getMediaByColor: (
    color: { r: number; g: number; b: number },
    threshold: number,
  ) => Promise<string[]>;
  listDirectory: (directoryPath: string) => Promise<FileSystemEntry[]>;
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
   * Retrieves media files that match a specific dominant color.
   * @param color - The target color (RGB).
   * @param threshold - The maximum distance (tolerance) for the color match.
   * @returns A promise that resolves to an array of matching file paths.
   */
  getMediaByColor: (
    color: { r: number; g: number; b: number },
    threshold: number,
  ) => ipcRenderer.invoke('get-media-by-color', color, threshold),

  /**
   * Lists the contents of a directory.
   * @param directoryPath - The absolute path of the directory.
   * @returns A promise that resolves to an array of file system entries.
   */
  listDirectory: (directoryPath: string) =>
    ipcRenderer.invoke('list-directory', directoryPath),
};

contextBridge.exposeInMainWorld('electronAPI', api);
