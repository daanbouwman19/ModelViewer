/**
 * @file This is the main entry point for the Electron application.
 * It handles the application's lifecycle, window creation, and all
 * backend logic and communication with the renderer process via IPC.
 * This includes file system operations, database management, and running a local server.
 */
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';

import {
  MAX_DATA_URL_SIZE_MB,
  SUPPORTED_VIDEO_EXTENSIONS,
  SUPPORTED_IMAGE_EXTENSIONS,
  ALL_SUPPORTED_EXTENSIONS,
} from './constants.js';

import {
  initDatabase,
  recordMediaView,
  getMediaViewCounts,
  cacheModels,
  getCachedModels,
  closeDatabase,
  getMediaDirectories,
  addMediaDirectory,
  removeMediaDirectory,
  setDirectoryActiveState,
} from './database.js';
import { performFullMediaScan } from './media-scanner.js';
import {
  startLocalServer,
  stopLocalServer,
  getServerPort,
  getMimeType as resolveMimeType,
} from './local-server.js';

/**
 * A flag indicating if the application is running in development mode.
 * @type {boolean}
 */
const isDev = !app.isPackaged;

/**
 * The main browser window instance.
 * @type {BrowserWindow | null}
 */
let mainWindow = null;

// --- IPC Handlers ---

/**
 * Handles the 'load-file-as-data-url' IPC call from the renderer process.
 * It loads a file and returns its content as a Data URL or an HTTP URL from the local server
 * for large video files.
 * @returns {Promise<{type: 'data-url' | 'http-url' | 'error', url?: string, message?: string}>} An object containing the result.
 */
ipcMain.handle('load-file-as-data-url', (event, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { type: 'error', message: `File does not exist: ${filePath}` };
    }
    const stats = fs.statSync(filePath);
    const isVideo = SUPPORTED_VIDEO_EXTENSIONS.includes(
      path.extname(filePath).toLowerCase(),
    );
    const currentServerPort = getServerPort();

    if (isVideo && stats.size > MAX_DATA_URL_SIZE_MB * 1024 * 1024) {
      if (currentServerPort === 0) {
        return {
          type: 'error',
          message: 'Local server not ready to stream large video.',
        };
      }
      const pathForUrl = filePath.replace(/\\/g, '/');
      return {
        type: 'http-url',
        url: `http://localhost:${currentServerPort}/${pathForUrl}`,
      };
    }

    const mimeType = resolveMimeType(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    const dataURL = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
    return { type: 'data-url', url: dataURL };
  } catch (error) {
    console.error(
      `[main.js] Error processing ${filePath} in load-file-as-data-url:`,
      error,
    );
    return {
      type: 'error',
      message: error.message || 'Unknown error processing file.',
    };
  }
});

/**
 * Handles the 'record-media-view' IPC call.
 * @param {string} filePath - The path of the media file to record a view for.
 */
ipcMain.handle('record-media-view', async (event, filePath) => {
  await recordMediaView(filePath);
});

/**
 * Handles the 'get-media-view-counts' IPC call.
 * @param {string[]} filePaths - An array of file paths.
 * @returns {Promise<{[filePath: string]: number}>} A map of file paths to their view counts.
 */
ipcMain.handle('get-media-view-counts', async (event, filePaths) => {
  return getMediaViewCounts(filePaths);
});

/**
 * Scans active media directories for models, caches the result in the database,
 * and returns the list of models found.
 * @returns {Promise<import('./media-scanner.js').Model[]>} The list of models found.
 */
async function scanDiskForModelsAndCache() {
  const allDirectories = await getMediaDirectories();
  const activeDirectories = allDirectories
    .filter((dir) => dir.isActive)
    .map((dir) => dir.path);

  if (!activeDirectories || activeDirectories.length === 0) {
    await cacheModels([]);
    return [];
  }

  const models = await performFullMediaScan(activeDirectories);
  await cacheModels(models || []);
  return models || [];
}

/**
 * Retrieves models by first checking the cache, and if the cache is empty,
 * performs a disk scan.
 * @returns {Promise<import('./media-scanner.js').Model[]>} The list of models.
 */
async function getModelsFromCacheOrDisk() {
  let models = await getCachedModels();
  if (models && models.length > 0) {
    return models;
  }
  return scanDiskForModelsAndCache();
}

/**
 * Performs a fresh disk scan and returns the models with their view counts.
 * This is a utility function to combine scanning and view count retrieval.
 * @returns {Promise<import('./media-scanner.js').Model[]>} The list of models with view counts.
 */
