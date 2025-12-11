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

vi.mock('../../src/main/local-server.js', () => ({
  getServerPort: vi.fn(),
  getMimeType: vi.fn(),
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

describe('main.js IPC Handlers', () => {
  let handler: (event: any, ...args: any[]) => any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Setup default mock response for getMediaDirectories
    const db = await import('../../src/main/database');
    (db.getMediaDirectories as unknown as Mock).mockResolvedValue(
      [{ path: '/path/to', isActive: true }]
    );

    // Import main.js to register the handlers
    await import('../../src/main/main.js');
    // Find the handler for 'load-file-as-data-url'
    const handleMock = ipcMain.handle as unknown as Mock;
    const call = handleMock.mock.calls.find(
      (c: any[]) => c[0] === 'load-file-as-data-url',
    );
    if (call) {
      handler = call[1];
    }
  });

  it('should return a descriptive error for a non-existent file', async () => {
    const nonExistentPath = '/path/to/nothing.txt';
    const fsPromises = await import('fs/promises');
    (fsPromises.default.realpath as unknown as Mock).mockRejectedValue(
      new Error('ENOENT'),
    );

    const result = await handler(null, nonExistentPath);

    expect(result).toEqual({
      type: 'error',
      message: `File does not exist: ${nonExistentPath}`,
    });
    expect(fsPromises.default.realpath).toHaveBeenCalledWith(nonExistentPath);
  });
});
