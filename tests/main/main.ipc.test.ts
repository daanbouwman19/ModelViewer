import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { ipcMain } from 'electron';
import fs from 'fs';

// Mock dependencies
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    statSync: vi.fn(),
    readFileSync: vi.fn(),
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

describe('main.js IPC Handlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handler: (event: any, ...args: any[]) => any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Import main.js to register the handlers
    await import('../../src/main/main.js');
    // Find the handler for 'load-file-as-data-url'
    const handleMock = ipcMain.handle as unknown as Mock;
    const call = handleMock.mock.calls.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any[]) => c[0] === 'load-file-as-data-url',
    );
    if (call) {
      handler = call[1];
    }
  });

  it('should return a descriptive error for a non-existent file', () => {
    const nonExistentPath = '/path/to/nothing.txt';
    (fs.existsSync as unknown as Mock).mockReturnValue(false);

    const result = handler(null, nonExistentPath);

    expect(result).toEqual({
      type: 'error',
      message: `File does not exist: ${nonExistentPath}`,
    });
    expect(fs.existsSync).toHaveBeenCalledWith(nonExistentPath);
  });
});
