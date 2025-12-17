import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InternalMediaProxy } from '../../src/core/media-proxy';

// Hoist mocks
const {
  mockListen,
  mockCreateServer,
  getCallback,
  getErrorCallback,
  mockGetDriveFileMetadata,
  mockGetDriveStreamWithCache,
} = vi.hoisted(() => {
  const mockListen = vi.fn();
  let serverCallback: any;
  let errorCallback: any;

  const mockOn = vi.fn((event, cb) => {
    if (event === 'error') errorCallback = cb;
  });

  const mockCreateServer = vi.fn((cb) => {
    serverCallback = cb;
    return {
      listen: mockListen,
      address: vi.fn().mockReturnValue({ port: 54321 }),
      on: mockOn,
      close: vi.fn(),
    };
  });
  return {
    mockListen,
    mockCreateServer,
    getCallback: () => serverCallback,
    getErrorCallback: () => errorCallback,
    mockGetDriveFileMetadata: vi.fn(),
    mockGetDriveStreamWithCache: vi.fn(),
  };
});

vi.mock('http', () => ({
  default: {
    createServer: mockCreateServer,
  },
}));

vi.mock('../../src/main/google-drive-service', () => ({
  getDriveFileMetadata: mockGetDriveFileMetadata,
}));

vi.mock('../../src/core/drive-stream', () => ({
  getDriveStreamWithCache: mockGetDriveStreamWithCache,
}));

