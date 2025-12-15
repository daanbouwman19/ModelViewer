import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  serveStaticFile,
  serveMetadata,
  serveTranscode,
  serveThumbnail,
} from '../../src/core/media-handler';
import * as security from '../../src/core/security';
import fs from 'fs';

vi.mock('../../src/core/security');
vi.mock('fs', () => {
  return {
    default: {
      existsSync: vi.fn(),
      statSync: vi.fn(),
      createReadStream: vi.fn(),
    },
    existsSync: vi.fn(),
    statSync: vi.fn(),
    createReadStream: vi.fn(),
  };
});

describe('media-handler security', () => {
  let req: { headers: Record<string, string | string[] | undefined> };
  let res: { writeHead: vi.Mock; end: vi.Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    req = { headers: {} };
    res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    };
  });

  it('prevents file enumeration in serveStaticFile', async () => {
    // Scenario 1: File exists but is forbidden
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(security.authorizeFilePath).mockResolvedValueOnce({
      isAllowed: false,
      message: 'Access denied: File is not in a configured media directory.',
    });

    await serveStaticFile(req as any, res as any, '/forbidden/exists.txt');

    const calls1 = res.writeHead.mock.calls;
    const status1 = calls1.length > 0 ? calls1[0][0] : null;

    res.writeHead.mockClear();
    res.end.mockClear();

    // Scenario 2: File does not exist
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(security.authorizeFilePath).mockResolvedValueOnce({
      isAllowed: false,
      message: 'File does not exist: /forbidden/missing.txt',
    });

    await serveStaticFile(req as any, res as any, '/forbidden/missing.txt');

    const calls2 = res.writeHead.mock.calls;
    const status2 = calls2.length > 0 ? calls2[0][0] : null;

    // SECURITY GOAL: The response status/body should not leak existence.
    expect(status1).toBe(status2);
    expect(status1).toBe(403);
    expect(res.end).toHaveBeenCalledWith('Access denied.');
  });

  it('prevents file enumeration in serveMetadata', async () => {
    // Scenario 1: Forbidden
    vi.mocked(security.authorizeFilePath).mockResolvedValueOnce({
      isAllowed: false,
      message: 'Access denied: Forbidden',
    });
    await serveMetadata(
      req as any,
      res as any,
      '/forbidden/exists.txt',
      '/bin/ffmpeg',
    );
    const body1 = res.end.mock.calls[0][0];
    res.end.mockClear();

    // Scenario 2: Missing
    vi.mocked(security.authorizeFilePath).mockResolvedValueOnce({
      isAllowed: false,
      message: 'File does not exist: /missing.txt',
    });
    await serveMetadata(req as any, res as any, '/missing.txt', '/bin/ffmpeg');
    const body2 = res.end.mock.calls[0][0];

    expect(body1).toBe('Access denied.');
    expect(body2).toBe('Access denied.');
  });

  it('prevents file enumeration in serveTranscode', async () => {
    // Scenario 1: Forbidden
    vi.mocked(security.authorizeFilePath).mockResolvedValueOnce({
      isAllowed: false,
      message: 'Access denied: Forbidden',
    });
    await serveTranscode(
      req as any,
      res as any,
      '/forbidden/exists.txt',
      null,
      '/bin/ffmpeg',
    );
    const body1 = res.end.mock.calls[0][0];
    res.end.mockClear();

    // Scenario 2: Missing
    vi.mocked(security.authorizeFilePath).mockResolvedValueOnce({
      isAllowed: false,
      message: 'File does not exist: /missing.txt',
    });
    await serveTranscode(
      req as any,
      res as any,
      '/missing.txt',
      null,
      '/bin/ffmpeg',
    );
    const body2 = res.end.mock.calls[0][0];

    expect(body1).toBe('Access denied.');
    expect(body2).toBe('Access denied.');
  });

  it('prevents file enumeration in serveThumbnail', async () => {
    // Scenario 1: Forbidden
    vi.mocked(security.authorizeFilePath).mockResolvedValueOnce({
      isAllowed: false,
      message: 'Access denied: Forbidden',
    });
    await serveThumbnail(
      req as any,
      res as any,
      '/forbidden/exists.txt',
      '/bin/ffmpeg',
    );
    const body1 = res.end.mock.calls[0][0];
    res.end.mockClear();

    // Scenario 2: Missing
    vi.mocked(security.authorizeFilePath).mockResolvedValueOnce({
      isAllowed: false,
      message: 'File does not exist: /missing.txt',
    });
    await serveThumbnail(req as any, res as any, '/missing.txt', '/bin/ffmpeg');
    const body2 = res.end.mock.calls[0][0];

    expect(body1).toBe('Access denied.');
    expect(body2).toBe('Access denied.');
  });
});
