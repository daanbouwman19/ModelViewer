import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server.ts';
import * as security from '../../src/core/security.ts';
import * as mediaUtils from '../../src/core/media-utils.ts';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock dependencies
vi.mock('../../src/core/database.ts');
vi.mock('../../src/core/security.ts');
vi.mock('../../src/core/media-utils.ts');

vi.mock('../../src/core/media-service.ts', () => ({
  getAlbumsWithViewCounts: vi.fn(),
  getAlbumsWithViewCountsAfterScan: vi.fn(),
}));

describe('Server Security: Thumbnail IDOR Protection', () => {
  let app: any;
  const tempDir = os.tmpdir();
  const tempCacheFile = path.join(tempDir, 'temp-thumb.jpg');

  beforeAll(async () => {
    // Create a real file for cache hit scenarios
    fs.writeFileSync(tempCacheFile, 'fake-image-data');
    app = await createApp();
  });

  afterAll(() => {
    if (fs.existsSync(tempCacheFile)) {
      fs.unlinkSync(tempCacheFile);
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    (security.authorizeFilePath as any).mockResolvedValue({
      isAllowed: true,
      realPath: '/mock/path',
    });
    (security.isRestrictedPath as any).mockReturnValue(false);
    (security.isSensitiveDirectory as any).mockReturnValue(false);

    // Media Utils mocks
    (mediaUtils.getThumbnailCachePath as any).mockReturnValue(tempCacheFile);
    // We let checkThumbnailCache return true and rely on real file existence
    // But since we mocked the module, we must mock the return value.
    (mediaUtils.checkThumbnailCache as any).mockResolvedValue(false);
    (mediaUtils.isDrivePath as any).mockReturnValue(false);
    (mediaUtils.getMimeType as any).mockReturnValue('image/jpeg');
    // Ensure getQueryParam behaves correctly if used by server or handler
    (mediaUtils as any).getQueryParam = vi.fn().mockImplementation((query, key) => query[key]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should serve thumbnail if allowed and cached', async () => {
    (security.authorizeFilePath as any).mockResolvedValue({
      isAllowed: true,
      realPath: '/allowed/image.jpg',
    });
    (mediaUtils.checkThumbnailCache as any).mockResolvedValue(true);

    // No need to mock fs.createReadStream, using real file

    const response = await request(app)
      .get('/api/thumbnail')
      .query({ file: '/allowed/image.jpg' });

    if (response.status === 400) {
      console.error('Test Debug: 400 Bad Request:', response.text);
    }

    expect(response.status).toBe(200);
    // expect content type to be image/jpeg
    expect(response.headers['content-type']).toContain('image/jpeg');
  });

  it('should BLOCK thumbnail if file is unauthorized EVEN IF cached', async () => {
    // 1. Setup unauthorized file access
    (security.authorizeFilePath as any).mockResolvedValue({
      isAllowed: false,
      message: 'Access denied',
    });

    // 2. Setup CACHE HIT
    (mediaUtils.checkThumbnailCache as any).mockResolvedValue(true);

    const response = await request(app)
      .get('/api/thumbnail')
      .query({ file: '/secret/image.jpg' });

    // Expect 403 Forbidden because access check should happen before cache check
    expect(response.status).toBe(403);
  });
});
