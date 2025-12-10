/**
 * @file Manages database interactions for the Electron main process.
 * Wraps the core database logic and handles worker path resolution specific to Electron.
 */

import path from 'path';
import { app } from 'electron';
import { initDatabase as initCoreDatabase } from '../core/database';
export * from '../core/database';

/**
 * Initializes the database by creating and managing a worker thread.
 * If an existing worker is present, it will be terminated and a new one started.
 * @returns A promise that resolves when the database is successfully initialized.
 * @throws {Error} If the worker initialization fails.
 */
export async function initDatabase(): Promise<void> {
  const dbPath = path.join(
    app.getPath('userData'),
    'media_slideshow_stats.sqlite',
  );

  let workerPath: string | URL;
  const isTest =
    process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

  if (app.isPackaged) {
    // In a packaged app, the worker is a JS file relative to the main script.
    workerPath = path.join(__dirname, 'database-worker.js');
  } else if (isTest) {
    // In a test environment (Vitest), resolve the path to the TS source file.
    const pathModule = await import('path');
    workerPath = pathModule.resolve(
      process.cwd(),
      'src/core/database-worker.ts',
    );
  } else {
    // In development, use the URL constructor relative to the current module.
    // electron-vite handles the bundling of the worker file.
    // The worker is built to 'out/main/database-worker.js', same directory as this file's output.
    workerPath = new URL('./database-worker.js', import.meta.url);
  }

  return initCoreDatabase(dbPath, workerPath);
}
