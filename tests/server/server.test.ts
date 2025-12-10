
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';

// Mock dependencies
const mockApp = {
  use: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  put: vi.fn(),
  listen: vi.fn(),
};

// Store handlers to call them later
const handlers: Record<string, Function> = {};

vi.mock('express', () => {
  const mockExpress = () => mockApp;
  mockExpress.json = vi.fn();
  mockExpress.static = vi.fn();
  return {
    default: mockExpress,
  };
});

vi.mock('cors', () => ({
  default: vi.fn(() => 'cors-middleware'),
}));

vi.mock('ffmpeg-static', () => ({
  default: '/bin/ffmpeg',
}));

// Mock core modules
import * as database from '../../src/core/database';
import * as mediaService from '../../src/core/media-service';
import * as fileSystem from '../../src/core/file-system';
import * as mediaHandler from '../../src/core/media-handler';

vi.mock('../../src/core/database', () => ({
  initDatabase: vi.fn().mockResolvedValue(undefined),
  getMediaDirectories: vi.fn(),
  addMediaDirectory: vi.fn(),
  removeMediaDirectory: vi.fn(),
  setDirectoryActiveState: vi.fn(),
  recordMediaView: vi.fn(),
  getMediaViewCounts: vi.fn(),
  getMediaByColor: vi.fn(),
}));

vi.mock('../../src/core/media-service', () => ({
  getAlbumsWithViewCounts: vi.fn(),
  getAlbumsWithViewCountsAfterScan: vi.fn(),
}));

vi.mock('../../src/core/file-system', () => ({
  listDirectory: vi.fn(),
}));

vi.mock('../../src/core/media-handler', () => ({
  serveMetadata: vi.fn(),
  serveTranscode: vi.fn(),
  serveThumbnail: vi.fn(),
  serveStaticFile: vi.fn(),
  createMediaRequestHandler: vi.fn(),
}));

// Mock Request/Response
function createMockReq(body = {}, query = {}, params = {}) {
  return {
    body,
    query,
    params,
    headers: {},
  };
}

function createMockRes() {
  const res: any = {};
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.sendStatus = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  res.sendFile = vi.fn().mockReturnValue(res);
  return res;
}

// We need to mock fs/promises for server.ts usage (top-level await import there)
vi.mock('fs/promises', async () => {
    return {
        default: {
            stat: vi.fn().mockResolvedValue({}),
        }
    };
});

describe('server.ts', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules(); // Important to re-run server.ts side effects

    // Clear handlers
    for (const key in handlers) delete handlers[key];

    // Capture handlers
    mockApp.get.mockImplementation((path: string, handler: Function) => {
        handlers[`GET ${path}`] = handler;
    });
    mockApp.post.mockImplementation((path: string, handler: Function) => {
        handlers[`POST ${path}`] = handler;
    });
    mockApp.put.mockImplementation((path: string, handler: Function) => {
        handlers[`PUT ${path}`] = handler;
    });
    mockApp.delete.mockImplementation((path: string, handler: Function) => {
        handlers[`DELETE ${path}`] = handler;
    });

    // Suppress logs during bootstrap
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Bootstrap server
    await import('../../src/server/server');
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  it('should initialize server and register routes', async () => {
    expect(mockApp.use).toHaveBeenCalled();
    expect(mockApp.listen).toHaveBeenCalledWith(3000, expect.any(Function));
  });

  it('should handle /api/albums', async () => {
      const mockAlbums = [{ id: '1' }];
      (mediaService.getAlbumsWithViewCounts as any).mockResolvedValue(mockAlbums);

      const req = createMockReq();
      const res = createMockRes();

      await handlers['GET /api/albums'](req, res);

      expect(mediaService.getAlbumsWithViewCounts).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockAlbums);
  });

  it('should handle /api/albums error', async () => {
      (mediaService.getAlbumsWithViewCounts as any).mockRejectedValue(new Error('fail'));
      const req = createMockReq();
      const res = createMockRes();

      await handlers['GET /api/albums'](req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch albums' });
  });

  it('should handle /api/albums/reindex', async () => {
      const mockAlbums = [{ id: 'new' }];
      (mediaService.getAlbumsWithViewCountsAfterScan as any).mockResolvedValue(mockAlbums);

      const req = createMockReq();
      const res = createMockRes();

      await handlers['POST /api/albums/reindex'](req, res);

      expect(mediaService.getAlbumsWithViewCountsAfterScan).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockAlbums);
  });

  it('should handle /api/media/view', async () => {
      const req = createMockReq({ filePath: '/path/file.jpg' });
      const res = createMockRes();

      await handlers['POST /api/media/view'](req, res);

      expect(database.recordMediaView).toHaveBeenCalledWith('/path/file.jpg');
      expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  it('should handle /api/media/view missing path', async () => {
    const req = createMockReq({});
    const res = createMockRes();

    await handlers['POST /api/media/view'](req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Missing filePath');
  });

  it('should handle /api/directories GET', async () => {
      const dirs = [{ path: '/dir' }];
      (database.getMediaDirectories as any).mockResolvedValue(dirs);
      const req = createMockReq();
      const res = createMockRes();

      await handlers['GET /api/directories'](req, res);

      expect(res.json).toHaveBeenCalledWith(dirs);
  });

  it('should handle /api/directories POST', async () => {
      const req = createMockReq({ path: '/new/dir' });
      const res = createMockRes();

      await handlers['POST /api/directories'](req, res);

      expect(database.addMediaDirectory).toHaveBeenCalledWith('/new/dir');
      expect(res.json).toHaveBeenCalledWith('/new/dir');
  });

  it('should handle /api/directories DELETE', async () => {
      const req = createMockReq({ path: '/dir' });
      const res = createMockRes();

      await handlers['DELETE /api/directories'](req, res);

      expect(database.removeMediaDirectory).toHaveBeenCalledWith('/dir');
      expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  it('should handle /api/directories/active PUT', async () => {
      const req = createMockReq({ path: '/dir', isActive: true });
      const res = createMockRes();

      await handlers['PUT /api/directories/active'](req, res);

      expect(database.setDirectoryActiveState).toHaveBeenCalledWith('/dir', true);
      expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  it('should handle /api/fs/ls', async () => {
      const mockContents = [{ name: 'file', isDirectory: false }];
      (fileSystem.listDirectory as any).mockResolvedValue(mockContents);
      const req = createMockReq({}, { path: '/path' });
      const res = createMockRes();

      await handlers['GET /api/fs/ls'](req, res);

      expect(fileSystem.listDirectory).toHaveBeenCalledWith('/path');
      expect(res.json).toHaveBeenCalledWith(mockContents);
  });

  it('should handle /api/serve', async () => {
      const req = createMockReq({}, { path: '/file.jpg' });
      const res = createMockRes();

      await handlers['GET /api/serve'](req, res);

      expect(mediaHandler.serveStaticFile).toHaveBeenCalledWith(req, res, '/file.jpg');
  });
});
