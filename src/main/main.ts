/**
 * @file This is the main entry point for the Electron application.
 */

import dotenv from 'dotenv';
dotenv.config();

import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs/promises';

import { initDatabase, closeDatabase } from './database';
import {
  startLocalServer,
  stopLocalServer,
  getServerPort,
} from './local-server';
import { stopAuthServer } from './auth-server';
import {
  cleanupDriveCacheManager,
  initializeDriveCacheManager,
} from './drive-cache-manager';

import { registerAuthHandlers } from './ipc/auth-controller';
import { registerSystemHandlers } from './ipc/system-controller';
import { registerMediaHandlers } from './ipc/media-controller';
import { registerDatabaseHandlers } from './ipc/database-controller';

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

// Register IPC Handlers
registerAuthHandlers();
registerSystemHandlers();
registerMediaHandlers();
registerDatabaseHandlers();

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

// Enable experimental HEVC support (Windows/Mac)
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');
app.commandLine.appendSwitch(
  'platform-media-player-enable-hevc-support-for-win10',
);

app.on('ready', () => {
  createWindow();

  const driveCacheDir = path.join(app.getPath('userData'), 'drive-cache');
  initializeDriveCacheManager(driveCacheDir);

  initDatabase()
    .then(async () => {
      const cacheDir = path.join(app.getPath('userData'), 'thumbnails');
      await fs.mkdir(cacheDir, { recursive: true });

      startLocalServer(cacheDir, () => {
        console.log('[main.js] Local server started in background.');
      });
    })
    .catch((error) => {
      console.error(
        '[main.js] Database initialization failed during app ready sequence:',
        error,
      );
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
      const cacheDir = path.join(app.getPath('userData'), 'thumbnails');
      startLocalServer(cacheDir, createWindow);
    }
  }
});

app.on('will-quit', () => {
  stopLocalServer(() => {
    console.log('[main.js] Local server stopped during will-quit.');
  });
  stopAuthServer();
  closeDatabase();
  cleanupDriveCacheManager();
});
