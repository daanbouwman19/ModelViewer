import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  serveStaticFile,
  serveMetadata,
  handleStreamRequest,
  serveThumbnail,
} from '../../src/core/media-handler';
import * as security from '../../src/core/security';
import { validateFileAccess } from '../../src/core/access-validator';
import { createMediaSource } from '../../src/core/media-source';

// Mock dependencies
vi.mock('../../src/core/security');
vi.mock('../../src/core/media-source', async () => {
  return {
    createMediaSource: vi.fn(),
    IMediaSource: class {},
  };
});

vi.mock('../../src/core/access-validator', () => ({
  validateFileAccess: vi.fn(),
}));

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
  let req: any;
  let res: any;

  beforeEach(() => {
    vi.clearAllMocks();
    req = { headers: {}, url: '', query: {}, method: 'GET' };
    res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
      json: vi.fn(),
      set: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      sendFile: vi.fn(),
    };
  });

  it('prevents file enumeration in serveStaticFile via handler', async () => {
    // Scenario 1: validateFileAccess returns failure
    vi.mocked(validateFileAccess).mockResolvedValue({
      success: false,
      error: 'Access denied.',
      statusCode: 403,
    });

    await serveStaticFile(req, res, '/path/to/forbidden.txt');

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access denied.');

    // Scenario 2: validateFileAccess succeeds, but createMediaSource fails (simulating sensitive file check deeper down or internal error)
    vi.clearAllMocks();
    res.status.mockClear();
    res.send.mockClear();

    vi.mocked(validateFileAccess).mockResolvedValue({
      success: true,
      path: 'gdrive://forbidden',
    });

    vi.mocked(createMediaSource).mockImplementation(() => {
      throw new Error('Access denied: File does not exist.');
    });

    await serveStaticFile(req, res, 'gdrive://forbidden');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access denied.');
  });

  it('prevents unauthorized access in serveStaticFile even if validateFileAccess passes', async () => {
    // Mock validateFileAccess to pass (simulate race condition or bypass)
    vi.mocked(validateFileAccess).mockResolvedValue({
      success: true,
      path: '/path/to/forbidden.txt',
    });

    // Mock authorizeFilePath to fail (the second check for local files)
    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: false,
      message: 'Access denied (path sanitization)',
    });

    await serveStaticFile(req, res, '/path/to/forbidden.txt');

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access denied.');
  });

  it('prevents file enumeration in serveMetadata', async () => {
    vi.mocked(validateFileAccess).mockResolvedValue({
      success: false,
      error: 'Access denied.',
      statusCode: 403,
    });

    await serveMetadata(req, res, '/forbidden.txt', 'ffmpeg');

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access denied.');
  });

  it('prevents file enumeration in serveTranscodedStream (video/stream)', async () => {
    req.query = { file: '/forbidden.txt', transcode: 'true' };

    vi.mocked(validateFileAccess).mockResolvedValue({
      success: false,
      error: 'Access denied.',
      statusCode: 403,
    });

    await handleStreamRequest(req, res, 'ffmpeg');

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access denied.');
  });

  it('prevents file enumeration in serveThumbnail', async () => {
    vi.mocked(validateFileAccess).mockResolvedValue({
      success: false,
      error: 'Access denied.',
      statusCode: 403,
    });

    await serveThumbnail(req, res, '/forbidden.txt', 'ffmpeg', '/cache');

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access denied.');
  });
});
