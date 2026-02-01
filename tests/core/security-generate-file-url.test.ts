import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateFileUrl } from '../../src/core/media-handler';
import * as security from '../../src/core/security';
import * as providerFactory from '../../src/core/fs-provider-factory';
import * as mediaUtils from '../../src/core/media-utils';

vi.mock('../../src/core/security');
vi.mock('../../src/core/fs-provider-factory');
vi.mock('../../src/core/media-utils');

describe('generateFileUrl Security Check', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should call authorizeFilePath for drive paths', async () => {
    const filePath = 'gdrive://unauthorized-file-id';

    // Mock isDrivePath to return true
    vi.mocked(mediaUtils.isDrivePath).mockReturnValue(true);

    // Mock authorizeFilePath to return false (access denied)
    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: false,
      message: 'Access denied',
    });

    // Mock getProvider to return a dummy provider so we don't crash if auth is bypassed
    vi.mocked(providerFactory.getProvider).mockReturnValue({
      getMetadata: vi
        .fn()
        .mockResolvedValue({ size: 100, mimeType: 'text/plain' }),
      getStream: vi.fn().mockResolvedValue({
        stream: (async function* () {
          yield Buffer.from('data');
        })(),
      }),
    } as any);

    const result = await generateFileUrl(filePath, { serverPort: 3000 });

    // Expect auth to be checked
    expect(security.authorizeFilePath).toHaveBeenCalledWith(filePath);

    // Expect error because access is denied
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.message).toContain('Access denied');
    }
  });
});
