import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createMediaApp, generateFileUrl } from '../../src/core/media-handler';
import { createMediaSource } from '../../src/core/media-source';
import { authorizeFilePath } from '../../src/core/security';
import { getProvider } from '../../src/core/fs-provider-factory';

vi.mock('../../src/core/media-source', () => ({
  createMediaSource: vi.fn(),
}));

vi.mock('../../src/core/security', () => ({
  authorizeFilePath: vi.fn(),
}));

vi.mock('../../src/core/fs-provider-factory', () => ({
  getProvider: vi.fn(),
}));

describe('media-handler integration tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handleStreamRequest handles access denied in catch block', async () => {
    const app = createMediaApp({ ffmpegPath: 'ffmpeg', cacheDir: '/cache' });
    vi.mocked(authorizeFilePath).mockResolvedValue({
      isAllowed: true,
      realPath: '/test.mp4',
    });

    vi.mocked(createMediaSource).mockImplementation(() => {
      throw new Error('Access denied (intentional)');
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).get(
      '/video/stream?file=/test.mp4&transcode=true',
    );

    expect(res.status).toBe(403);
    expect(res.text).toBe('Access denied.');
    consoleSpy.mockRestore();
  });

  it('serveStaticFile handles general error', async () => {
    const app = createMediaApp({ ffmpegPath: 'ffmpeg', cacheDir: '/cache' });
    vi.mocked(authorizeFilePath).mockResolvedValue({
      isAllowed: true,
      realPath: '/path',
    });

    // Mock isDrivePath to return true for this test
    const mediaUtils = await import('../../src/core/media-utils');
    const isDrivePathSpy = vi
      .spyOn(mediaUtils, 'isDrivePath')
      .mockReturnValue(true);

    vi.mocked(createMediaSource).mockImplementation(() => {
      throw new Error('Generic failure (intentional)');
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).get('/gdrive://789');

    expect(res.status).toBe(500);
    expect(res.text).toBe('Internal server error.');
    consoleSpy.mockRestore();
    isDrivePathSpy.mockRestore();
  });

  it('generateFileUrl handles errors from provider', async () => {
    vi.mocked(authorizeFilePath).mockResolvedValue({ isAllowed: true });
    const mockProvider = {
      getMetadata: vi
        .fn()
        .mockRejectedValue(new Error('Metadata failure (intentional)')),
    };
    vi.mocked(getProvider).mockReturnValue(mockProvider as any);

    const result = await generateFileUrl('/file.mp4', { serverPort: 3000 });
    expect(result.type).toBe('error');
    expect(result.message).toBe('Metadata failure (intentional)');
  });

  it('generateFileUrl handles port 0 for large files', async () => {
    vi.mocked(authorizeFilePath).mockResolvedValue({ isAllowed: true });
    const mockProvider = {
      getMetadata: vi.fn().mockResolvedValue({ size: 100 * 1024 * 1024 }), // 100MB
    };
    vi.mocked(getProvider).mockReturnValue(mockProvider as any);

    const result = await generateFileUrl('/large.mp4', { serverPort: 0 });
    expect(result.type).toBe('error');
    expect(result.message).toContain(
      'Local server not ready to stream large file.',
    );
  });
});
