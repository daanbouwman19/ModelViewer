import { IMediaBackend } from './types';
import { ElectronAdapter } from './ElectronAdapter';
import { WebAdapter } from './WebAdapter';

/**
 * Creates and returns the appropriate backend adapter based on the environment.
 */
function createBackend(): IMediaBackend {
  // Check if we are running in Electron
  if (window.electronAPI) {
    console.log('[API] Using Electron Adapter');
    return new ElectronAdapter();
  } else {
    console.log('[API] Using Web Adapter');
    return new WebAdapter();
  }
}

export const api = createBackend();
