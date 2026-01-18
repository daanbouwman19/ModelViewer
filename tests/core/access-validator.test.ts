import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateFileAccess } from '../../src/core/access-validator';

const { mockAuthorizeFilePath } = vi.hoisted(() => ({
  mockAuthorizeFilePath: vi.fn(),
}));

vi.mock('../../src/core/security', () => ({
  authorizeFilePath: mockAuthorizeFilePath,
}));

describe('access-validator unit tests', () => {
  let res: any;

  beforeEach(() => {
    vi.clearAllMocks();
    res = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
      headersSent: false,
    };
  });

  it('allows drive paths without checking auth', async () => {
    const result = await validateFileAccess(res, 'gdrive://file-id');
    expect(result).toBe(true);
    expect(mockAuthorizeFilePath).not.toHaveBeenCalled();
  });

  it('allows authorized local paths', async () => {
    mockAuthorizeFilePath.mockResolvedValue({
      isAllowed: true,
      realPath: '/local/file',
    });
    const result = await validateFileAccess(res, '/local/file');
    expect(result).toBe('/local/file');
    expect(mockAuthorizeFilePath).toHaveBeenCalledWith('/local/file');
  });

  it('denies unauthorized local paths', async () => {
    mockAuthorizeFilePath.mockResolvedValue({ isAllowed: false });
    const result = await validateFileAccess(res, '/local/file');
    expect(result).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access denied.');
  });

  it('does not send response if headers already sent (denial)', async () => {
    res.headersSent = true;
    mockAuthorizeFilePath.mockResolvedValue({ isAllowed: false });
    const result = await validateFileAccess(res, '/local/file');
    expect(result).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it('handles auth error', async () => {
    mockAuthorizeFilePath.mockRejectedValue(new Error('Auth failed'));
    const result = await validateFileAccess(res, '/local/file');
    expect(result).toBe(false);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith('Internal server error.');
  });

  it('does not send error response if headers already sent (exception)', async () => {
    res.headersSent = true;
    mockAuthorizeFilePath.mockRejectedValue(new Error('Auth failed'));
    const result = await validateFileAccess(res, '/local/file');
    expect(result).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });
});
