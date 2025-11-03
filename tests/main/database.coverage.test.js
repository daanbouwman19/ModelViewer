import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

let mockWorkerInstance;

class MockWorker extends EventEmitter {
  constructor() {
    super();
    this.terminate = vi.fn().mockResolvedValue(undefined);
    this.postMessage = vi.fn((message) => {
      // Default handler for init and close to make setup/teardown work
      if (message.type === 'init' || message.type === 'close') {
        process.nextTick(() => {
          this.emit('message', {
            id: message.id,
            result: { success: true, data: {} },
          });
        });
      }
    });
    mockWorkerInstance = this;
  }

  // Helper methods
  simulateMessage(message) {
    this.emit('message', message);
  }
  simulateError(error) {
    this.emit('error', error);
  }
  simulateExit(code) {
    this.emit('exit', code);
  }
}

vi.mock('worker_threads', () => ({
  Worker: MockWorker,
  default: { Worker: MockWorker },
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp',
  },
}));

describe('database.js additional coverage', () => {
  let db;

  beforeEach(async () => {
    vi.resetModules();
    db = await import('../../src/main/database.js');
    await db.initDatabase();
  });

  afterEach(async () => {
    await db.closeDatabase();
    vi.clearAllMocks();
  });

  describe('functions that handle errors gracefully', () => {
    it('getMediaViewCounts should return {} on worker error', async () => {
      const promise = db.getMediaViewCounts(['/path/to/file.png']);
      mockWorkerInstance.simulateError(new Error('Worker crashed'));
      await expect(promise).resolves.toEqual({});
    });

    it('getMediaViewCounts should return {} on worker exit', async () => {
      const promise = db.getMediaViewCounts(['/path/to/file.png']);
      mockWorkerInstance.simulateExit(1);
      await expect(promise).resolves.toEqual({});
    });

    it('getMediaViewCounts should return {} on timeout', async () => {
      vi.useFakeTimers();
      db.setOperationTimeout(1000);
      const promise = db.getMediaViewCounts(['/path/to/file.png']);
      vi.advanceTimersByTime(1500);
      await expect(promise).resolves.toEqual({});
      vi.useRealTimers();
    });
  });

  describe('functions that throw errors', () => {
    it('should throw an error when adding a media directory fails', async () => {
      const directoryPath = '/test/media/directory';
      const errorMessage = 'Failed to add directory';

      const postMessageSpy = vi.spyOn(mockWorkerInstance, 'postMessage');
      postMessageSpy.mockImplementation((message) => {
        if (message.type === 'addMediaDirectory') {
          mockWorkerInstance.simulateMessage({
            id: message.id,
            result: { success: false, error: errorMessage },
          });
        } else {
          // Call the original mock for other messages like 'close'
          mockWorkerInstance.constructor.prototype.postMessage.call(
            mockWorkerInstance,
            message,
          );
        }
      });

      await expect(db.addMediaDirectory(directoryPath)).rejects.toThrow(
        errorMessage,
      );
      postMessageSpy.mockRestore();
    });

    it('should throw an error when removing a media directory fails', async () => {
      const directoryPath = '/test/media/directory';
      const errorMessage = 'Failed to remove directory';

      const postMessageSpy = vi.spyOn(mockWorkerInstance, 'postMessage');
      postMessageSpy.mockImplementation((message) => {
        if (message.type === 'removeMediaDirectory') {
          mockWorkerInstance.simulateMessage({
            id: message.id,
            result: { success: false, error: errorMessage },
          });
        } else {
          mockWorkerInstance.constructor.prototype.postMessage.call(
            mockWorkerInstance,
            message,
          );
        }
      });

      await expect(db.removeMediaDirectory(directoryPath)).rejects.toThrow(
        errorMessage,
      );
      postMessageSpy.mockRestore();
    });

    it('should throw an error when setting directory active state fails', async () => {
      const directoryPath = '/test/media/directory';
      const errorMessage = 'Failed to set active state';

      const postMessageSpy = vi.spyOn(mockWorkerInstance, 'postMessage');
      postMessageSpy.mockImplementation((message) => {
        if (message.type === 'setDirectoryActiveState') {
          mockWorkerInstance.simulateMessage({
            id: message.id,
            result: { success: false, error: errorMessage },
          });
        } else {
          mockWorkerInstance.constructor.prototype.postMessage.call(
            mockWorkerInstance,
            message,
          );
        }
      });

      await expect(
        db.setDirectoryActiveState(directoryPath, false),
      ).rejects.toThrow(errorMessage);
      postMessageSpy.mockRestore();
    });
  });
});
