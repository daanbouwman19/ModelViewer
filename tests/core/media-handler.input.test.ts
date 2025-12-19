import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IMediaSource } from '../../src/core/media-source-types';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

// Mock child_process using vi.hoisted
const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: mockSpawn,
  default: { spawn: mockSpawn },
}));

// Mock other dependencies to prevent side effects
vi.mock('fs/promises', () => ({ default: { stat: vi.fn() } }));
vi.mock('fs', () => ({
  default: { createReadStream: vi.fn() },
  createReadStream: vi.fn(),
}));

import { serveTranscodedStream } from '../../src/core/media-handler';

describe('media-handler input validation', () => {
  let req: any;
  let res: any;
  let mockSource: IMediaSource;

  beforeEach(() => {
    vi.clearAllMocks();
    req = { headers: {}, on: vi.fn() };

    // Mock res as a Writable Stream
    res = new PassThrough();
    res.writeHead = vi.fn();
    res.headersSent = false;

    mockSource = {
      getFFmpegInput: vi.fn().mockResolvedValue('/path/to/video.mp4'),
      getStream: vi.fn(),
      getSize: vi.fn(),
      getMimeType: vi.fn(),
    };
  });

  it('rejects invalid startTime (Security Fix Verified)', async () => {
    const maliciousInput = '10; rm -rf /';

    await expect(
      serveTranscodedStream(req, res, mockSource, 'ffmpeg', maliciousInput),
    ).rejects.toThrow('Invalid start time format');

    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('accepts valid startTime', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new PassThrough();
    mockProcess.stderr = new PassThrough();
    mockProcess.kill = vi.fn();
    mockSpawn.mockReturnValue(mockProcess);

    const validInput = '10.5';

    await serveTranscodedStream(req, res, mockSource, 'ffmpeg', validInput);

    expect(mockSpawn).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-ss', validInput]),
    );
  });

  it('accepts valid timestamp', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new PassThrough();
    mockProcess.stderr = new PassThrough();
    mockProcess.kill = vi.fn();
    mockSpawn.mockReturnValue(mockProcess);

    const validInput = '00:01:30';

    await serveTranscodedStream(req, res, mockSource, 'ffmpeg', validInput);

    expect(mockSpawn).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-ss', validInput]),
    );
  });
});
