import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IMediaSource } from '../../src/core/media-source-types';
import { PassThrough } from 'stream';
import { createMockProcess } from './test-utils';

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

vi.mock('../../src/core/security');
vi.mock('../../src/core/media-source', () => ({
  createMediaSource: vi.fn(() => ({
    getSize: vi.fn(),
    getMimeType: vi.fn(),
    getStream: vi.fn(),
    getFFmpegInput: vi.fn().mockResolvedValue('/path/to/video.mp4'),
  })),
}));

import {
  serveTranscodedStream,
  handleStreamRequest,
} from '../../src/core/media-handler';
import * as security from '../../src/core/security';

describe('media-handler input validation', () => {
  let req: any;
  let res: any;
  let mockSource: IMediaSource;

  beforeEach(() => {
    vi.clearAllMocks();
    req = { headers: {}, query: {}, on: vi.fn() };

    // Mock res as a Writable Stream
    res = new PassThrough();
    res.writeHead = vi.fn();
    res.headersSent = false;
    res.status = vi.fn().mockReturnThis();
    res.send = vi.fn();
    res.json = vi.fn();
    res.set = vi.fn().mockReturnThis();
    res.setHeader = vi.fn();
    res.sendFile = vi.fn();

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
    createMockProcess(mockSpawn);

    const validInput = '10.5';

    await serveTranscodedStream(req, res, mockSource, 'ffmpeg', validInput);

    expect(mockSpawn).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-ss', validInput]),
    );
  });

  it('accepts valid timestamp', async () => {
    createMockProcess(mockSpawn);

    const validInput = '00:01:30';

    await serveTranscodedStream(req, res, mockSource, 'ffmpeg', validInput);

    expect(mockSpawn).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-ss', validInput]),
    );
  });

  describe('query parameter array support', () => {
    it('handles "file" parameter as an array by taking the first element', async () => {
      req.query = { file: ['/valid/path/1.mp4', '/valid/path/2.mp4'] };

      vi.mocked(security.authorizeFilePath).mockResolvedValue({
        isAllowed: true,
      });

      await handleStreamRequest(req, res, 'ffmpeg');

      expect(security.authorizeFilePath).toHaveBeenCalledWith(
        '/valid/path/1.mp4',
      );
      expect(res.sendFile).toHaveBeenCalledWith('/valid/path/1.mp4');
    });

    it('handles "startTime" parameter as an array by taking the first element', async () => {
      createMockProcess(mockSpawn);

      req.query = {
        file: '/valid/path/1.mp4',
        startTime: ['15', '25'],
        transcode: 'true',
      };

      vi.mocked(security.authorizeFilePath).mockResolvedValue({
        isAllowed: true,
      });

      await handleStreamRequest(req, res, 'ffmpeg');

      expect(mockSpawn).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining(['-ss', '15']),
      );
    });
  });
});
