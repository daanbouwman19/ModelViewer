import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fsMock, hlsManagerMock, analyzerMock } = vi.hoisted(() => {
  return {
    fsMock: {
      access: vi.fn(),
      readFile: vi.fn(),
    },
    hlsManagerMock: {
      ensureSession: vi.fn(),
      getSessionDir: vi.fn(),
      touchSession: vi.fn(),
    },
    analyzerMock: {
      generateHeatmap: vi.fn(),
      getProgress: vi.fn(),
    },
  };
});

// Mock fs-provider-factory to avoid importing heavy dependencies (googleapis)
vi.mock('../../src/core/fs-provider-factory.ts', () => ({
  getProvider: vi.fn(),
}));

// Mock google-drive-service to avoid importing googleapis
vi.mock('../../src/main/google-drive-service.ts', () => ({
  getDriveFileMetadata: vi.fn(),
  getDriveFileStream: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: fsMock,
  ...fsMock,
}));

vi.mock('../../src/core/access-validator', () => ({
  validateFileAccess: vi.fn(),
}));

vi.mock('../../src/core/security', () => ({
  authorizeFilePath: vi.fn(),
}));

vi.mock('../../src/core/hls-manager', () => ({
  HlsManager: {
    getInstance: vi.fn(() => hlsManagerMock),
  },
}));

vi.mock('../../src/core/analysis/media-analyzer', () => ({
  MediaAnalyzer: {
    getInstance: vi.fn(() => analyzerMock),
  },
}));

vi.mock('../../src/core/thumbnail-handler', () => ({
  serveThumbnail: vi.fn(),
}));

describe('MediaHandler class', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { validateFileAccess } =
      await import('../../src/core/access-validator');
    const { authorizeFilePath } = await import('../../src/core/security');
    const { serveThumbnail } = await import('../../src/core/thumbnail-handler');

    vi.mocked(validateFileAccess).mockResolvedValue({
      success: true,
      path: '/file.mp4',
    });
    vi.mocked(authorizeFilePath).mockResolvedValue({
      isAllowed: true,
      realPath: '/file.mp4',
    } as any);
    vi.mocked(serveThumbnail).mockResolvedValue(undefined as any);

    fsMock.access.mockResolvedValue(undefined);
    fsMock.readFile.mockResolvedValue('segment_000.ts');

    hlsManagerMock.ensureSession.mockResolvedValue(undefined);
    hlsManagerMock.getSessionDir.mockReturnValue('/tmp/hls');
    hlsManagerMock.touchSession.mockReturnValue(undefined as any);

    analyzerMock.generateHeatmap.mockResolvedValue({ points: [] });
    analyzerMock.getProgress.mockReturnValue(null);
  });

  it('delegates to module helpers with safe stubs', async () => {
    const mediaHandler = await import('../../src/core/media-handler');

    const handler = new mediaHandler.MediaHandler({
      ffmpegPath: null,
      cacheDir: '/cache',
    });

    const req = { query: { file: '/file.mp4' } } as any;
    const res: any = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    };
    res.sendFile = vi.fn(
      (_path: string, optOrCb: any | (() => void), cb?: () => void) => {
        const callback = typeof optOrCb === 'function' ? optOrCb : cb;
        if (callback) callback();
        return res;
      },
    );

    await handler.serveMetadata(req, res, '/file.mp4');
    await handler.serveThumbnail(req, res, '/file.mp4');
    await handler.serveHeatmap(req, res, '/file.mp4');
    await handler.serveHeatmapProgress(req, res, '/file.mp4');
    await handler.serveHlsMaster(req, res, '/file.mp4');
    await handler.serveHlsPlaylist(req, res, '/file.mp4');
    await handler.serveHlsSegment(req, res, '/file.mp4', 'segment_000.ts');
    await handler.serveStaticFile(req, res, '/file.mp4');

    expect(res.status).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });
});
