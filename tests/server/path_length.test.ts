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

describe('Path Length Validation', () => {
  let app: any;
  const longPath = '/' + 'a'.repeat(MAX_PATH_LENGTH + 100);

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  describe('POST /api/directories', () => {
    it('should reject paths longer than MAX_PATH_LENGTH', async () => {
      const payload = { path: longPath };
      vi.mocked(database.addMediaDirectory).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/directories')
        .send(payload);

      expect(response.status).toBe(400);
      expect(database.addMediaDirectory).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/directories', () => {
    it('should reject paths longer than MAX_PATH_LENGTH', async () => {
      const payload = { path: longPath };
      vi.mocked(database.removeMediaDirectory).mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/api/directories')
        .send(payload);

      expect(response.status).toBe(400);
      expect(database.removeMediaDirectory).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/directories/active', () => {
    it('should reject paths longer than MAX_PATH_LENGTH', async () => {
      const payload = { path: longPath, isActive: true };
      vi.mocked(database.setDirectoryActiveState).mockResolvedValue(undefined);

      const response = await request(app)
        .put('/api/directories/active')
        .send(payload);

      expect(response.status).toBe(400);
      expect(database.setDirectoryActiveState).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/fs/ls', () => {
    it('should reject paths longer than MAX_PATH_LENGTH', async () => {
      const response = await request(app)
        .get('/api/fs/ls')
        .query({ path: longPath });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/fs/parent', () => {
    it('should reject paths longer than MAX_PATH_LENGTH', async () => {
      const response = await request(app)
        .get('/api/fs/parent')
        .query({ path: longPath });

      expect(response.status).toBe(400);
    });
  });
});