async function getModelsWithViewCountsAfterScan() {
  const models = await scanDiskForModelsAndCache();
  if (!models || models.length === 0) {
    return [];
  }

  const allFilePaths = models.flatMap((model) =>
    model.textures.map((texture) => texture.path),
  );
  const viewCountsMap = await getMediaViewCounts(allFilePaths);

  return models.map((model) => ({
    ...model,
    textures: model.textures.map((texture) => ({
      ...texture,
      viewCount: viewCountsMap[texture.path] || 0,
    })),
  }));
}

/**
 * Handles the 'get-models-with-view-counts' IPC call.
 * Retrieves models (from cache or disk) and augments them with view counts.
 * @returns {Promise<import('./media-scanner.js').Model[]>} A promise that resolves to the list of models with view counts.
 */
ipcMain.handle('get-models-with-view-counts', async () => {
  const models = await getModelsFromCacheOrDisk();
  if (!models || models.length === 0) {
    return [];
  }

  const allFilePaths = models.flatMap((model) =>
    model.textures.map((texture) => texture.path),
  );
  const viewCountsMap = await getMediaViewCounts(allFilePaths);

  return models.map((model) => ({
    ...model,
    textures: model.textures.map((texture) => ({
      ...texture,
      viewCount: viewCountsMap[texture.path] || 0,
    })),
  }));
});

/**
 * Handles the 'add-media-directory' IPC call. Opens a dialog to select a directory,
 * adds it to the database, and triggers a re-scan.
 * @returns {Promise<import('./media-scanner.js').Model[] | null>} The updated list of models, or null if the dialog was canceled.
 */
ipcMain.handle('add-media-directory', async () => {
  if (!mainWindow) return null;

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Media Directory',
  });

  if (canceled || !filePaths || filePaths.length === 0) {
    return null;
  }

  await addMediaDirectory(filePaths[0]);
  return getModelsWithViewCountsAfterScan();
});

/**
 * Handles the 'reindex-media-library' IPC call.
 * @returns {Promise<import('./media-scanner.js').Model[]>} The updated list of models.
 */
ipcMain.handle('reindex-media-library', async () => {
  return getModelsWithViewCountsAfterScan();
});

/**
 * Handles the 'remove-media-directory' IPC call.
 * @param {string} directoryPath - The path of the directory to remove.
 */
ipcMain.handle('remove-media-directory', async (event, directoryPath) => {
  await removeMediaDirectory(directoryPath);
});

/**
 * Handles the 'set-directory-active-state' IPC call.
 * @param {{directoryPath: string, isActive: boolean}} options - The directory path and its new active state.
 */
ipcMain.handle(
  'set-directory-active-state',
  async (event, { directoryPath, isActive }) => {
    await setDirectoryActiveState(directoryPath, isActive);
  },
);

/**
 * Handles the 'get-media-directories' IPC call.
 * @returns {Promise<{path: string, isActive: boolean}[]>} The list of media directories.
 */
ipcMain.handle('get-media-directories', async () => {
  return getMediaDirectories();
});

/**
 * Handles the 'get-supported-extensions' IPC call.
 * @returns {{images: string[], videos: string[], all: string[]}} The supported file extensions.
 */
ipcMain.handle('get-supported-extensions', () => {
  return {
    images: SUPPORTED_IMAGE_EXTENSIONS,
    videos: SUPPORTED_VIDEO_EXTENSIONS,
    all: ALL_SUPPORTED_EXTENSIONS,
  };
});

// --- Window Creation ---

/**
 * Creates and configures the main application window.
 */
function createWindow() {
  const preloadPath = path.join(__dirname, '../preload/preload.cjs');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    const devServerURL =
      process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow
      .loadURL(devServerURL)
      .catch((err) =>
        console.error('[main.js] Failed to load development server:', err),
      );
  } else {
    mainWindow
      .loadFile(path.join(__dirname, '../renderer/index.html'))
      .catch((err) =>
        console.error('[main.js] Failed to load index.html:', err),
      );
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- App Lifecycle ---

app.on('ready', async () => {
  try {
    await initDatabase();
    startLocalServer(createWindow);
  } catch (error) {
    console.error(
      '[main.js] Database initialization failed during app ready sequence:',
      error,
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (getServerPort() > 0) {
      createWindow();
    } else {
      startLocalServer(createWindow);
    }
  }
});

app.on('will-quit', () => {
  stopLocalServer(() => {
    console.log('[main.js] Local server stopped during will-quit.');
  });
  closeDatabase();
});
