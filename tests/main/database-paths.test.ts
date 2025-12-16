import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock core database to intercept calls and avoid side effects
vi.mock('../../src/core/database', () => ({
  initDatabase: vi.fn(),
  // We don't need to re-export others for this test
}));

describe('Main Process Database Initialization Paths', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalVitest = process.env.VITEST;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.VITEST = originalVitest;
    vi.doUnmock('electron');
  });

  it('should use correct worker path when packaged', async () => {
    // Mock electron with isPackaged = true
    vi.doMock('electron', () => ({
      app: {
        getPath: () => '/user/data',
        isPackaged: true,
      },
    }));

    // Import module under test
    const { initDatabase } = await import('../../src/main/database');
    const { initDatabase: initCore } = await import('../../src/core/database');

    await initDatabase();

    // Verify initCore was called with a string path ending in database-worker.js
    expect(initCore).toHaveBeenCalledWith(
      expect.stringContaining('media_slideshow_stats.sqlite'),
      expect.stringMatching(/database-worker\.js$/),
    );
  });

  it('should use correct worker URL in development', async () => {
    // Mock electron with isPackaged = false
    vi.doMock('electron', () => ({
      app: {
        getPath: () => '/user/data',
        isPackaged: false,
      },
    }));

    // Mock environment to look like development
    process.env.NODE_ENV = 'development';
    process.env.VITEST = 'false';

    // Import module under test
    const { initDatabase } = await import('../../src/main/database');
    const { initDatabase: initCore } = await import('../../src/core/database');

    await initDatabase();

    // Verify initCore was called with a URL object
    expect(initCore).toHaveBeenCalledWith(
      expect.stringContaining('media_slideshow_stats.sqlite'),
      expect.any(URL),
    );
  });

  it('should use correct worker path in test environment', async () => {
    // Mock electron with isPackaged = false
    vi.doMock('electron', () => ({
      app: {
        getPath: () => '/user/data',
        isPackaged: false,
      },
    }));

    // Mock environment to look like test
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';

    // Import module under test
    const { initDatabase } = await import('../../src/main/database');
    const { initDatabase: initCore } = await import('../../src/core/database');

    await initDatabase();

    // Verify initCore was called with the TS worker path
    expect(initCore).toHaveBeenCalledWith(
      expect.stringContaining('media_slideshow_stats.sqlite'),
      expect.stringContaining('database-worker.ts'),
    );
  });
});
