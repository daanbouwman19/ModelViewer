import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { ipcMain } from 'electron';
import path from 'path';

// Mock dependencies
vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
    realpath: vi.fn(),
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

describe('Security: load-file-as-data-url', () => {
  let handler: (event: any, ...args: any[]) => any;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  const setupHandler = async () => {
    // Import main.js to register the handlers
    await import('../../src/main/main');
    // Find the handler for 'load-file-as-data-url'
    const handleMock = ipcMain.handle as unknown as Mock;
    const call = handleMock.mock.calls.find(
      (c: any[]) => c[0] === 'load-file-as-data-url',
    );
    if (call) {
      handler = call[1];
    } else {
      throw new Error('Handler not found');
    }
  };

  it('should allow access to files within allowed media directories', async () => {
    await setupHandler();
    const fsPromises = await import('fs/promises');
    const db = await import('../../src/main/database');

    // Setup allowed directories
    const allowedDir = '/allowed/media';
    (db.getMediaDirectories as unknown as Mock).mockResolvedValue(
      [{ path: allowedDir, isActive: true }],
    );

    const validFile = path.join(allowedDir, 'image.jpg');

    // Mock FS calls
    (fsPromises.default.realpath as unknown as Mock).mockResolvedValue(validFile);
    (fsPromises.default.stat as unknown as Mock).mockResolvedValue({
      size: 1000,
    });
    (fsPromises.default.readFile as unknown as Mock).mockResolvedValue(
      Buffer.from('test'),
    );

    const result = await handler(null, validFile);

    expect(result).toHaveProperty('type', 'data-url');
  });

  it('should deny access to files outside allowed media directories', async () => {
    await setupHandler();
    const fsPromises = await import('fs/promises');
    const db = await import('../../src/main/database');

    // Setup allowed directories
    (db.getMediaDirectories as unknown as Mock).mockResolvedValue(
      [{ path: '/allowed/media', isActive: true }],
    );

    const sensitiveFile = '/etc/passwd';

    // Mock FS to pretend the file exists
    (fsPromises.default.realpath as unknown as Mock).mockResolvedValue(sensitiveFile);

    const result = await handler(null, sensitiveFile);

    expect(result).toEqual({
      type: 'error',
      message: expect.stringContaining('Access denied'),
    });
  });

  it('should deny path traversal attempts', async () => {
    await setupHandler();
    const fsPromises = await import('fs/promises');
    const db = await import('../../src/main/database');

    const allowedDir = '/allowed/media';
    (db.getMediaDirectories as unknown as Mock).mockResolvedValue(
      [{ path: allowedDir, isActive: true }],
    );

    // Attempt to break out of the directory
    const traversalPath = path.join(allowedDir, '../../etc/passwd');
    const resolvedPath = '/etc/passwd';

    // Mock FS
    (fsPromises.default.realpath as unknown as Mock).mockResolvedValue(resolvedPath);

    const result = await handler(null, traversalPath);

    expect(result).toEqual({
      type: 'error',
      message: expect.stringContaining('Access denied'),
    });
  });

  it('should deny symlink traversal attacks', async () => {
    await setupHandler();
    const fsPromises = await import('fs/promises');
    const db = await import('../../src/main/database');

    const allowedDir = '/allowed/media';
    (db.getMediaDirectories as unknown as Mock).mockResolvedValue(
      [{ path: allowedDir, isActive: true }],
    );

    // Symlink inside allowed directory pointing outside
    const symlinkPath = path.join(allowedDir, 'secret_link');
    const targetPath = '/etc/passwd';

    // Mock realpath to return the sensitive target
    (fsPromises.default.realpath as unknown as Mock).mockResolvedValue(targetPath);

    const result = await handler(null, symlinkPath);

    expect(result).toEqual({
      type: 'error',
      message: expect.stringContaining('Access denied'),
    });
  });
});
