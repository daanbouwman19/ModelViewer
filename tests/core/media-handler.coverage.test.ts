import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough, Readable } from 'stream';
import { EventEmitter } from 'events';
import {
  serveHlsSegment,
  serveHeatmap,
  serveHeatmapProgress,
  serveStaticFile,
  generateFileUrl,
  serveTranscodedStream,
} from '../../src/core/media-handler';
import { validateFileAccess } from '../../src/core/access-validator';
import { authorizeFilePath } from '../../src/core/security';
import { isDrivePath } from '../../src/core/media-utils';
import { MediaAnalyzer } from '../../src/core/analysis/media-analyzer';
import { HlsManager } from '../../src/core/hls-manager';
import { getProvider } from '../../src/core/fs-provider-factory';
import { createMediaSource } from '../../src/core/media-source';
import { getTranscodeArgs } from '../../src/core/utils/ffmpeg-utils';
import * as fsPromises from 'fs/promises';

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: spawnMock,
  default: { spawn: spawnMock },
}));
vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({ on: vi.fn() })),
  default: { createInterface: vi.fn(() => ({ on: vi.fn() })) },
}));
vi.mock('../../src/core/utils/ffmpeg-utils', () => ({
  getTranscodeArgs: vi.fn(() => ['-i', 'input.mp4']),
  getFFmpegDuration: vi.fn(),
}));
vi.mock('../../src/core/access-validator', () => ({
  validateFileAccess: vi.fn(),
}));
vi.mock('../../src/core/security', () => ({
  authorizeFilePath: vi.fn(),
}));
vi.mock('../../src/core/media-utils', () => ({
  isDrivePath: vi.fn(),
}));
vi.mock('../../src/core/analysis/media-analyzer', () => ({
  MediaAnalyzer: { getInstance: vi.fn() },
}));
vi.mock('../../src/core/hls-manager', () => ({
  HlsManager: { getInstance: vi.fn() },
}));
vi.mock('../../src/core/fs-provider-factory', () => ({
  getProvider: vi.fn(),
}));
vi.mock('../../src/core/media-source', () => ({
  createMediaSource: vi.fn(),
}));
vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
  default: {
    access: vi.fn(),
    readFile: vi.fn(),
  },
}));

type MockResponse = {
  status: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  sendFile: ReturnType<typeof vi.fn>;
  headersSent: boolean;
};

const createMockRes = (): MockResponse => ({
  status: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  end: vi.fn(),
  sendFile: vi.fn().mockReturnThis(),
  headersSent: false,
});

const createMockReq = (query: Record<string, string> = {}) => {
  const handlers: Record<string, () => void> = {};
  return {
    query,
    headers: {},
    on: vi.fn((event: string, cb: () => void) => {
      handlers[event] = cb;
    }),
    trigger: (event: string) => handlers[event]?.(),
  } as any;
};

