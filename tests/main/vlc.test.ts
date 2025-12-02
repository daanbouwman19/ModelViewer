import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { ipcMain } from 'electron';
import fs from 'fs';

// Hoist the mock function so it's accessible in the factory and the test
const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}));

// Mock dependencies
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
}));

vi.mock('child_process', () => {
  return {
    spawn: mockSpawn,
    default: { spawn: mockSpawn },
  };
});

vi.mock('electron', () => {
  const ipcMain = {
    handle: vi.fn(),
  };
  return {
    ipcMain,
    app: {
      isPackaged: true,
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
  };
});

vi.mock('../../src/main/local-server.js', () => ({
  getServerPort: vi.fn(),
  getMimeType: vi.fn(),
  startLocalServer: vi.fn(),
  stopLocalServer: vi.fn(),
}));

vi.mock('../../src/main/database.js', () => ({
  initDatabase: vi.fn(),
  closeDatabase: vi.fn(),
}));

describe('Main Process IPC - open-in-vlc', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let openInVlcHandler: (event: any, filePath: string) => Promise<any>;
  const originalPlatform = process.platform;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Import main.js to register the handlers
    await import('../../src/main/main.js');

    // Find the handler
    const handleCalls = (ipcMain.handle as unknown as Mock).mock.calls;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = handleCalls.find((call: any[]) => call[0] === 'open-in-vlc');
    if (call) {
      openInVlcHandler = call[1];
    }
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  it('should be registered', () => {
    expect(openInVlcHandler).toBeDefined();
  });

  it('should fail if VLC is not found on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    (fs.existsSync as unknown as Mock).mockReturnValue(false);

    const result = await openInVlcHandler({}, 'C:\\video.mp4');

    expect(result.success).toBe(false);
    expect(result.message).toContain('VLC Media Player not found');
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should succeed if VLC is found on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fs.existsSync as unknown as Mock).mockImplementation((path: any) =>
      path.includes('vlc.exe'),
    );

    const mockChild = { unref: vi.fn(), on: vi.fn() };
    mockSpawn.mockReturnValue(mockChild);

    const result = await openInVlcHandler({}, 'C:\\video.mp4');

    expect(result.success).toBe(true);
    expect(mockSpawn).toHaveBeenCalled();
    expect(mockChild.unref).toHaveBeenCalled();
  });

  it('should attempt to spawn "vlc" on Linux', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });

    const mockChild = { unref: vi.fn(), on: vi.fn() };
    mockSpawn.mockReturnValue(mockChild);

    const result = await openInVlcHandler({}, '/home/user/video.mp4');

    expect(result.success).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith(
      'vlc',
      ['/home/user/video.mp4'],
      expect.anything(),
    );
  });

  it('should use standard path on macOS if it exists', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    (fs.existsSync as unknown as Mock).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (path: any) => path === '/Applications/VLC.app/Contents/MacOS/VLC',
    );

    const mockChild = { unref: vi.fn(), on: vi.fn() };
    mockSpawn.mockReturnValue(mockChild);

    const result = await openInVlcHandler({}, '/Users/video.mp4');

    expect(result.success).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith(
      '/Applications/VLC.app/Contents/MacOS/VLC',
      ['/Users/video.mp4'],
      expect.anything(),
    );
  });

  it('should fallback to "vlc" on macOS if standard path does not exist', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    (fs.existsSync as unknown as Mock).mockReturnValue(false);

    const mockChild = { unref: vi.fn(), on: vi.fn() };
    mockSpawn.mockReturnValue(mockChild);

    const result = await openInVlcHandler({}, '/Users/video.mp4');

    expect(result.success).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith(
      'vlc',
      ['/Users/video.mp4'],
      expect.anything(),
    );
  });

  it('should attach error listener to child process', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });

    const mockOn = vi.fn();
    const mockChild = { unref: vi.fn(), on: mockOn };
    mockSpawn.mockReturnValue(mockChild);

    await openInVlcHandler({}, '/home/user/video.mp4');

    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('should handle synchronous spawn errors', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    mockSpawn.mockImplementation(() => {
      throw new Error('Spawn failed');
    });

    const result = await openInVlcHandler({}, '/home/user/video.mp4');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to launch VLC: Spawn failed');
  });
});
