import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerClient } from '../../src/core/worker-client';
import { Worker } from 'worker_threads';

// Mock worker_threads
vi.mock('worker_threads', async () => {
  const { vi } = await import('vitest');
  const mockPostMessage = vi.fn();
  const mockTerminate = vi.fn();
  const mockOn = vi.fn();

  class MockWorker {
    postMessage = mockPostMessage;
    terminate = mockTerminate;
    on = mockOn;
    constructor() {}
  }

  // Create a single spy that returns the MockWorker instance
  // We use a regular function so it can be called with 'new'
  const WorkerSpy = vi.fn(function () {
    return new MockWorker();
  });

  return {
    Worker: WorkerSpy,
    default: {
      Worker: WorkerSpy,
    },
  };
});

describe('WorkerClient Coverage', () => {
  let client: WorkerClient;
  const workerPath = '/test-worker.js';

  beforeEach(() => {
    vi.clearAllMocks();
    client = new WorkerClient(workerPath);
  });

  afterEach(async () => {
    await client.terminate();
  });

  it('init() terminates existing worker before re-initializing', async () => {
    // First Init
    await client.init();

    // Spy on terminate
    const terminateSpy = vi.spyOn(client, 'terminate');

    // Second Init
    await client.init();

    expect(terminateSpy).toHaveBeenCalled();
  });

  it('init() handles Worker constructor errors', async () => {
    // We mock the implementation of the *constructor* spy.
    // It must throw when called with `new`.
    vi.mocked(Worker).mockImplementationOnce(function () {
      throw new Error('Constructor Fail');
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(client.init()).rejects.toThrow('Constructor Fail');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('CRITICAL ERROR'),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('sendMessage() rejects if worker not initialized', async () => {
    // Do not call init()
    await expect(client.sendMessage('TEST')).rejects.toThrow(
      'Worker not initialized',
    );
  });

  it('sendMessage() handles postMessage errors', async () => {
    await client.init();

    // Access the private worker instance to mock postMessage failure
    // Because we used a class in our mock, accessing the instance is reliable
    const workerInstance = vi.mocked(Worker).mock.results[0].value;
    workerInstance.postMessage.mockImplementation(() => {
      throw new Error('Post failure');
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(client.sendMessage('TEST')).rejects.toThrow('Post failure');

    consoleSpy.mockRestore();
  });

  it('terminate() handles soft close error gracefully', async () => {
    await client.init();
    await client.terminate();
  });
});
