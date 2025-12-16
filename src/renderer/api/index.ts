/**
 * @file This module exposes a unified API to the renderer process.
 * It detects whether the application is running in Electron or a web browser
 * and exports the appropriate adapter.
 */

import { IMediaBackend } from './types';
import { ElectronAdapter } from './ElectronAdapter';
import { WebAdapter } from './WebAdapter';

// Detect environment
const isElectron = 'electronAPI' in window;

// Export the appropriate API instance
export const api: IMediaBackend = isElectron
  ? new ElectronAdapter()
  : new WebAdapter();

// Re-export adapters for testing
export { ElectronAdapter, WebAdapter };
export * from './types';
