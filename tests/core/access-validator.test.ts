import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateFileAccess } from '../../src/core/access-validator';

const { mockAuthorizeFilePath } = vi.hoisted(() => ({
  mockAuthorizeFilePath: vi.fn(),
}));

vi.mock('../../src/core/security', () => ({
  authorizeFilePath: mockAuthorizeFilePath,
}));

describe('access-validator unit tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks auth for drive paths (no longer bypassed)', async () => {
    mockAuthorizeFilePath.mockResolvedValue({
      isAllowed: true,
      realPath: 'gdrive://file-id',
    });
    const result = await validateFileAccess('gdrive://file-id');
    expect(result).toEqual({ success: true, path: 'gdrive://file-id' });
    expect(mockAuthorizeFilePath).toHaveBeenCalledWith('gdrive://file-id');
  });

  it('denies unauthorized drive paths', async () => {
    mockAuthorizeFilePath.mockResolvedValue({ isAllowed: false });
    const result = await validateFileAccess('gdrive://unknown-id');
    expect(result).toEqual({
      success: false,
      error: 'Access denied.',
      statusCode: 403,
    });
    expect(mockAuthorizeFilePath).toHaveBeenCalledWith('gdrive://unknown-id');
  });

  it('allows authorized local paths', async () => {
    mockAuthorizeFilePath.mockResolvedValue({
      isAllowed: true,
      realPath: '/local/file',
    });
    const result = await validateFileAccess('/local/file');
    expect(result).toEqual({ success: true, path: '/local/file' });
    expect(mockAuthorizeFilePath).toHaveBeenCalledWith('/local/file');
  });

  it('falls back to filePath if realPath is undefined', async () => {
    mockAuthorizeFilePath.mockResolvedValue({
      isAllowed: true,
      realPath: undefined,
    });
    const result = await validateFileAccess('/local/file');
    expect(result).toEqual({ success: true, path: '/local/file' });
  });

  it('denies unauthorized local paths', async () => {
    mockAuthorizeFilePath.mockResolvedValue({ isAllowed: false });
    const result = await validateFileAccess('/local/file');
    expect(result).toEqual({
      success: false,
      error: 'Access denied.',
      statusCode: 403,
    });
  });

  it('handles auth error', async () => {
    mockAuthorizeFilePath.mockRejectedValue(new Error('Auth failed'));
    const result = await validateFileAccess('/local/file');
    expect(result).toEqual({
      success: false,
      error: 'Internal server error.',
      statusCode: 500,
    });
  });
});
