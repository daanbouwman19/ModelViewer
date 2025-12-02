import { describe, it, expect, afterEach, beforeEach, vi, Mock } from 'vitest';
import http from 'http';
import {
  startLocalServer,
  stopLocalServer,
  getServerPort,
} from '../../src/main/local-server';
import { getMediaDirectories } from '../../src/main/database';
import EventEmitter from 'events';

// Mock dependencies
vi.mock('../../src/main/database', () => ({
  getMediaDirectories: vi.fn(),
}));

vi.mock('ffmpeg-static', () => ({ default: '/usr/bin/ffmpeg' }));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();

  // Create a mock spawn that returns an EventEmitter-like object
  // so we can emit 'close'
  const spawnMock = vi.fn().mockImplementation(() => {
    const cp: any = new EventEmitter();
    cp.stderr = new EventEmitter();
    cp.stdout = new EventEmitter();
    cp.stdout.pipe = vi.fn();
    cp.kill = vi.fn();
    cp.unref = vi.fn();

    // Trigger close asynchronously to simulate process finishing
    setTimeout(() => {
      cp.emit('close', 0);
    }, 10);

    return cp;
  });

  return {
    ...actual,
    spawn: spawnMock,
    default: {
      ...actual,
      spawn: spawnMock,
    },
  };
});

describe('Local Server Encoding Bug', () => {
  beforeEach(() => {
    (getMediaDirectories as unknown as Mock).mockResolvedValue([
      { path: '/tmp' },
    ]);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => stopLocalServer(resolve));
    vi.restoreAllMocks();
  });

  it('should handle file paths with percent characters without crashing', async () => {
    await new Promise<void>((resolve) => startLocalServer(resolve));
    const port = getServerPort();

    // A file name with a '%' that is NOT followed by two hex digits.
    // URL encoded: "/tmp/test%25file.mp4" -> server receives "/tmp/test%file.mp4"
    const badFileName = '/tmp/test%file.mp4';
    const encodedFileName = encodeURIComponent(badFileName);

    await new Promise<void>((resolve, reject) => {
      const req = http.get(
        `http://localhost:${port}/video/metadata?file=${encodedFileName}`,
        (res) => {
          // If we receive a response, the server didn't crash.
          // We expect a valid status code.
          expect(res.statusCode).toBeDefined();
          resolve();
        },
      );

      req.on('error', (err) => {
        // If the server crashes, the client request usually errors with ECONNRESET or similar.
        reject(err);
      });
    });
  });
});
