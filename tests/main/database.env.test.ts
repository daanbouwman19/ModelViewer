import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as database from '../../src/main/database';
import { app } from 'electron';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(),
    isPackaged: false,
  },
}));

// Mock core database
vi.mock('../../src/core/database', () => ({
  initDatabase: vi.fn(),
  closeDatabase: vi.fn(),
}));

describe('Main Database Environment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Default mock return
    vi.mocked(app.getPath).mockReturnValue('/mock/user/data');
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('should use correct worker path in packaged app', async () => {
    // Simulate packaged app
    // We need to re-import or use defineProperty if the module reads generic consts at top level
    // But initDatabase is a function, so it evaluates at runtime.

    // We need to mock app.isPackaged property
    Object.defineProperty(app, 'isPackaged', {
      get: () => true,
      configurable: true,
    });

    await database.initDatabase();

    // Check call arguments to initCoreDatabase
    const initCore = await import('../../src/core/database');
    expect(initCore.initDatabase).toHaveBeenCalledWith(
      expect.stringContaining('media_slideshow_stats.sqlite'),
      expect.stringContaining('database-worker.js'),
    );
    // In packaged mode, it uses path.join(__dirname, ...) which might be hard to match exact string without knowing __dirname in test context,
    // but we can check it's NOT the URL object or src path.
  });

  it('should use URL mock in development/other environment', async () => {
    Object.defineProperty(app, 'isPackaged', {
      get: () => false,
      configurable: true,
    });
    process.env.NODE_ENV = 'development';
    process.env.VITEST = 'false'; // Simulate not in vitest for this specific check if needed

    await database.initDatabase();

    const initCore = await import('../../src/core/database');
    // The second arg should be a URL object
    expect(initCore.initDatabase).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(URL),
    );
  });
});
