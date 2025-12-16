import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  serveStaticFile,
  serveMetadata,
  serveThumbnail,
  createMediaRequestHandler,
} from '../../src/core/media-handler';
import * as security from '../../src/core/security';
import fs from 'fs';

// Mock dependencies
vi.mock('../../src/core/security');
vi.mock('../../src/core/media-source', async () => {
  const actual = await vi.importActual('../../src/core/media-source');
  return {
    ...(actual as any),
    createMediaSource: vi.fn(),
    IMediaSource: class {},
  };
});
import { createMediaSource } from '../../src/core/media-source';

vi.mock('fs', () => {
  return {
    default: {
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
      statSync: vi.fn(),
      createReadStream: vi.fn(),
      promises: {
        stat: vi.fn(),
      },
    },
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn(),
    createReadStream: vi.fn(),
    promises: {
      stat: vi.fn(),
    },
  };
});

describe('media-handler security', () => {
  let req: {
    headers: Record<string, string | string[] | undefined>;
    url?: string;
  };
  let res: { writeHead: vi.Mock; end: vi.Mock; headersSent: boolean };

  beforeEach(() => {
    vi.clearAllMocks();
    req = { headers: {}, url: '' };
    res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: false,
    };
  });

  // Integration-style tests for the request handler
  const handler = createMediaRequestHandler({
    ffmpegPath: '/bin/ffmpeg',
    cacheDir: '/tmp',
  });

  it('prevents file enumeration in serveStaticFile via handler', async () => {
    // Scenario: createMediaSource throws "Access denied"
    vi.mocked(createMediaSource).mockImplementation(() => {
      throw new Error(
        'Access denied: File is not in a configured media directory.',
      );
    });

    req.url = '/path/to/forbidden.txt';

    await handler(req as any, res as any);

    expect(res.writeHead).toHaveBeenCalledWith(403);
    expect(res.end).toHaveBeenCalledWith('Access denied.');

    res.writeHead.mockClear();
    res.end.mockClear();

    // Scenario 2: File missing (same error from security point of view)
    vi.mocked(createMediaSource).mockImplementation(() => {
      throw new Error('Access denied: File does not exist.');
    });

    await handler(req as any, res as any);
    expect(res.writeHead).toHaveBeenCalledWith(403);
    expect(res.end).toHaveBeenCalledWith('Access denied.');
  });

  it('prevents file enumeration in serveMetadata', async () => {
    req.url = '/video/metadata?file=/forbidden.txt';

    vi.mocked(security.authorizeFilePath).mockResolvedValueOnce({
      isAllowed: false,
      message: 'Access denied: Forbidden',
    });

    await handler(req as any, res as any);

    expect(res.end).toHaveBeenCalledWith('Access denied.');
  });

  it('prevents file enumeration in serveTranscodedStream (video/stream)', async () => {
    req.url = '/video/stream?file=/forbidden.txt&transcode=true';

    vi.mocked(createMediaSource).mockImplementation(() => {
      throw new Error('Access denied.');
    });

    await handler(req as any, res as any);

    expect(res.writeHead).toHaveBeenCalledWith(403);
    expect(res.end).toHaveBeenCalledWith('Access denied.');
  });

  it('prevents file enumeration in serveThumbnail', async () => {
    req.url = '/video/thumbnail?file=/forbidden.txt';

    vi.mocked(security.authorizeFilePath).mockResolvedValueOnce({
      isAllowed: false,
      message: 'Access denied: Forbidden',
    });

    await handler(req as any, res as any);

    expect(res.end).toHaveBeenCalledWith('Access denied.');
  });
});
