import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  serveStaticFile,
  serveMetadata,
  handleStreamRequest,
  serveThumbnail,
} from '../../src/core/media-handler';
import * as security from '../../src/core/security';

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
    // Scenario: createMediaSource throws "Access denied"
    // Since serveStaticFile calls authorizeFilePath first for non-gdrive files:
    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: false,
      message: 'Access denied',
    });

    await serveStaticFile(req, res, '/path/to/forbidden.txt');

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access denied.');

    // Scenario 2: If we force gdrive (starts with gdrive://) - authorizeFilePath is skipped in local check logic
    // but createMediaSource might throw.
    // However, the original test tested basic file access for local usage.
    // If we test createMediaSource failure:
    vi.clearAllMocks();
    res.status.mockClear();

    // Bypass local check by mocking startWith or passing gdrive
    // If we pass gdrive://, it goes to createMediaSource
    vi.mocked(createMediaSource).mockImplementation(() => {
      throw new Error('Access denied: File does not exist.');
    });

    await serveStaticFile(req, res, 'gdrive://forbidden');
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('prevents file enumeration in serveMetadata', async () => {
    vi.mocked(security.authorizeFilePath).mockResolvedValueOnce({
      isAllowed: false,
      message: 'Access denied: Forbidden',
    });

    await serveMetadata(req, res, '/forbidden.txt', 'ffmpeg');

    expect(res.send).toHaveBeenCalledWith('Access denied.');
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('prevents file enumeration in serveTranscodedStream (video/stream)', async () => {
    req.query = { file: '/forbidden.txt', transcode: 'true' };

    // With handleStreamRequest, it checks authorization for local files.
    vi.mocked(security.authorizeFilePath).mockResolvedValueOnce({
      isAllowed: false,
      message: 'Access denied',
    });

    await handleStreamRequest(req, res, 'ffmpeg');

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access denied.');
  });

  it('prevents file enumeration in serveThumbnail', async () => {
    vi.mocked(security.authorizeFilePath).mockResolvedValueOnce({
      isAllowed: false,
      message: 'Access denied: Forbidden',
    });

    await serveThumbnail(req, res, '/forbidden.txt', 'ffmpeg', '/cache');

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access denied.');
  });
});
