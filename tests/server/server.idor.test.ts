import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server.ts';
import * as database from '../../src/core/database.ts';
import * as security from '../../src/core/security.ts';

// Mock dependencies
vi.mock('../../src/core/database.ts');
vi.mock('../../src/core/security.ts');
vi.mock('../../src/core/media-service.ts', () => ({
  getAlbumsWithViewCounts: vi.fn(),
  getAlbumsWithViewCountsAfterScan: vi.fn(),
}));

describe('Server Security: Metadata & Rating Protection', () => {
  let app: any;

  beforeAll(async () => {
    app = await createApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    (database.setRating as any).mockResolvedValue(undefined);
    (database.upsertMetadata as any).mockResolvedValue(undefined);
    (database.getMetadata as any).mockResolvedValue({});

    // Default security: everything is allowed by default in the mock,
    // unless we override it in specific tests.
    (security.authorizeFilePath as any).mockResolvedValue({
      isAllowed: true,
      realPath: '/mock/path',
    });
    (security.isRestrictedPath as any).mockReturnValue(false);
    (security.isSensitiveDirectory as any).mockReturnValue(false);
  });

  it('should allow rating media if file is authorized', async () => {
    (security.authorizeFilePath as any).mockResolvedValue({
      isAllowed: true,
      realPath: '/allowed/file.mp4',
    });

    const response = await request(app)
      .post('/api/media/rate')
      .send({ filePath: '/allowed/file.mp4', rating: 5 });

    expect(response.status).toBe(200);
    expect(database.setRating).toHaveBeenCalledWith('/allowed/file.mp4', 5);
  });

  // VULNERABILITY REPRODUCTION TEST
  it('should BLOCK rating media if file is unauthorized (Vulnerability Repro)', async () => {
    // Setup unauthorized file
    (security.authorizeFilePath as any).mockResolvedValue({
      isAllowed: false,
      message: 'Access denied',
    });

    const response = await request(app)
      .post('/api/media/rate')
      .send({ filePath: '/etc/passwd', rating: 5 });

    // EXPECTATION: This should fail with 403 Forbidden
    // CURRENT REALITY: It likely passes (200) because the check is missing
    if (response.status === 200) {
      console.log('VULNERABILITY CONFIRMED: Can rate unauthorized files');
      // For now, assertion will fail to prove it's broken,
      // or we can expect 200 to confirm reproduction, then change to 403 after fix.
      // I'll expect 403, so this test fails now, and passes after fix.
      expect(response.status).toBe(403);
    } else {
      expect(response.status).toBe(403);
    }

    // Ensure DB was not called if blocked
    if (response.status === 403) {
      expect(database.setRating).not.toHaveBeenCalled();
    }
  });

  it('should BLOCK upserting metadata if file is unauthorized', async () => {
    (security.authorizeFilePath as any).mockResolvedValue({
      isAllowed: false,
      message: 'Access denied',
    });

    const response = await request(app)
      .post('/api/media/metadata')
      .send({ filePath: '/etc/passwd', metadata: { duration: 100 } });

    expect(response.status).toBe(403);
    expect(database.upsertMetadata).not.toHaveBeenCalled();
  });

  it('should FILTER batch metadata retrieval for unauthorized files', async () => {
    // 1 allowed, 1 denied
    (security.authorizeFilePath as any).mockImplementation(
      async (p: string) => {
        if (p === '/allowed.mp4') return { isAllowed: true, realPath: p };
        return { isAllowed: false, message: 'Access denied' };
      },
    );

    const response = await request(app)
      .post('/api/media/metadata/batch')
      .send({ filePaths: ['/allowed.mp4', '/secret.txt'] });

    // Expect success, but with filtered access
    expect(response.status).toBe(200);

    // Crucial: Verify that getMetadata was ONLY called with the allowed path
    expect(database.getMetadata).toHaveBeenCalledWith(['/allowed.mp4']);
    expect(database.getMetadata).not.toHaveBeenCalledWith(
      expect.arrayContaining(['/secret.txt']),
    );
  });
});
