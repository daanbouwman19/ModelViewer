/**
 * @file This is the main entry point for the Electron application.
 * It handles the application's lifecycle, window creation, and all
 * backend logic and communication with the renderer process via IPC.
 * This includes file system operations, database management, and running a local server.
 */
import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  IpcMainInvokeEvent,
} from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

import {
  MAX_DATA_URL_SIZE_MB,
  SUPPORTED_VIDEO_EXTENSIONS,
  SUPPORTED_IMAGE_EXTENSIONS,
  ALL_SUPPORTED_EXTENSIONS,
} from './constants';

import {
  initDatabase,
  recordMediaView,
  getMediaViewCounts,
  cacheAlbums,
  getCachedAlbums,
  closeDatabase,
  getMediaDirectories,
  addMediaDirectory,
  removeMediaDirectory,
  setDirectoryActiveState,
} from './database';
import { performFullMediaScan, Album } from './media-scanner';
import {
  startLocalServer,
  stopLocalServer,
  getServerPort,
  getMimeType as resolveMimeType,
} from './local-server';

/**
 * A flag indicating if the application is running in development mode.
 */
const isDev = !app.isPackaged;

/**
 * The main browser window instance.
 */
let mainWindow: BrowserWindow | null = null;

// --- IPC Handlers ---

/**
 * Handles the 'load-file-as-data-url' IPC call from the renderer process.
 * It loads a file and returns its content as a Data URL or an HTTP URL from the local server
 * for large video files.
 * @param _event - The IPC invocation event (unused).
 * @param filePath - The path of the file to load.
 * @param options - Additional options, such as `preferHttp`.
 * @returns An object containing the result (data-url, http-url, or error).
 */
ipcMain.handle(
  'load-file-as-data-url',
  (
    _event: IpcMainInvokeEvent,
    filePath: string,
    options: { preferHttp?: boolean } = {},
  ) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        return { type: 'error', message: `File does not exist: ${filePath}` };
      }

      const currentServerPort = getServerPort();

      // If preferHttp is true, always return an HTTP URL (if the server is running)
      if (options.preferHttp && currentServerPort > 0) {
        const pathForUrl = filePath.replace(/\\/g, '/');
        return {
          type: 'http-url',
          url: `http://localhost:${currentServerPort}/${pathForUrl}`,
        };
      }

      const stats = fs.statSync(filePath);
      const isVideo = SUPPORTED_VIDEO_EXTENSIONS.includes(
        path.extname(filePath).toLowerCase(),
      );

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
    } catch (error: unknown) {
      console.error(
        `[main.js] Error processing ${filePath} in load-file-as-data-url:`,
        error,
      );
      return {
        type: 'error',
        message: (error as Error).message || 'Unknown error processing file.',
      };
    }
  },
);

/**
 * Handles the 'record-media-view' IPC call.
 * @param filePath - The path of the media file to record a view for.
 */
ipcMain.handle(
  'record-media-view',
  async (_event: IpcMainInvokeEvent, filePath: string) => {
    await recordMediaView(filePath);
  },
);

/**
 * Handles the 'get-media-view-counts' IPC call.
 * @param filePaths - An array of file paths.
 * @returns A map of file paths to their view counts.
 */
ipcMain.handle(
  'get-media-view-counts',
  async (_event: IpcMainInvokeEvent, filePaths: string[]) => {
    return getMediaViewCounts(filePaths);
  },
);

/**
 * Scans active media directories for albums, caches the result in the database,
 * and returns the list of albums found.
 * @returns The list of albums found.
 */
async function scanDiskForAlbumsAndCache(): Promise<Album[]> {
  const allDirectories = await getMediaDirectories();
  const activeDirectories = allDirectories
    .filter((dir) => dir.isActive)
    .map((dir) => dir.path);

  if (!activeDirectories || activeDirectories.length === 0) {
    await cacheAlbums([]);
    return [];
  }

  const albums = await performFullMediaScan(activeDirectories);
  await cacheAlbums(albums || []);
  return albums || [];
}

/**
 * Retrieves albums by first checking the cache, and if the cache is empty,
 * performs a disk scan.
 * @returns The list of albums.
 */
async function getAlbumsFromCacheOrDisk(): Promise<Album[]> {
  const albums = await getCachedAlbums();
  if (albums && albums.length > 0) {
    return albums;
  }
  return scanDiskForAlbumsAndCache();
}

/**
 * Performs a fresh disk scan and returns the albums with their view counts.
 * This is a utility function to combine scanning and view count retrieval.
 * @returns The list of albums with view counts.
 */
async function getAlbumsWithViewCountsAfterScan(): Promise<Album[]> {
  const albums = await scanDiskForAlbumsAndCache();
  if (!albums || albums.length === 0) {
    return [];
  }

  const allFilePaths = albums.flatMap((album) =>
    album.textures.map((texture) => texture.path),
  );
  const viewCountsMap = await getMediaViewCounts(allFilePaths);

  return albums.map((album) => ({
    ...album,
    textures: album.textures.map((texture) => ({
      ...texture,
      viewCount: viewCountsMap[texture.path] || 0,
    })),
  }));
}

