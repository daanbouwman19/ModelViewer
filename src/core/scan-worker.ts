import { parentPort } from 'worker_threads';
import { performFullMediaScan } from './media-scanner.ts';

const port = parentPort;
if (!port) {
  throw new Error('This module must be run as a worker thread');
}

port.on('message', async (message) => {
  if (message.type === 'START_SCAN') {
    try {
      const { directories } = message;
      const albums = await performFullMediaScan(directories);
      port.postMessage({ type: 'SCAN_COMPLETE', albums });
    } catch (error) {
      port.postMessage({
        type: 'SCAN_ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
});
