import { describe, it, expect, vi, beforeEach } from 'vitest';
import { serveStaticFile } from '../../src/core/media-handler';
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

  // Current Vulnerability: We can distinguish between existing-but-forbidden and non-existing files
  it('prevents file enumeration by returning generic error for all unauthorized/missing files', async () => {
    // Scenario 1: File exists but is forbidden
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: false,
      message: 'Access denied: File is not in a configured media directory.',
    });

    await serveStaticFile(req, res, '/forbidden/exists.txt');

    // We capture the calls for Scenario 1
    const calls1 = res.writeHead.mock.calls;
    const status1 = calls1.length > 0 ? calls1[0][0] : null;

    res.writeHead.mockClear();
    res.end.mockClear();

    // Scenario 2: File does not exist (and thus fails auth because realpath fails)
    vi.mocked(fs.existsSync).mockReturnValue(false);
    // Note: In current implementation, serveStaticFile checks existsSync FIRST, so it doesn't call authorizeFilePath.
    // If we fix it, it will call authorizeFilePath, which will fail.

    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: false,
      message: 'File does not exist: /forbidden/missing.txt',
    });

    await serveStaticFile(req, res, '/forbidden/missing.txt');

    const calls2 = res.writeHead.mock.calls;
    const status2 = calls2.length > 0 ? calls2[0][0] : null;

    // SECURITY GOAL: The response status/body should not leak existence.
    // If status1 != status2, we have an enumeration vulnerability.

    // CURRENT BEHAVIOR (Expected to fail until fixed):
    // status1 should be 403
    // status2 should be 404

    // If I assert they are EQUAL, the test will fail now, and pass after fix.
    expect(status1).toBe(status2);
    expect(status1).toBe(403);

    // Also check the body message does not leak "File does not exist"
    expect(res.end).toHaveBeenCalledWith('Access denied.');
  });
});
