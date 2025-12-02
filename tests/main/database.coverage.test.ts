import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { EventEmitter } from 'events';

interface WorkerMessage {
  id: string;
  type: string;
  payload: unknown;
}

// Module-scoped variable to hold the latest mock worker instance
let mockWorkerInstance: MockWorker | null = null;

class MockWorker extends EventEmitter {
  terminate: Mock;
  postMessage: Mock;

  constructor() {
    super();
    this.terminate = vi.fn().mockResolvedValue(undefined);
    this.postMessage = vi.fn((message: WorkerMessage) => {
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
    // Capture the instance when it's created
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    mockWorkerInstance = this;
  }

  // Helper methods
  simulateMessage(message: unknown) {
    this.emit('message', message);
  }

  simulateError(error: unknown) {
    this.emit('error', error);
  }

  simulateExit(code: number) {
    this.emit('exit', code);
  }
}

vi.mock('worker_threads', () => ({
  Worker: MockWorker,
  default: { Worker: MockWorker },
}));

import { createMockElectron } from './mocks/electron';

vi.mock('electron', () => createMockElectron());

describe('database.js additional coverage - uninitialized', () => {
  beforeEach(() => {
    vi.resetModules();
    mockWorkerInstance = null;
  });

  it('should reject if dbWorker is not initialized', async () => {
    const freshDb = await import('../../src/main/database.js');
    await expect(freshDb.addMediaDirectory('/test/path')).rejects.toThrow(
      'Database worker not initialized',
    );
  });
});

describe('database.js additional coverage', () => {
  // Use typeof import(...) for the dynamically imported module
  let db: typeof import('../../src/main/database.js');

  beforeEach(async () => {
    vi.resetModules();
    mockWorkerInstance = null;
    db = await import('../../src/main/database.js');
    await db.initDatabase();
  });

  afterEach(async () => {
    await db.closeDatabase();
    vi.clearAllMocks();
  });

  it('logs an error when worker exits unexpectedly', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    expect(mockWorkerInstance).toBeDefined();
    expect(mockWorkerInstance).not.toBeNull();

    // Simulate an unexpected exit with a non-zero code
    mockWorkerInstance!.emit('exit', 1);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[database.js] Database worker exited unexpectedly with code 1',
    );

    consoleErrorSpy.mockRestore();
  });

  it('logs a warning for recordMediaView errors in non-test environment', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    expect(mockWorkerInstance).toBeDefined();
    expect(mockWorkerInstance).not.toBeNull();

    const originalPostMessage = mockWorkerInstance!.postMessage;
    // Simulate a failure in worker communication for the recordMediaView call
    const postMessageSpy = vi
      .spyOn(mockWorkerInstance!, 'postMessage')
      .mockImplementation((message: WorkerMessage) => {
        if (message.type === 'recordMediaView') {
          throw new Error('Test worker error');
        }
        // Let other messages (like init) pass through the original implementation
        originalPostMessage(message);
      });

    await db.recordMediaView('/some/file.jpg');

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[database.js] Error recording media view: Test worker error',
    );

    // Cleanup
    postMessageSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('functions that handle errors gracefully', () => {
    it('getMediaViewCounts should return {} on worker error', async () => {
      const promise = db.getMediaViewCounts(['/path/to/file.png']);
      mockWorkerInstance!.simulateError(new Error('Worker crashed'));
      await expect(promise).resolves.toEqual({});
    });

    it('getMediaViewCounts should return {} on worker exit', async () => {
      const promise = db.getMediaViewCounts(['/path/to/file.png']);
      mockWorkerInstance!.simulateExit(1);
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
    it.each([
      {
        method: 'addMediaDirectory',
        args: ['/test/media/directory'],
        errorMessage: 'Failed to add directory',
      },
      {
        method: 'removeMediaDirectory',
        args: ['/test/media/directory'],
        errorMessage: 'Failed to remove directory',
      },
      {
        method: 'setDirectoryActiveState',
        args: ['/test/media/directory', false],
        errorMessage: 'Failed to set active state',
      },
    ])(
      'should throw an error when $method fails',
      async ({ method, args, errorMessage }) => {
        // We know mockWorkerInstance is not null in beforeEach
        const originalPostMessage = mockWorkerInstance!.postMessage;
        const postMessageSpy = vi.spyOn(mockWorkerInstance!, 'postMessage');

        // Use 'any' for the mock implementation signature to match spyOn requirements,
        // but cast internally if needed.

        postMessageSpy.mockImplementation((message: any) => {
          if (message.type === method) {
            mockWorkerInstance!.simulateMessage({
              id: message.id,
              result: { success: false, error: errorMessage },
            });
          } else {
            originalPostMessage(message);
          }
        });

        // We need to cast db to access methods dynamically by string name

        await expect((db as any)[method](...args)).rejects.toThrow(
          errorMessage,
        );
        postMessageSpy.mockRestore();
      },
    );
  });

  it('rejects pending messages when worker emits an error', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // Call a function that would normally reject on error
    const addDirPromise = db.addMediaDirectory('/test/dir');
    // Call a function that would normally resolve with a default value on error
    const getViewCountsPromise = db.getMediaViewCounts(['/file.txt']);

    // Simulate a catastrophic worker error
    const testError = new Error('Test worker crash');
    mockWorkerInstance!.simulateError(testError);

    // Assertions
    await expect(addDirPromise).rejects.toThrow(testError);
    await expect(getViewCountsPromise).resolves.toEqual({}); // This one handles its own errors

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[database.js] Database worker error:',
      testError,
    );

    consoleErrorSpy.mockRestore();
  });

  it('getMediaDirectories should return [] on falsy worker response', async () => {
    const originalPostMessage = mockWorkerInstance!.postMessage;
    const postMessageSpy = vi.spyOn(mockWorkerInstance!, 'postMessage');

    postMessageSpy.mockImplementation((message: any) => {
      if (message.type === 'getMediaDirectories') {
        mockWorkerInstance!.simulateMessage({
          id: message.id,
          result: { success: true, data: null }, // Simulate null response
        });
      } else {
        originalPostMessage(message);
      }
    });

    const directories = await db.getMediaDirectories();
    expect(directories).toEqual([]);
    postMessageSpy.mockRestore();
  });

  it('should handle errors when terminating the worker during close', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const terminateError = new Error('Failed to terminate');
    mockWorkerInstance!.terminate.mockRejectedValue(terminateError);

    await db.closeDatabase();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[database.js] Error closing database worker:',
      terminateError,
    );

    // After closing, the worker should be null, and subsequent calls should fail.
    // Use a function that is expected to throw on error, not one that returns a default value.
    await expect(db.addMediaDirectory('/test/path')).rejects.toThrow(
      'Database worker not initialized',
    );

    consoleErrorSpy.mockRestore();

    // Re-initialize for the afterEach hook to run without issues.
    await db.initDatabase();
  });
});
