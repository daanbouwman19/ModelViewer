import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('API Index', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should return ElectronAdapter when window.electronAPI is defined', async () => {
    global.window.electronAPI = {} as any;

    // Dynamic import to trigger evaluation of createBackend()
    // Also re-import ElectronAdapter to match the new module registry context
    const { api } = await import('../../../src/renderer/api/index');
    const { ElectronAdapter } =
      await import('../../../src/renderer/api/ElectronAdapter');

    expect(api).toBeInstanceOf(ElectronAdapter);
  });

  it('should return WebAdapter when window.electronAPI is undefined', async () => {
    global.window.electronAPI = undefined as any;

    vi.resetModules();
    const { api } = await import('../../../src/renderer/api/index');
    const { WebAdapter } = await import('../../../src/renderer/api/WebAdapter');

    expect(api).toBeInstanceOf(WebAdapter);
  });
});
