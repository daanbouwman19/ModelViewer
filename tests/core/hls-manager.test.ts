import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HlsManager } from '../../src/core/hls-manager.ts';
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

describe('HlsManager', () => {
  const CACHE_DIR = '/tmp/hls';
  let hlsManager: HlsManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Singleton management
    hlsManager = HlsManager.getInstance();
    hlsManager.setCacheDir(CACHE_DIR);

    // Clear sessions
    if ((hlsManager as any).sessions) {
      (hlsManager as any).sessions.clear();
    }

    // Default fs behavior
    mockFsAccess.mockResolvedValue(undefined); // File exists
    mockFsMkdir.mockResolvedValue(undefined);
    mockFsRm.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a new session correctly', async () => {
    const sessionId = 'session1';
    const filePath = '/path/to/movie.mp4';

    const mockProcess = new EventEmitter() as any;
    mockProcess.kill = vi.fn();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(mockProcess);

    await hlsManager.ensureSession(sessionId, filePath);

    expect(mockFsMkdir).toHaveBeenCalledWith(
      expect.stringContaining(sessionId),
      { recursive: true },
    );

    expect(mockSpawn).toHaveBeenCalledWith(
      '/usr/bin/ffmpeg',
      expect.arrayContaining([
        '-i',
        filePath,
        '-f',
        'hls',
        expect.stringContaining('playlist.m3u8'),
      ]),
    );
  });

  it('stops session and cleans up resources', async () => {
    const sessionId = 'session2';
    const filePath = '/path/to/movie.mp4';

    const mockProcess = new EventEmitter() as any;
    mockProcess.kill = vi.fn();
    mockSpawn.mockReturnValue(mockProcess);

    await hlsManager.ensureSession(sessionId, filePath);

    hlsManager.stopSession(sessionId);

    expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
    expect(mockFsRm).toHaveBeenCalledWith(expect.stringContaining(sessionId), {
      recursive: true,
      force: true,
    });
  });

  it('cleans up inactive sessions after timeout', async () => {
    const sessionId = 'session3';
    const filePath = '/path/to/movie.mp4';

    const mockProcess = new EventEmitter() as any;
    mockProcess.kill = vi.fn();
    mockSpawn.mockReturnValue(mockProcess);

    await hlsManager.ensureSession(sessionId, filePath);

    // Advance time by 6 minutes (timeout is 5 min)
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);

    // Manual cleanup call since interval depends on singleton state
    (hlsManager as any).cleanup();

    expect(mockProcess.kill).toHaveBeenCalled();
    expect(mockFsRm).toHaveBeenCalled();
  });

  it('updates last access time on touch', async () => {
    const sessionId = 'session4';
    const filePath = '/path/to/movie.mp4';

    const mockProcess = new EventEmitter() as any;
    mockProcess.kill = vi.fn();
    mockSpawn.mockReturnValue(mockProcess);

    await hlsManager.ensureSession(sessionId, filePath);

    vi.setSystemTime(Date.now() + 3 * 60 * 1000);
    hlsManager.touchSession(sessionId);

    vi.setSystemTime(Date.now() + 3 * 60 * 1000); // +3 min from touch
    (hlsManager as any).cleanup();

    expect(mockProcess.kill).not.toHaveBeenCalled();

    vi.setSystemTime(Date.now() + 3 * 60 * 1000); // +6 min from touch
    (hlsManager as any).cleanup();

    expect(mockProcess.kill).toHaveBeenCalled();
  });
});
