/**
 * @file This is the main entry point for the Electron application.
 * It handles the application's lifecycle, window creation, and all
 * backend logic and communication with the renderer process via IPC.
 * This includes file system operations, database management, and running a local server.
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import {
  app,
  BrowserWindow,
  ipcMain,
  IpcMainInvokeEvent,
  shell,
} from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

import {
  MAX_DATA_URL_SIZE_MB,
  DATA_URL_THRESHOLD_MB,
  SUPPORTED_VIDEO_EXTENSIONS,
  SUPPORTED_IMAGE_EXTENSIONS,
  ALL_SUPPORTED_EXTENSIONS,
} from '../core/constants';

import { authorizeFilePath } from '../core/security';
import {
  initDatabase,
  recordMediaView,
  getMediaViewCounts,
  closeDatabase,
  getMediaDirectories,
  addMediaDirectory,
  removeMediaDirectory,
  setDirectoryActiveState,
  upsertMetadata,
  setRating,
  getMetadata,
  createSmartPlaylist,
  getSmartPlaylists,
  deleteSmartPlaylist,
  updateSmartPlaylist,
  getAllMetadataAndStats,
} from './database';
import {
  getAlbumsWithViewCountsAfterScan,
  getAlbumsWithViewCounts,
  extractAndSaveMetadata,
} from '../core/media-service';
import { getVideoDuration } from '../core/media-handler';
import {
  startLocalServer,
  stopLocalServer,
  getServerPort,
  getMimeType as resolveMimeType,
} from './local-server';
import { listDirectory } from '../core/file-system';
import { generateAuthUrl, authenticateWithCode } from './google-auth';
import {
  getDriveClient,
  getDriveFileStream,
  getDriveFileMetadata,
  listDriveDirectory,
  getDriveParent,
} from './google-drive-service';
import { startAuthServer, stopAuthServer } from './auth-server';
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
  async (
    _event: IpcMainInvokeEvent,
    filePath: string,
    options: { preferHttp?: boolean } = {},
  ) => {
    try {
      // 1. Handle Google Drive Files
      if (filePath.startsWith('gdrive://')) {
        const fileId = filePath.replace('gdrive://', '');
        const currentServerPort = getServerPort();

        // For video, or preferHttp, return HTTP URL from local server which pipes Drive stream
        const meta = await getDriveFileMetadata(fileId);

        // Use threshold for ALL files (images or video)
        // Note: For Drive files, streaming logic is slightly different, but we should use HTTP URL if large
        const isLarge = Number(meta.size) > DATA_URL_THRESHOLD_MB * 1024 * 1024;

        if (options.preferHttp || isLarge) {
          if (currentServerPort === 0) {
            return {
              type: 'error',
              message: 'Local server not ready to stream Drive file.',
            };
          }
          // We need to encode the URI because the file path is now a gdrive:// URI
          const encodedPath = encodeURIComponent(filePath);
          return {
            type: 'http-url',
            url: `http://localhost:${currentServerPort}/video/stream?file=${encodedPath}`,
          };
        }

        // For small files, return Data URL
        // Fetch buffer
        const stream = await getDriveFileStream(fileId);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        const mimeType = meta.mimeType || 'application/octet-stream';
        const dataURL = `data:${mimeType};base64,${buffer.toString('base64')}`;
        return { type: 'data-url', url: dataURL };
      }

      // 2. Handle Local Files
      const auth = await authorizeFilePath(filePath);
      if (!auth.isAllowed) {
        return { type: 'error', message: auth.message || 'Access denied' };
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

      const stats = await fs.stat(filePath);

      // Check if file is larger than threshold (1MB)
      // Note: This logic now applies to images too, not just videos
      if (stats.size > DATA_URL_THRESHOLD_MB * 1024 * 1024) {
        if (currentServerPort === 0) {
          return {
            type: 'error',
            message: 'Local server not ready to stream large file.',
          };
        }
        const pathForUrl = filePath.replace(/\\/g, '/');
        return {
          type: 'http-url',
          url: `http://localhost:${currentServerPort}/${pathForUrl}`,
        };
      }

      const mimeType = resolveMimeType(filePath);
      const fileBuffer = await fs.readFile(filePath);
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
 * Handles the 'get-video-metadata' IPC call.
 * @param filePath - The path of the video file.
 * @returns The metadata object (duration).
 */
ipcMain.handle(
  'get-video-metadata',
  async (_event: IpcMainInvokeEvent, filePath: string) => {
    try {
      if (filePath.startsWith('gdrive://')) {
        const fileId = filePath.replace('gdrive://', '');
        const meta = await getDriveFileMetadata(fileId);
        if (meta.videoMediaMetadata?.durationMillis) {
          return {
            duration: Number(meta.videoMediaMetadata.durationMillis) / 1000,
          };
        }
        return { error: 'Duration not available' };
      }
      const auth = await authorizeFilePath(filePath);
      if (!auth.isAllowed) {
        return { error: auth.message || 'Access denied' };
      }
      if (!ffmpegPath) {
        return { error: 'FFmpeg binary not found' };
      }
      return await getVideoDuration(filePath, ffmpegPath);
    } catch (error: unknown) {
      console.error('[main.js] Error getting video metadata:', error);
      return {
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error getting metadata',
      };
    }
  },
);