/**
 * Handles the 'get-albums-with-view-counts' IPC call.
 * Retrieves albums (from cache or disk) and augments them with view counts.
 * @returns A promise that resolves to the list of albums with view counts.
 */
ipcMain.handle('get-albums-with-view-counts', async () => {
  const albums = await getAlbumsFromCacheOrDisk();
  if (!albums || albums.length === 0) {
    return [];
  }

  const allFilePaths = albums.flatMap((album) =>
    album.textures.map((texture) => texture.path),
  );
  const viewCountsMap = await getMediaViewCounts(allFilePaths);

  return albums.map((album) => ({
    ...album,
    textures: album.textures.map((texture) => ({
      ...texture,
      viewCount: viewCountsMap[texture.path] || 0,
    })),
  }));
});

/**
 * Handles the 'add-media-directory' IPC call. Opens a dialog to select a directory,
 * adds it to the database, and returns the path.
 * @returns The path of the new directory, or null if canceled.
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

  const newPath = filePaths[0];
  await addMediaDirectory(newPath);
  return newPath;
});

/**
 * Handles the 'reindex-media-library' IPC call.
 * @returns The updated list of albums.
 */
ipcMain.handle('reindex-media-library', async () => {
  return getAlbumsWithViewCountsAfterScan();
});

/**
 * Handles the 'remove-media-directory' IPC call.
 * @param directoryPath - The path of the directory to remove.
 */
ipcMain.handle(
  'remove-media-directory',
  async (_event: IpcMainInvokeEvent, directoryPath: string) => {
    await removeMediaDirectory(directoryPath);
  },
);

/**
 * Handles the 'set-directory-active-state' IPC call.
 * @param options - The directory path and its new active state.
 */
ipcMain.handle(
  'set-directory-active-state',
  async (
    _event: IpcMainInvokeEvent,
    { directoryPath, isActive }: { directoryPath: string; isActive: boolean },
  ) => {
    await setDirectoryActiveState(directoryPath, isActive);
  },
);

/**
 * Handles the 'get-media-directories' IPC call.
 * @returns The list of media directories.
 */
ipcMain.handle('get-media-directories', async () => {
  return getMediaDirectories();
});

/**
 * Handles the 'get-supported-extensions' IPC call.
 * @returns The supported file extensions.
 */
ipcMain.handle('get-supported-extensions', () => {
  return {
    images: SUPPORTED_IMAGE_EXTENSIONS,
    videos: SUPPORTED_VIDEO_EXTENSIONS,
    all: ALL_SUPPORTED_EXTENSIONS,
  };
});

/**
 * Handles the 'get-server-port' IPC call.
 * @returns The port the local server is running on.
 */
ipcMain.handle('get-server-port', () => {
  return getServerPort();
});

/**
 * Handles the 'open-in-vlc' IPC call.
 * Attempts to open the given file in VLC Media Player.
 * @param filePath - The path of the file to open.
 * @returns The result of the operation.
 */
ipcMain.handle(
  'open-in-vlc',
  async (_event: IpcMainInvokeEvent, filePath: string) => {
    const platform = process.platform;
    let vlcPath: string | null = null;

    if (platform === 'win32') {
      const commonPaths = [
        'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
        'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
      ];
      for (const p of commonPaths) {
        if (fs.existsSync(p)) {
          vlcPath = p;
          break;
        }
      }
    } else if (platform === 'darwin') {
      const macPath = '/Applications/VLC.app/Contents/MacOS/VLC';
      if (fs.existsSync(macPath)) {
        vlcPath = macPath;
      } else {
        // Fallback to trying 'vlc' in PATH if the standard app path fails
        vlcPath = 'vlc';
      }
    } else {
      // On Linux, assume 'vlc' is in the PATH
      vlcPath = 'vlc';
    }

    if (!vlcPath) {
      return {
        success: false,
        message:
          'VLC Media Player not found. Please ensure it is installed in the default location.',
      };
    }

    try {
      const child = spawn(vlcPath, [filePath], {
        detached: true,
        stdio: 'ignore',
      });

      // Listen for spawn errors (e.g. ENOENT if 'vlc' is not in PATH)
      child.on('error', (err) => {
        console.error('[main.js] Error launching VLC (async):', err);
      });

      child.unref();
      return { success: true };
    } catch (error: unknown) {
      console.error('[main.js] Error launching VLC:', error);
      return {
        success: false,
        message: `Failed to launch VLC: ${(error as Error).message}`,
      };
    }
  },
);

// --- Window Creation ---

/**
 * Creates and configures the main application window.
 */
function createWindow() {
  const preloadPath = path.join(__dirname, '../preload/preload.cjs'); // Path to the compiled preload script

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

// Enable experimental HEVC support (Windows/Mac)
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');
// Specific flag for Windows 10/11 HEVC support
app.commandLine.appendSwitch(
  'platform-media-player-enable-hevc-support-for-win10',
);

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
