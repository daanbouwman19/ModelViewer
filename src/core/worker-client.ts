/**
 * @file A generic wrapper around Node.js Worker Threads to provide Promisified communication.
 */

import { Worker, type WorkerOptions } from 'worker_threads';

interface WorkerResponse<T = unknown> {
  id: number;
  result: {
    success: boolean;
    data?: T;
    error?: string;
  };
}

interface PendingMessage<T = unknown> {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  timeoutId: NodeJS.Timeout;
}

export class WorkerClient {
  private worker: Worker | null = null;
  private pendingMessages = new Map<number, PendingMessage<unknown>>();
  private messageIdCounter = 0;
  private isTerminating = false;
  private operationTimeout: number;
  private workerPath: string | URL;
  private workerOptions?: WorkerOptions;
  private name: string;

  constructor(
    workerPath: string | URL,
    options?: WorkerOptions,
    operationTimeout = 30000,
    name = 'Worker',
  ) {
    this.workerPath = workerPath;
    this.workerOptions = options;
    this.operationTimeout = operationTimeout;
    this.name = name;
  }

  /**
   * Initializes the worker thread.
   * If an existing worker is present, it will be terminated and a new one started.
   */
  async init(initialPayload?: {
    type: string;
    payload?: unknown;
  }): Promise<void> {
    if (this.worker) {
      console.log(`[${this.name}] Terminating existing worker before re-init.`);
      await this.terminate();
    }

    this.isTerminating = false;

    try {
      this.worker = new Worker(this.workerPath, this.workerOptions);

      this.worker.on('message', (message: WorkerResponse) => {
        const { id, result } = message;
        const pending = this.pendingMessages.get(id);
        if (pending) {
          clearTimeout(pending.timeoutId);
          this.pendingMessages.delete(id);
          if (result.success) {
            pending.resolve(result.data);
          } else {
            pending.reject(new Error(result.error || 'Unknown worker error'));
          }
        }
      });

      this.worker.on('error', (error) => {
        console.error(`[${this.name}] Worker error:`, error);
        this.rejectAllPending(error);
      });

      this.worker.on('exit', (code) => {
        if (code !== 0 && !this.isTerminating) {
          console.error(
            `[${this.name}] Worker exited unexpectedly with code ${code}`,
          );
          // Attempt to restart or just log. For now, we log.
          // In a more advanced version, we could auto-restart.
        }
        this.rejectAllPending(new Error('Worker exited unexpectedly'));
      });

      if (initialPayload) {
        await this.sendMessage(initialPayload.type, initialPayload.payload);
      }

      if (process.env.NODE_ENV !== 'test') {
        console.log(`[${this.name}] Worker initialized successfully.`);
      }
    } catch (error) {
      console.error(
        `[${this.name}] CRITICAL ERROR: Failed to initialize worker:`,
        error,
      );
      this.worker = null;
      throw error;
    }
  }

  /**
   * Sends a message to the worker and returns a promise that resolves with the result.
   */
  sendMessage<T = unknown>(type: string, payload: unknown = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        return reject(new Error('Worker not initialized'));
      }

      const id = this.messageIdCounter++;

      const timeoutId = setTimeout(() => {
        if (this.pendingMessages.has(id)) {
          this.pendingMessages.delete(id);
          reject(new Error(`Worker operation timed out: ${type}`));
        }
      }, this.operationTimeout);

      this.pendingMessages.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
      });

      try {
        this.worker.postMessage({ id, type, payload });
      } catch (error) {
        console.error(
          `[${this.name}] Error posting message to worker: ${(error as Error).message}`,
        );
        clearTimeout(timeoutId);
        this.pendingMessages.delete(id);
        reject(error);
      }
    });
  }

  /**
   * Terminates the worker thread.
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      this.isTerminating = true;
      try {
        // Optional: send soft close signal first
        // await this.sendMessage('close');
      } catch {
        // ignore
      } finally {
        try {
          await this.worker.terminate();
        } catch (error) {
          console.error(`[${this.name}] Error terminating worker:`, error);
        } finally {
          this.worker = null;
          this.isTerminating = false;
          this.rejectAllPending(new Error('Worker terminated'));
          console.log(`[${this.name}] Worker terminated.`);
        }
      }
    }
  }

  private rejectAllPending(error: unknown) {
    for (const [id, pending] of this.pendingMessages.entries()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error instanceof Error ? error : new Error(String(error)));
      this.pendingMessages.delete(id);
    }
  }

  setOperationTimeout(timeout: number) {
    this.operationTimeout = timeout;
  }
}
