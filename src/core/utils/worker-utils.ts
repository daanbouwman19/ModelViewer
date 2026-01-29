/**
 * @file Worker utility functions.
 */
import path from 'path';

/**
 * Resolves the path to a worker script based on the current environment.
 * Handles differences between Electron vs Node.js and Production vs Development.
 *
 * @param isElectron - Whether the app is running in Electron.
 * @param isPackaged - Whether the app is packaged (production).
 * @param currentDirname - The __dirname of the calling module.
 * @param currentUrl - The import.meta.url of the calling module.
 * @param workerName - The name of the worker file (e.g. 'scan-worker').
 * @returns The resolved worker path or URL.
 */
export async function resolveWorkerPath(
  isElectron: boolean,
  isPackaged: boolean,
  currentDirname: string,
  currentUrl: string,
  workerName: string,
): Promise<{ path: string | URL; options?: { execArgv: string[] } }> {
  let workerPath: string | URL;
  let workerOptions: { execArgv: string[] } | undefined;

  if (isElectron) {
    // We dynamically import electron here to avoid hard dependency in node-only contexts
    // However, the caller usually knows if they are in electron.
    // If we are strictly in `src/core`, we might want to avoid `import('electron')` if possible,
    // but detecting `isPackaged` often requires it.
    // The caller passed `isPackaged`.
    if (isPackaged) {
      workerPath = path.join(currentDirname, `${workerName}.js`);
    } else {
      workerPath = new URL(`./${workerName}.js`, currentUrl);
    }
  } else {
    // Web Server Environment
    if (process.env.NODE_ENV === 'production') {
      // In production built server, workers are adjacent to the entry point.
      workerPath = path.join(currentDirname, `${workerName}.js`);
    } else {
      // Development (tsx)
      workerPath = new URL(`./${workerName}.ts`, currentUrl);
      workerOptions = {
        execArgv: ['--import', 'tsx/esm'],
      };
    }
  }

  return { path: workerPath, options: workerOptions };
}
