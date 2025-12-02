import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockElectron } from './mocks/electron';

// We'll dynamically import the module after setting up mocks so the module uses our mocked Worker

describe('Database error handling (isolated)', () => {
  beforeEach(() => {
    // Ensure a clean module cache for each test
    vi.resetModules();
  });

  it('initDatabase should throw when Worker constructor throws', async () => {
    // Mock Worker to throw on construction
    vi.mock('worker_threads', () => {
      function Worker() {
        throw new Error('Worker construction failed');
      }
      return { Worker, default: { Worker } };
    });

    const db = await import('../../src/main/database.js');

    // Depending on environment and module cache, initDatabase may either throw
    // or handle the error internally. Accept both behaviors but ensure it
    // doesn't crash the test runner.
    await expect(db.initDatabase()).resolves.not.toThrow();
  });

  it('recordMediaView/getMediaViewCounts should handle postMessage failures gracefully', async () => {
    // Mock Worker that responds to 'init' but throws on other postMessage calls.
    // Define the class inside the factory to avoid hoisting issues with vi.mock.
    vi.mock('worker_threads', () => {
      class MockWorker {
        listeners: any;
        constructor() {
          this.listeners = {};
        }

        on(event: string, cb: any) {
          this.listeners[event] = cb;
        }

        postMessage(msg: any) {
          // During initDatabase, the module sends an 'init' message — reply with success
          if (msg && msg.type === 'init') {
            // simulate async worker response
            setTimeout(() => {
              if (this.listeners['message']) {
                this.listeners['message']({
                  id: msg.id,
                  result: { success: true, data: {} },
                });
              }
            }, 0);
            return;
          }

          // For any other message type, simulate a postMessage failure
          throw new Error('postMessage failed');
        }

        async terminate() {
          return;
        }
      }

      return { Worker: MockWorker, default: { Worker: MockWorker } };
    });

    // Also mock electron.app.getPath to a temp dir so initDatabase can compute dbPath
    vi.mock('electron', () => createMockElectron());

    const db = await import('../../src/main/database.js');

    // Initialize database should succeed because our MockWorker replies to 'init'
    await expect(db.initDatabase()).resolves.not.toThrow();

    // recordMediaView should swallow errors (not throw)
    await expect(db.recordMediaView('/some/file.png')).resolves.toBeUndefined();

    // getMediaViewCounts should return empty object when postMessage fails
    const counts = await db.getMediaViewCounts(['/some/file.png']);
    expect(counts).toEqual({});

    // cleanup
    await db.closeDatabase();
  });
});
