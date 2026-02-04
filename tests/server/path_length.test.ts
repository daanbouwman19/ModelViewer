import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';
import * as database from '../../src/core/database';
import { MAX_PATH_LENGTH } from '../../src/core/constants';

// Mock dependencies
vi.mock('../../src/core/database');
vi.mock('../../src/core/media-service');
vi.mock('../../src/core/file-system');
vi.mock('../../src/core/media-handler', () => ({
  MediaHandler: class {},
}));
vi.mock('../../src/main/google-auth');
vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
    mkdir: vi.fn(),
    // Mock realpath to return the input path directly, bypassing filesystem checks
    realpath: vi.fn((p) => Promise.resolve(p)),
    access: vi.fn(() => Promise.resolve()),
    readFile: vi.fn(() => Promise.resolve('')),
  },
}));

// We don't want to mock security.ts entirely, but we need to ensure it works as expected.
// However, the issue is that system.routes.ts DOES NOT use security.ts for validation.
// So mocking security.ts or not shouldn't matter for the reproduction,
// UNLESS system.routes.ts imports something from it.
// It imports isRestrictedPath and isSensitiveDirectory.

describe('Path Length Validation', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  describe('POST /api/directories', () => {
    it('should currently accept paths longer than MAX_PATH_LENGTH', async () => {
      // Create a path longer than MAX_PATH_LENGTH
      const longPath = '/' + 'a'.repeat(MAX_PATH_LENGTH + 100);

      const payload = { path: longPath };

      // Mock addMediaDirectory to resolve successfully
      vi.mocked(database.addMediaDirectory).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/directories')
        .send(payload);

      // CURRENT BEHAVIOR: 200 OK (because validation is missing)
      // EXPECTED AFTER FIX: 400 Bad Request
      expect(response.status).toBe(400);

      expect(database.addMediaDirectory).not.toHaveBeenCalled();
    });
  });
});
