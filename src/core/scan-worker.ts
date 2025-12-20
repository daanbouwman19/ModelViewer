import { parentPort } from 'worker_threads';
import { performFullMediaScan } from './media-scanner';

if (!parentPort) {
  throw new Error('This module must be run as a worker thread');
}

parentPort.on('message', async (message) => {
  if (message.type === 'START_SCAN') {
    try {
      const { directories } = message;
      const albums = await performFullMediaScan(directories);
      parentPort?.postMessage({ type: 'SCAN_COMPLETE', albums });
    } catch (error) {
      parentPort?.postMessage({
        type: 'SCAN_ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
});