describe('InternalMediaProxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockReset();
    (InternalMediaProxy as any).instance = null;
  });

  it('getInstance returns singleton', () => {
    const i1 = InternalMediaProxy.getInstance();
    const i2 = InternalMediaProxy.getInstance();
    expect(i1).toBe(i2);
    expect(mockCreateServer).toHaveBeenCalledTimes(1);
  });

  describe('start()', () => {
    it('starts server and resolves', async () => {
      const proxy = InternalMediaProxy.getInstance();

      mockListen.mockImplementation((port: any, host: any, cb: any) => {
        if (typeof host === 'function') host();
        else if (typeof cb === 'function') cb();
      });

      await proxy.start();
      expect(mockListen).toHaveBeenCalled();
      expect(proxy.getPort()).toBe(54321);
    });

    it('rejects if server error occurs', async () => {
      const proxy = InternalMediaProxy.getInstance();
      const startPromise = proxy.start(); // This sets up the listeners

      const errCb = getErrorCallback();
      expect(errCb).toBeDefined();
      errCb(new Error('Listen failed'));

      await expect(startPromise).rejects.toThrow('Listen failed');
    });
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

  describe('Request Handling', () => {
    let handler: any;
    let req: any;
    let res: any;

    beforeEach(() => {
      InternalMediaProxy.getInstance(); // Ensure instance created
      handler = getCallback();
      req = { url: '', headers: {}, on: vi.fn() };
      res = {
        writeHead: vi.fn(),
        end: vi.fn(),
        headersSent: false,
      };
    });

    it('returns 404 for invalid url', async () => {
      req.url = '/invalid';
      await handler(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(404);
      expect(res.end).toHaveBeenCalledWith('Not Found');
    });

    it('handles request processing error', async () => {
      req.url = '/stream/file-123';
      mockGetDriveFileMetadata.mockRejectedValue(new Error('API Fail'));

      await handler(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(500);
      expect(res.end).toHaveBeenCalled();
    });

    it('handles valid stream request', async () => {
      req.url = '/stream/file-123';
      const mockStream = { pipe: vi.fn(), on: vi.fn(), destroy: vi.fn() };

      mockGetDriveFileMetadata.mockResolvedValue({
        size: '1000',
        mimeType: 'video/mp4',
      });
      mockGetDriveStreamWithCache.mockResolvedValue({
        stream: mockStream,
        length: 1000,
      });

      await handler(req, res);

      expect(mockGetDriveFileMetadata).toHaveBeenCalledWith('file-123');
      expect(mockGetDriveStreamWithCache).toHaveBeenCalledWith('file-123', {
        start: 0,
        end: 999,
      });
      expect(res.writeHead).toHaveBeenCalledWith(
        206,
        expect.objectContaining({
          'Content-Type': 'video/mp4',
          'Content-Length': 1000,
          'Content-Range': 'bytes 0-999/1000',
        }),
      );
      expect(mockStream.pipe).toHaveBeenCalledWith(res);
    });

    it('handles range requests', async () => {
      req.url = '/stream/file-123';
      req.headers.range = 'bytes=100-199';
      const mockStream = { pipe: vi.fn(), on: vi.fn(), destroy: vi.fn() };

      mockGetDriveFileMetadata.mockResolvedValue({ size: '1000' });
      mockGetDriveStreamWithCache.mockResolvedValue({
        stream: mockStream,
        length: 100,
      });

      await handler(req, res);

      expect(mockGetDriveStreamWithCache).toHaveBeenCalledWith('file-123', {
        start: 100,
        end: 199,
      });
      expect(res.writeHead).toHaveBeenCalledWith(
        206,
        expect.objectContaining({
          'Content-Length': 100,
          'Content-Range': 'bytes 100-199/1000',
        }),
      );
    });

    it('handles unsatisfiable range requests', async () => {
      req.url = '/stream/file-123';
      // bytes=2000-3000 where size is 1000
      req.headers.range = 'bytes=2000-3000';

      mockGetDriveFileMetadata.mockResolvedValue({ size: '1000' });
      // range-parser will return -1 for unsatisfiable ranges if we used it directly,
      // but here we are relying on InternalMediaProxy to use range-parser.
      // 2000 >= 1000, so it is unsatisfiable.

      await handler(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(
        416,
        expect.objectContaining({ 'Content-Range': 'bytes */1000' }),
      );
      expect(res.end).toHaveBeenCalledWith('Requested range not satisfiable.');
    });

    it('ignores malformed range requests and serves full content', async () => {
      req.url = '/stream/file-123';
      req.headers.range = 'invalid-unit=0-100';

      mockGetDriveFileMetadata.mockResolvedValue({
        size: '1000',
        mimeType: 'video/mp4',
      });
      // InternalMediaProxy uses range-parser. malformed -> -2.
      // Logic: if array -> use it. else if -1 -> 416. else -> full content.
      // So malformed should result in full content.

      const mockStream = { pipe: vi.fn(), on: vi.fn(), destroy: vi.fn() };
      mockGetDriveStreamWithCache.mockResolvedValue({
        stream: mockStream,
        length: 1000,
      });

      await handler(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(
        206,
        expect.objectContaining({
          'Content-Range': 'bytes 0-999/1000',
          'Content-Length': 1000,
        }),
      );
    });

    it('handles open-ended range requests', async () => {
      req.url = '/stream/file-123';
      req.headers.range = 'bytes=100-';
      const mockStream = { pipe: vi.fn(), on: vi.fn(), destroy: vi.fn() };

      mockGetDriveFileMetadata.mockResolvedValue({
        size: '1000',
        mimeType: 'video/mp4',
      });
      mockGetDriveStreamWithCache.mockResolvedValue({
        stream: mockStream,
        length: 900,
      });

      await handler(req, res);

      expect(mockGetDriveStreamWithCache).toHaveBeenCalledWith('file-123', {
        start: 100,
        end: 999,
      });
      expect(res.writeHead).toHaveBeenCalledWith(
        206,
        expect.objectContaining({
          'Content-Range': 'bytes 100-999/1000',
        }),
      );
    });

    it('handles stream errors', async () => {
      req.url = '/stream/file-123';
      const mockStream = { pipe: vi.fn(), on: vi.fn(), destroy: vi.fn() };

      mockGetDriveFileMetadata.mockResolvedValue({ size: '1000' });
      mockGetDriveStreamWithCache.mockResolvedValue({
        stream: mockStream,
        length: 1000,
      });

      await handler(req, res);

      // Simulate stream error
      const errorCall = mockStream.on.mock.calls.find(
        (c: any) => c[0] === 'error',
      );
      if (errorCall) {
        const errorCallback = errorCall[1];
        errorCallback(new Error('Stream failed'));
      }

      expect(res.writeHead).toHaveBeenCalledWith(500);
      expect(res.end).toHaveBeenCalled();
    });

    it('destroys stream on request close', async () => {
      req.url = '/stream/file-123';
      const mockStream = { pipe: vi.fn(), on: vi.fn(), destroy: vi.fn() };

      mockGetDriveFileMetadata.mockResolvedValue({ size: '1000' });
      mockGetDriveStreamWithCache.mockResolvedValue({
        stream: mockStream,
        length: 1000,
      });

      await handler(req, res);

      // Emit close on req
      const closeCall = req.on.mock.calls.find((c: any) => c[0] === 'close');
      if (closeCall) {
        closeCall[1]();
      }

      expect(mockStream.destroy).toHaveBeenCalled();
    });
  });

  it('getUrlForFile returns cached port if listening', async () => {
    const proxy = InternalMediaProxy.getInstance();
    mockListen.mockImplementation((p, h, cb) => {
      if (cb) cb();
    });

    await proxy.getUrlForFile('id1');
    expect(mockListen).toHaveBeenCalledTimes(1);

    const url2 = await proxy.getUrlForFile('id2');
    expect(mockListen).toHaveBeenCalledTimes(1); // Should not accept listen again
    expect(url2).toContain('54321');
  });

  it('start() is idempotent', async () => {
    const proxy = InternalMediaProxy.getInstance();
    mockListen.mockImplementation((p, h, cb) => {
      if (cb) cb();
    });
    await proxy.start();
    await proxy.start();
    expect(mockListen).toHaveBeenCalledTimes(1);
  });

  it('does not send error response if headers already sent', async () => {
    const handler = getCallback();
    const req = { url: '/stream/file-error', headers: {}, on: vi.fn() };
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: true,
    };

    mockGetDriveFileMetadata.mockRejectedValue(new Error('Fail after headers'));

    await handler(req, res);

    expect(res.writeHead).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });
});
