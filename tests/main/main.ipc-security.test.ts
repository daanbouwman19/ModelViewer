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
  shell: {
    openExternal: vi.fn(),
  },
}));

// Mock local server and database
vi.mock('../../src/main/local-server.js', () => ({
  getServerPort: vi.fn(),
  getMimeType: vi.fn(),
  startLocalServer: vi.fn(),
  stopLocalServer: vi.fn(),
}));

vi.mock('../../src/main/database', () => ({
  getMediaDirectories: vi.fn(),
  initDatabase: vi.fn().mockResolvedValue(undefined),
  recordMediaView: vi.fn(),
  getMediaViewCounts: vi.fn(),
  upsertMetadata: vi.fn(),
  setRating: vi.fn(),
  getMetadata: vi.fn(),
  closeDatabase: vi.fn(),
  addMediaDirectory: vi.fn(),
  removeMediaDirectory: vi.fn(),
  setDirectoryActiveState: vi.fn(),
}));

// Mock security module
vi.mock('../../src/core/security', () => ({
  authorizeFilePath: vi.fn(),
}));

describe('main.js IPC Security', () => {
  let handlers: { [key: string]: (event: any, ...args: any[]) => any } = {};

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Setup authorizeFilePath default to deny
    const security = await import('../../src/core/security');
    (security.authorizeFilePath as unknown as Mock).mockResolvedValue({
      isAllowed: false,
      message: 'Access denied',
    });

    // Import main.js to register the handlers
    await import('../../src/main/main.js');

    // Collect all registered handlers
    const handleMock = ipcMain.handle as unknown as Mock;
    handleMock.mock.calls.forEach((call: any[]) => {
      handlers[call[0]] = call[1];
    });
  });

  it('should deny record-media-view for unauthorized file', async () => {
    const unauthorizedPath = '/etc/passwd';
    const db = await import('../../src/main/database');
    const handler = handlers['record-media-view'];

    expect(handler).toBeDefined();

    // Expecting rejection (access denied) or at least not calling db
    // Currently (vulnerable) it will not reject and will call db
    await expect(handler(null, unauthorizedPath)).rejects.toThrow();

    expect(db.recordMediaView).not.toHaveBeenCalled();
  });

  it('should allow record-media-view for authorized file', async () => {
    const authorizedPath = '/media/movie.mp4';
    const security = await import('../../src/core/security');
    (security.authorizeFilePath as unknown as Mock).mockResolvedValue({
      isAllowed: true,
    });
    const db = await import('../../src/main/database');
    const handler = handlers['record-media-view'];

    await handler(null, authorizedPath);
    expect(db.recordMediaView).toHaveBeenCalledWith(authorizedPath);
  });

  it('should allow record-media-view for gdrive file', async () => {
    const gdrivePath = 'gdrive://12345';
    const db = await import('../../src/main/database');
    const handler = handlers['record-media-view'];

    await handler(null, gdrivePath);
    expect(db.recordMediaView).toHaveBeenCalledWith(gdrivePath);
  });

  it('should filter unauthorized paths in get-media-view-counts', async () => {
    const paths = ['/media/allowed.mp4', '/etc/passwd', 'gdrive://123'];
    const security = await import('../../src/core/security');
    (security.authorizeFilePath as unknown as Mock).mockImplementation(
      async (p) => {
        if (p === '/media/allowed.mp4') return { isAllowed: true };
        return { isAllowed: false };
      },
    );

    const db = await import('../../src/main/database');
    const handler = handlers['get-media-view-counts'];

    await handler(null, paths);

    expect(db.getMediaViewCounts).toHaveBeenCalledWith(
      expect.arrayContaining(['/media/allowed.mp4', 'gdrive://123']),
    );
    expect(db.getMediaViewCounts).toHaveBeenCalledWith(
      expect.not.arrayContaining(['/etc/passwd']),
    );
  });

  it('should deny db:upsert-metadata for unauthorized file', async () => {
    const unauthorizedPath = '/etc/passwd';
    const db = await import('../../src/main/database');
    const handler = handlers['db:upsert-metadata'];

    expect(handler).toBeDefined();

    await expect(
      handler(null, { filePath: unauthorizedPath, metadata: {} }),
    ).rejects.toThrow();
    expect(db.upsertMetadata).not.toHaveBeenCalled();
  });
});
