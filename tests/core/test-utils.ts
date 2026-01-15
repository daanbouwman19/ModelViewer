import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { vi, Mock } from 'vitest';

export function createMockProcess(mockSpawn: Mock) {
  const mockProc = new EventEmitter() as any;
  mockProc.stdout = new PassThrough();
  mockProc.stderr = new PassThrough();
  // Ensure stderr mimics a real stream with pipe/resume methods often used
  mockProc.stderr.pipe = vi.fn();
  mockProc.stderr.resume = vi.fn();

  mockProc.kill = vi.fn();

  // When spawn is called, it returns this process
  mockSpawn.mockReturnValue(mockProc);

  return mockProc;
}
