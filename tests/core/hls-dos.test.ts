import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HlsManager } from '../../src/core/hls-manager.ts';
import { MAX_CONCURRENT_TRANSCODES } from '../../src/core/constants.ts';
import EventEmitter from 'events';

const { mockSpawn, mockFsMkdir, mockFsAccess, mockFsRm, mockFsReadFile } =
  vi.hoisted(() => ({
    mockSpawn: vi.fn(),
    mockFsMkdir: vi.fn(),
    mockFsAccess: vi.fn(),
    mockFsRm: vi.fn(),
    mockFsReadFile: vi.fn(),
  }));

vi.mock('child_process', () => ({
  spawn: mockSpawn,
  default: { spawn: mockSpawn },
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdir: mockFsMkdir,
    access: mockFsAccess,
    rm: mockFsRm,
    readFile: mockFsReadFile,
  },
  mkdir: mockFsMkdir,
  access: mockFsAccess,
  rm: mockFsRm,
  readFile: mockFsReadFile,
  constants: { F_OK: 0 },
}));

vi.mock('ffmpeg-static', () => ({
  default: '/usr/bin/ffmpeg',
}));

describe('HlsManager DOS Protection', () => {
  const CACHE_DIR = '/tmp/hls';
  let hlsManager: HlsManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Singleton management
    hlsManager = HlsManager.getInstance();
    hlsManager.setCacheDir(CACHE_DIR);

    // Clear sessions
    if (hlsManager) {
      hlsManager.stopCleanupInterval();
      if ((hlsManager as any).sessions) {
        (hlsManager as any).sessions.clear();
      }
    }

    // Default fs behavior
    mockFsAccess.mockResolvedValue(undefined); // File exists
    mockFsMkdir.mockResolvedValue(undefined);
    mockFsRm.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enforces max concurrent sessions limit (DOS PREVENTION)', async () => {
    const limit = MAX_CONCURRENT_TRANSCODES;

    // Mock successful process spawn
    mockSpawn.mockImplementation(() => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.kill = vi.fn();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.exitCode = null;
      mockProcess.killed = false;
      return mockProcess;
    });

    // 1. Fill the slots up to the limit
    for (let i = 0; i < limit; i++) {
      await hlsManager.ensureSession(`session-${i}`, `/path/file-${i}.mp4`);
    }

    expect(mockSpawn).toHaveBeenCalledTimes(limit);

    // 2. Try to add one more
    await expect(
      hlsManager.ensureSession(`session-${limit}`, `/path/file-${limit}.mp4`),
    ).rejects.toThrow('Server too busy');

    // 3. Ensure no new spawn occurred
    expect(mockSpawn).toHaveBeenCalledTimes(limit);
  });
});