/**
 * Scans active media directories for albums, caches the result in the database,
 * and returns the list of albums found.
 * @returns The list of albums found.
 */

/**
 * Handles the 'get-albums-with-view-counts' IPC call.
 * Retrieves albums (from cache or disk) and augments them with view counts.
 * @returns A promise that resolves to the list of albums with view counts.
 */
ipcMain.handle('get-albums-with-view-counts', async () => {
  return getAlbumsWithViewCounts(ffmpegPath || undefined);
});

/**
 * Handles the 'add-media-directory' IPC call. Opens a dialog to select a directory,
 * adds it to the database, and returns the path.
 * @returns The path of the new directory, or null if canceled.
 */
ipcMain.handle(
  'add-media-directory',
  async (_event: IpcMainInvokeEvent, targetPath?: string) => {
    if (targetPath) {
      try {
        try {
          await fs.access(targetPath);
        } catch {
          return null;
        }
        await addMediaDirectory({ path: targetPath, type: 'local' });
        return targetPath;
      } catch (e) {
        console.error('Failed to add directory by path', e);
        return null;
      }
    }

    return null;
  },
);

/**
 * Handles 'auth:google-drive-start'
 */

// ...

ipcMain.handle('auth:google-drive-start', async () => {
  const url = generateAuthUrl();

  // Start temporary auth server on port 3000 to catch the callback
  // This matches the default redirect URI in Google Console
  startAuthServer(3000).catch((err) =>
    console.error('Failed to start auth server', err),
  );

  await shell.openExternal(url);
  // User needs to paste code, or we need a loopback server.
  // For MVP, let's ask user to paste code in a prompt
  // Ideally we spin up a temporary server or intercept protocol.
  // The google-secrets.ts uses a localhost redirect. Let's assume we want to support code copy-paste or implement a loopback.
  // For simplicity, let's return the URL to the frontend, frontend opens it, and asks user for code?
  return url;
  // Wait, typical desktop flow uses a loopback server listening on the redirect URI.
  // I will implement a simpler 'manual copy paste' flow for the "Add Source" modal for now if the user agrees.
  // But the user plan said "Use IPC handlers to trigger the login".
  // I'll assume I should handle the loopback or manual code entry.
  // Let's implement a manual code entry on the frontend for this MVP as it's most robust without complex networking issues.
});

/**
 * Handles 'auth:google-drive-code'
 */
ipcMain.handle('auth:google-drive-code', async (_event, code: string) => {
  await authenticateWithCode(code);
  return true;
});

/**
 * Handles 'add-google-drive-source'
 */
ipcMain.handle('add-google-drive-source', async (_event, folderId: string) => {
  // Verify we can access it
  try {
    const drive = await getDriveClient();
    const res = await drive.files.get({ fileId: folderId, fields: 'id, name' });
    await addMediaDirectory({
      path: `gdrive://${res.data.id}`,
      type: 'google_drive',
      name: res.data.name || 'Google Drive Folder',
    });
    return { success: true, name: res.data.name };
  } catch (e) {
    console.error('Failed to add Drive source', e);
    return { success: false, error: (e as Error).message };
  }
});

/**
 * Handles the 'reindex-media-library' IPC call.
 * @returns The updated list of albums.
 */
