import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { ipcMain } from 'electron';

// Mock dependencies
vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
    realpath: vi.fn(),
  },
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  default: {
    spawn: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  app: {
    getPath: vi.fn().mockReturnValue('/tmp'),
    isPackaged: false,
    on: vi.fn(),
    quit: vi.fn(),
    commandLine: {
      appendSwitch: vi.fn(),
    },
  },
  BrowserWindow: vi.fn(),
  dialog: {
    showOpenDialog: vi.fn(),
  },
}));

vi.mock('../../src/main/database', () => ({
  getMediaDirectories: vi.fn(),
  initDatabase: vi.fn(),
  recordMediaView: vi.fn(),
  getMediaViewCounts: vi.fn(),
  closeDatabase: vi.fn(),
  addMediaDirectory: vi.fn(),
  removeMediaDirectory: vi.fn(),
  setDirectoryActiveState: vi.fn(),
}));

vi.mock('../../src/core/database', () => ({
  getMediaDirectories: vi.fn(),
  initDatabase: vi.fn(),
  recordMediaView: vi.fn(),
  getMediaViewCounts: vi.fn(),
  closeDatabase: vi.fn(),
  addMediaDirectory: vi.fn(),
  removeMediaDirectory: vi.fn(),
  setDirectoryActiveState: vi.fn(),
}));

vi.mock('../../src/main/local-server', () => ({
  startLocalServer: vi.fn(),
  stopLocalServer: vi.fn(),
  getServerPort: vi.fn().mockReturnValue(0),
  getMimeType: vi.fn().mockReturnValue('image/jpeg'),
}));

vi.mock('../../src/core/media-service', () => ({
  getAlbumsWithViewCountsAfterScan: vi.fn(),
  getAlbumsWithViewCounts: vi.fn(),
}));

describe('Security: open-in-vlc', () => {
  let handler: (event: any, ...args: any[]) => any;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  const setupHandler = async () => {
    // We need to re-import main to trigger the ipcMain.handle calls again
    await import('../../src/main/main');
    const handleMock = ipcMain.handle as unknown as Mock;
    const call = handleMock.mock.calls.find(
      (c: any[]) => c[0] === 'open-in-vlc',
    );
    if (call) {
      handler = call[1];
    } else {
      throw new Error('Handler not found');
    }
  };

  it(
    'should deny access to files outside allowed media directories',
    { timeout: 20000 },
    async () => {
      await setupHandler();
      const db = await import('../../src/core/database');
      const cp = await import('child_process');
      const fsPromises = await import('fs/promises');

      // Force platform to linux
      Object.defineProperty(process, 'platform', { value: 'linux' });

      // Mock spawn
      const mockChild = { unref: vi.fn(), on: vi.fn() };
      (cp.default.spawn as unknown as Mock).mockReturnValue(mockChild);
      (cp.spawn as unknown as Mock).mockReturnValue(mockChild);

      // Setup allowed directories
      (db.getMediaDirectories as unknown as Mock).mockResolvedValue([
        { path: '/allowed/media', isActive: true },
      ]);

      const sensitiveFile = '/etc/passwd';

      // Mock fs.realpath so it resolves successfully to the sensitive file
      (fsPromises.default.realpath as unknown as Mock).mockResolvedValue(
        sensitiveFile,
      );

      const result = await handler(null, sensitiveFile);

      expect(result.data).toEqual({
        success: false,
        message: expect.stringContaining('Access denied'),
      });

      expect(cp.default.spawn).not.toHaveBeenCalled();
    },
  );
});
