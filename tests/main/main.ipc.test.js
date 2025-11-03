import { describe, it, expect, vi, beforeEach } from 'vitest';
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

vi.mock('electron', () => {
  const ipcMain = {
    handle: vi.fn(),
  };
  return { ipcMain, app: { isPackaged: true, on: vi.fn() } };
});

vi.mock('../../src/main/local-server.js', () => ({
  getServerPort: vi.fn(),
  getMimeType: vi.fn(),
}));

describe('main.js IPC Handlers', () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Import main.js to register the handlers
    await import('../../src/main/main.js');
    // Find the handler for 'load-file-as-data-url'
    const handleMock = ipcMain.handle;
    const call = handleMock.mock.calls.find(
      (c) => c[0] === 'load-file-as-data-url',
    );
    if (call) {
      handler = call[1];
    }
  });

  it('should return a generic error for a non-existent file', () => {
    const nonExistentPath = '/path/to/nothing.txt';
    fs.existsSync.mockReturnValue(false);

    const result = handler(null, nonExistentPath);

    expect(result).toEqual({
      type: 'error',
      message: `File does not exist: ${nonExistentPath}`,
    });
    expect(fs.existsSync).toHaveBeenCalledWith(nonExistentPath);
  });
});