ipcMain.handle('reindex-media-library', async () => {
  return getAlbumsWithViewCountsAfterScan(ffmpegPath || undefined);
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
    // Drive check replaced by streaming logic below

    if (filePath.startsWith('gdrive://')) {
      // Create a local stream URL for VLC
      const port = getServerPort();
      if (port === 0) {
        return {
          success: false,
          message: 'Local server is not running to stream Drive file.',
        };
      }
      const encodedPath = encodeURIComponent(filePath);
      const streamUrl = `http://localhost:${port}/video/stream?file=${encodedPath}`;
      console.log(`[VLC] Streaming Drive file from: ${streamUrl}`);

      // We still need to find VLC path (reusing logic below)
      // We will duplicate the VLC finding logic or refactor.
      // Refactoring is better but for minimal change let's flow down.
      // But 'filePath' argument to spawn needs to be the URL.
      // Let's change the variable passed to spawn.
    }

    // Logic to resolve VLC path
    const platform = process.platform;
    let vlcPath: string | null = null;
    let fileArg = filePath;

    if (filePath.startsWith('gdrive://')) {
      // We already checked port above
      const port = getServerPort();
      if (port > 0) {
        fileArg = `http://localhost:${port}/video/stream?file=${encodeURIComponent(filePath)}`;
      } else {
        return { success: false, message: 'Server not ready for streaming' };
      }
    } else {
      // Local file auth check
      const auth = await authorizeFilePath(filePath);
      if (!auth.isAllowed) {
        return { success: false, message: auth.message || 'Access denied' };
      }
    }

    if (platform === 'win32') {
      const commonPaths = [
        'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
        'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
      ];
      for (const p of commonPaths) {
        try {
          await fs.access(p);
          vlcPath = p;
          break;
        } catch {
          // Continue checking other paths
        }
      }
    } else if (platform === 'darwin') {
      const macPath = '/Applications/VLC.app/Contents/MacOS/VLC';
      try {
        await fs.access(macPath);
        vlcPath = macPath;
      } catch {
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
      const child = spawn(vlcPath, [fileArg], {
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

/**
 * Handles the 'list-directory' IPC call.
 * @param directoryPath - The path to list.
 * @returns The contents of the directory.
 */
ipcMain.handle(
  'list-directory',
  async (_event: IpcMainInvokeEvent, directoryPath: string) => {
    return listDirectory(directoryPath);
  },
);

/**
 * Handles the 'get-parent-directory' IPC call.
 * @param targetPath - The path to get the parent of.
 * @returns The parent directory path.
 */
ipcMain.handle(
  'get-parent-directory',
  async (_event: IpcMainInvokeEvent, targetPath: string) => {
    if (!targetPath) return null;
    const parent = path.dirname(targetPath);
    // path.dirname('/') returns '/' on posix, 'C:\' on win32 if 'C:\' provided?
    // If parent is same as path, we are at root.
    if (parent === targetPath) return null;
    return parent;
  },
);

/**
 * Handles 'db:upsert-metadata'
 */
ipcMain.handle(
  'db:upsert-metadata',
  async (_event: IpcMainInvokeEvent, { filePath, metadata }) => {
    await upsertMetadata(filePath, metadata);
  },
);

/**
 * Handles 'db:get-metadata'
 */
ipcMain.handle(
  'db:get-metadata',
  async (_event: IpcMainInvokeEvent, filePaths: string[]) => {
    return getMetadata(filePaths);
  },
);

/**
 * Handles 'db:set-rating'
 */
ipcMain.handle(
  'db:set-rating',
  async (_event: IpcMainInvokeEvent, { filePath, rating }) => {
    await setRating(filePath, rating);
  },
);

/**
 * Handles 'db:create-smart-playlist'
 */
ipcMain.handle(
  'db:create-smart-playlist',
  async (_event: IpcMainInvokeEvent, { name, criteria }) => {
    return createSmartPlaylist(name, criteria);
  },
);

/**
 * Handles 'db:get-smart-playlists'
 */
ipcMain.handle('db:get-smart-playlists', async () => {
  return getSmartPlaylists();
});

/**
 * Handles 'db:delete-smart-playlist'
 */
ipcMain.handle(
  'db:delete-smart-playlist',
  async (_event: IpcMainInvokeEvent, id: number) => {
    await deleteSmartPlaylist(id);
  },
);

/**
 * Handles 'db:update-smart-playlist'
 */
ipcMain.handle(
  'db:update-smart-playlist',
  async (_event: IpcMainInvokeEvent, { id, name, criteria }) => {
    await updateSmartPlaylist(id, name, criteria);
  },
);

/**
 * Handles 'db:get-all-metadata-and-stats'
 */
ipcMain.handle('db:get-all-metadata-and-stats', async () => {
  return getAllMetadataAndStats();
});

/**
 * Handles 'media:extract-metadata'
 * Triggers background metadata extraction.
 */
ipcMain.handle(
  'media:extract-metadata',
  async (_event: IpcMainInvokeEvent, filePaths: string[]) => {
    if (!ffmpegPath) {
      console.warn('FFmpeg not found, skipping metadata extraction');
      return;
    }
    // Run in background (dangling promise)
    extractAndSaveMetadata(filePaths, ffmpegPath).catch((err) =>
      console.error('State extraction failed', err),
    );
  },
);

/**
 * Handles 'drive:list-directory'
 */
ipcMain.handle('drive:list-directory', async (_event, folderId: string) => {
  try {
    return await listDriveDirectory(folderId || 'root');
  } catch (err) {
    console.error('Failed to list drive directory', err);
    throw err;
  }
});

/**
 * Handles 'drive:get-parent'
 */
ipcMain.handle('drive:get-parent', async (_event, folderId: string) => {
  try {
    return await getDriveParent(folderId);
  } catch (err) {
    console.error('Failed to get drive parent', err);
    return null;
  }
});

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

app.on('ready', () => {
  createWindow();

  initDatabase()
    .then(() => {
      startLocalServer(() => {
        console.log('[main.js] Local server started in background.');
      });
    })
    .catch((error) => {
      console.error(
        '[main.js] Database initialization failed during app ready sequence:',
        error,
      );
      // Do not quit app, allow UI to remain open even if DB fails
    });
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
  stopAuthServer(); // Ensure auth server is cleaned up
  closeDatabase();
});