describe('media-handler coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isDrivePath).mockReturnValue(false);
    vi.mocked(validateFileAccess).mockResolvedValue({
      success: true,
      path: '/file.mp4',
    });
    vi.mocked(authorizeFilePath).mockResolvedValue({
      isAllowed: true,
      realPath: '/file.mp4',
    });
    vi.mocked(MediaAnalyzer.getInstance).mockReturnValue({
      generateHeatmap: vi.fn().mockResolvedValue({ points: 100 }),
      getProgress: vi.fn().mockReturnValue(null),
      setCacheDir: vi.fn(),
    } as any);
    vi.mocked(HlsManager.getInstance).mockReturnValue({
      getSessionDir: vi.fn(),
      touchSession: vi.fn(),
      ensureSession: vi.fn(),
    } as any);
    vi.mocked(getProvider).mockReturnValue({
      getMetadata: vi.fn(),
      getStream: vi.fn(),
    } as any);
  });

  it('serveTranscodedStream handles spawn error and request close', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const source = {
      getFFmpegInput: vi.fn().mockResolvedValue('/input.mp4'),
    } as any;

    const processEmitter = new EventEmitter() as any;
    processEmitter.stdout = { pipe: vi.fn() };
    processEmitter.stderr = new PassThrough();
    processEmitter.kill = vi.fn();

    spawnMock.mockReturnValue(processEmitter);

    await serveTranscodedStream(req, res as any, source, '/ffmpeg', undefined);
    processEmitter.emit('error', new Error('spawn failed'));
    req.trigger('close');

    expect(getTranscodeArgs).toHaveBeenCalled();
    expect(processEmitter.stdout.pipe).toHaveBeenCalledWith(res);
    expect(processEmitter.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('serveHlsSegment returns 404 when session is missing', async () => {
    const req = createMockReq();
    const res = createMockRes();

    vi.mocked(HlsManager.getInstance).mockReturnValue({
      getSessionDir: vi.fn().mockReturnValue(null),
      touchSession: vi.fn(),
    } as any);

    await serveHlsSegment(req, res as any, '/file.mp4', 'segment_000.ts');

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith(
      'Segment not found (Session expired)',
    );
  });

  it('serveHlsSegment rejects invalid segment names', async () => {
    const req = createMockReq();
    const res = createMockRes();

    vi.mocked(HlsManager.getInstance).mockReturnValue({
      getSessionDir: vi.fn().mockReturnValue('/tmp/session'),
      touchSession: vi.fn(),
    } as any);

    await serveHlsSegment(req, res as any, '/file.mp4', '../segment.ts');

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid segment name');
  });

  it('serveHlsSegment returns 404 when segment file is missing', async () => {
    const req = createMockReq();
    const res = createMockRes();

    vi.mocked(HlsManager.getInstance).mockReturnValue({
      getSessionDir: vi.fn().mockReturnValue('/tmp/session'),
      touchSession: vi.fn(),
    } as any);
    vi.mocked(fsPromises.access).mockRejectedValue(new Error('missing'));
    (fsPromises as any).default.access.mockRejectedValue(new Error('missing'));

    await serveHlsSegment(req, res as any, '/file.mp4', 'segment_001.ts');

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith('Segment not found');
  });

  it('serveHeatmap returns data for authorized files', async () => {
    const req = createMockReq({ points: '200' });
    const res = createMockRes();

    const analyzer = {
      generateHeatmap: vi.fn().mockResolvedValue({ points: 200 }),
    } as any;
    vi.mocked(MediaAnalyzer.getInstance).mockReturnValue(analyzer);

    await serveHeatmap(req, res as any, '/file.mp4');

    expect(analyzer.generateHeatmap).toHaveBeenCalledWith('/file.mp4', 200);
    expect(res.json).toHaveBeenCalledWith({ points: 200 });
  });

  it('serveHeatmap handles generation errors', async () => {
    const req = createMockReq({ points: '100' });
    const res = createMockRes();

    const analyzer = {
      generateHeatmap: vi.fn().mockRejectedValue(new Error('fail')),
    } as any;
    vi.mocked(MediaAnalyzer.getInstance).mockReturnValue(analyzer);

    await serveHeatmap(req, res as any, '/file.mp4');

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith('Heatmap generation failed');
  });

  it('serveHeatmapProgress returns null progress when missing', async () => {
    const req = createMockReq();
    const res = createMockRes();

    const analyzer = {
      getProgress: vi.fn().mockReturnValue(null),
    } as any;
    vi.mocked(MediaAnalyzer.getInstance).mockReturnValue(analyzer);

    await serveHeatmapProgress(req, res as any, '/file.mp4');

    expect(res.json).toHaveBeenCalledWith({ progress: null });
  });

  it('serveHeatmapProgress returns progress when available', async () => {
    const req = createMockReq();
    const res = createMockRes();

    const analyzer = {
      getProgress: vi.fn().mockReturnValue(0.5),
    } as any;
    vi.mocked(MediaAnalyzer.getInstance).mockReturnValue(analyzer);

    await serveHeatmapProgress(req, res as any, '/file.mp4');

    expect(res.json).toHaveBeenCalledWith({ progress: 0.5 });
  });

  it('serveStaticFile sends local files when authorized', async () => {
    const req = createMockReq();
    const res = createMockRes();

    vi.mocked(validateFileAccess).mockResolvedValue({
      success: true,
      path: '/safe/file.mp4',
    });
    vi.mocked(isDrivePath).mockReturnValue(false);
    vi.mocked(authorizeFilePath).mockResolvedValue({
      isAllowed: true,
      realPath: '/safe/file.mp4',
    });

    await serveStaticFile(req, res as any, '/safe/file.mp4');

    expect(res.sendFile).toHaveBeenCalledWith('/safe/file.mp4');
  });

  it('serveStaticFile responds 403 for denied local paths', async () => {
    const req = createMockReq();
    const res = createMockRes();

    vi.mocked(validateFileAccess).mockResolvedValue({
      success: true,
      path: '/blocked/file.mp4',
    });
    vi.mocked(isDrivePath).mockReturnValue(false);
    vi.mocked(authorizeFilePath).mockResolvedValue({
      isAllowed: false,
      message: 'Access denied',
    });

    await serveStaticFile(req, res as any, '/blocked/file.mp4');

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access denied.');
  });

  it('serveStaticFile responds with validation error status', async () => {
    const req = createMockReq();
    const res = createMockRes();

    vi.mocked(validateFileAccess).mockResolvedValue({
      success: false,
      error: 'Nope',
      statusCode: 401,
    });

    await serveStaticFile(req, res as any, '/forbidden/file.mp4');

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Nope');
  });

  it('generateFileUrl returns error when access denied', async () => {
    vi.mocked(isDrivePath).mockReturnValue(false);
    vi.mocked(authorizeFilePath).mockResolvedValue({
      isAllowed: false,
      message: 'Denied',
    });

    const result = await generateFileUrl('/file.mp4', {
      serverPort: 3000,
      preferHttp: false,
    });

    expect(result).toEqual({ type: 'error', message: 'Denied' });
  });

  it('generateFileUrl returns large-file error when server not ready', async () => {
    const provider = {
      getMetadata: vi.fn().mockResolvedValue({
        size: 999 * 1024 * 1024,
        mimeType: 'video/mp4',
      }),
    } as any;
    vi.mocked(getProvider).mockReturnValue(provider);

    const result = await generateFileUrl('/file.mp4', {
      serverPort: 0,
      preferHttp: false,
    });

    expect(result).toEqual({
      type: 'error',
      message: 'Local server not ready to stream large file.',
    });
  });

  it('generateFileUrl returns http url when requested', async () => {
    const provider = {
      getMetadata: vi.fn().mockResolvedValue({
        size: 10,
        mimeType: 'video/mp4',
      }),
    } as any;
    vi.mocked(getProvider).mockReturnValue(provider);

    const result = await generateFileUrl('/file.mp4', {
      serverPort: 3000,
      preferHttp: true,
    });

    expect(result).toEqual({
      type: 'http-url',
      url: 'http://localhost:3000/video/stream?file=%2Ffile.mp4',
    });
  });

  it('generateFileUrl returns data url for small files', async () => {
    const provider = {
      getMetadata: vi.fn().mockResolvedValue({
        size: 10,
        mimeType: 'video/mp4',
      }),
      getStream: vi.fn().mockResolvedValue({
        stream: Readable.from(['hello']),
      }),
    } as any;
    vi.mocked(getProvider).mockReturnValue(provider);

    const result = await generateFileUrl('/file.mp4', {
      serverPort: 3000,
      preferHttp: false,
    });

    expect(result.type).toBe('data-url');
    expect(result.url?.startsWith('data:video/mp4;base64,')).toBe(true);
  });

  it('generateFileUrl returns error on provider failure', async () => {
    const provider = {
      getMetadata: vi.fn().mockRejectedValue(new Error('boom')),
    } as any;
    vi.mocked(getProvider).mockReturnValue(provider);

    const result = await generateFileUrl('/file.mp4', {
      serverPort: 3000,
      preferHttp: false,
    });

    expect(result).toEqual({ type: 'error', message: 'boom' });
  });

  it('serveStaticFile streams drive paths via media source', async () => {
    const req = createMockReq();
    const res = createMockRes();

    vi.mocked(validateFileAccess).mockResolvedValue({
      success: true,
      path: 'gdrive://file-id',
    });
    vi.mocked(isDrivePath).mockReturnValue(true);

    const streamSource = {
      getSize: vi.fn().mockResolvedValue(10),
      getMimeType: vi.fn().mockResolvedValue('video/mp4'),
      getStream: vi.fn().mockResolvedValue({
        stream: {
          pipe: vi.fn(),
          on: vi.fn(),
          destroy: vi.fn(),
        },
        length: 10,
      }),
    } as any;

    vi.mocked(createMediaSource).mockReturnValue(streamSource);

    await serveStaticFile(req, res as any, 'gdrive://file-id');

    expect(createMediaSource).toHaveBeenCalledWith('gdrive://file-id');
  });
});
