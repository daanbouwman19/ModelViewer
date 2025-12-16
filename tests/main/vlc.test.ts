import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { ipcMain } from 'electron';

// Hoist the mock function so it's accessible in the factory and the test
const { mockSpawn, mockFsAccess, mockRealpath, mockGetMediaDirectories } =
  vi.hoisted(() => ({
    mockSpawn: vi.fn(),
    mockFsAccess: vi.fn(),
    mockRealpath: vi.fn(),
    mockGetMediaDirectories: vi.fn(),
  }));

// Mock path module to be platform-aware based on process.platform
vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal<any>();
  const win32 = {
    ...actual.win32,
    relative: (from: string, to: string) => {
      if (to.startsWith(from)) {
        return to.slice(from.length).replace(/^\\/, '');
      }
      return '..\\outside';
    },
    isAbsolute: (p: string) => /^[a-zA-Z]:\\/.test(p),
    sep: '\\',
  };
  const posix = {
    relative: (from: string, to: string) => {
      if (to.startsWith(from)) {
        return to.slice(from.length).replace(/^\//, '');
      }
      return '../outside';
    },
    isAbsolute: (p: string) => p.startsWith('/'),
    sep: '/',
  };

  const mocked = {
    ...actual,
    ...posix,
    join: (...args: string[]) =>
      args.join(process.platform === 'win32' ? '\\' : '/'),
    resolve: actual.resolve,
    dirname: actual.dirname,
    basename: actual.basename,
    extname: actual.extname,
    win32,
    posix,
    relative: (from: string, to: string) => {
      return process.platform === 'win32'
        ? win32.relative(from, to)
        : posix.relative(from, to);
    },
    isAbsolute: (p: string) => {
      return process.platform === 'win32'
        ? win32.isAbsolute(p)
        : posix.isAbsolute(p);
    },
  };
  return {
    ...mocked,
    default: mocked,
  };
});

vi.mock('fs/promises', () => ({
  default: {
    access: mockFsAccess,
    stat: vi.fn(),
    readFile: vi.fn(),
    realpath: mockRealpath,
  },
}));

vi.mock('child_process', () => {
  return {
    spawn: mockSpawn,
    exec: vi.fn(),
    default: { spawn: mockSpawn, exec: vi.fn() },
  };
});

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
  startLocalServer: vi.fn(),
  stopLocalServer: vi.fn(),
}));

vi.mock('../../src/core/database', () => ({
  initDatabase: vi.fn(),
  closeDatabase: vi.fn(),
  getMediaDirectories: mockGetMediaDirectories,
}));

describe('Main Process IPC - open-in-vlc', () => {
  let openInVlcHandler: (event: any, filePath: string) => Promise<any>;
  const originalPlatform = process.platform;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Default mocks
    mockRealpath.mockImplementation(async (p) => p);

    // Default allowed directories (covers both win/unix examples)
    mockGetMediaDirectories.mockResolvedValue([
      { path: 'C:\\', isActive: true },
      { path: '/home/user', isActive: true },
      { path: '/Users', isActive: true },
      { path: '/', isActive: true },
    ]);

    // Import main.js to register the handlers
    await import('../../src/main/main.js');

    // Find the handler
    const handleCalls = (ipcMain.handle as unknown as Mock).mock.calls;

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
    mockFsAccess.mockRejectedValue(new Error('ENOENT'));

    const result = await openInVlcHandler({}, 'C:\\video.mp4');

    expect(result.success).toBe(false);
    expect(result.message).toContain('VLC Media Player not found');
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should succeed if VLC is found on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    mockFsAccess.mockImplementation((path: any) =>
      path.includes('vlc.exe')
        ? Promise.resolve()
        : Promise.reject(new Error('ENOENT')),
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
    mockFsAccess.mockImplementation((path: any) =>
      path === '/Applications/VLC.app/Contents/MacOS/VLC'
        ? Promise.resolve()
        : Promise.reject(new Error('ENOENT')),
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
    mockFsAccess.mockRejectedValue(new Error('ENOENT'));

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
