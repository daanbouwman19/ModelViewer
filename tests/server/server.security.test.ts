import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';
import * as database from '../../src/core/database';
import fs from 'fs/promises';

// Mock dependencies
vi.mock('../../src/core/database');
vi.mock('../../src/core/media-service');
vi.mock('../../src/core/file-system', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/core/file-system')>();
  return {
    ...actual,
    listDirectory: vi.fn(),
  };
});
vi.mock('../../src/core/security', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/core/security')>();
  return {
    ...actual,
    authorizeFilePath: vi.fn(),
  };
});
vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
    mkdir: vi.fn(),
    realpath: vi.fn((p) => Promise.resolve(p)), // Mock realpath to return input by default
  },
}));
class MockMediaHandler {
  serveMetadata = vi.fn();
  serveTranscodedStream = vi.fn();
  serveRawStream = vi.fn();
  serveThumbnail = vi.fn();
  serveStaticFile = vi.fn();
  serveHeatmap = vi.fn();
  serveHeatmapProgress = vi.fn();
  serveHlsMaster = vi.fn();
  serveHlsPlaylist = vi.fn();
  serveHlsSegment = vi.fn();
}

vi.mock('../../src/core/media-handler', () => ({
  MediaHandler: MockMediaHandler,
  serveMetadata: vi.fn(),
  serveTranscodedStream: vi.fn(),
  serveRawStream: vi.fn(),
  serveThumbnail: vi.fn(),
  serveStaticFile: vi.fn(),
}));
vi.mock('../../src/main/google-auth');

describe('Server Security', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  describe('POST /api/directories (Sensitive Paths)', () => {
    it('should block adding root directory', async () => {
      const rootPath = process.platform === 'win32' ? 'C:\\' : '/';
      vi.mocked(fs.stat).mockResolvedValue({} as any);

      const response = await request(app)
        .post('/api/directories')
        .send({ path: rootPath });

      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/restricted/i);
      expect(database.addMediaDirectory).not.toHaveBeenCalled();
    });

    it('should block adding system directories', async () => {
      const sysPath = process.platform === 'win32' ? 'C:\\Windows' : '/etc';
      vi.mocked(fs.stat).mockResolvedValue({} as any);

      const response = await request(app)
        .post('/api/directories')
        .send({ path: sysPath });

      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/restricted/i);
      expect(database.addMediaDirectory).not.toHaveBeenCalled();
    });

    it('should allow adding user directories', async () => {
      const userPath =
        process.platform === 'win32'
          ? 'C:\\Users\\User\\Videos'
          : '/home/user/Videos';
      vi.mocked(fs.stat).mockResolvedValue({} as any);

      const response = await request(app)
        .post('/api/directories')
        .send({ path: userPath });

      expect(response.status).toBe(200);
      expect(database.addMediaDirectory).toHaveBeenCalledWith(userPath);
    });
  });
});
