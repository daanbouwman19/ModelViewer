import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InternalMediaProxy } from '../../src/core/media-proxy';

// Hoist mocks
const { mockListen, mockCreateServer } = vi.hoisted(() => {
    const mockListen = vi.fn();
    const mockCreateServer = vi.fn().mockReturnValue({
        listen: mockListen,
        address: vi.fn().mockReturnValue({ port: 54321 }),
        on: vi.fn(),
        close: vi.fn(),
    });
    return { mockListen, mockCreateServer };
});

vi.mock('http', () => ({
  default: {
    createServer: mockCreateServer,
  }
}));

describe('InternalMediaProxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (InternalMediaProxy as any).instance = null;
  });

  it('getInstance returns singleton', () => {
    const i1 = InternalMediaProxy.getInstance();
    const i2 = InternalMediaProxy.getInstance();
    expect(i1).toBe(i2);
    expect(mockCreateServer).toHaveBeenCalledTimes(1);
  });

  it('getUrlForFile starts server if needed and returns url', async () => {
    const proxy = InternalMediaProxy.getInstance();

    // Setup listen callback
    mockListen.mockImplementation((port: any, host: any, cb: any) => {
        if (typeof host === 'function') host();
        else if (typeof cb === 'function') cb();
    });

    const url = await proxy.getUrlForFile('file1');

    expect(mockListen).toHaveBeenCalled();
    expect(url).toContain('127.0.0.1:54321/stream/file1');
  });
});
