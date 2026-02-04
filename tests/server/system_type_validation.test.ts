import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';
import * as database from '../../src/core/database';

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
    realpath: vi.fn((p) => Promise.resolve(p)),
    access: vi.fn(() => Promise.resolve()),
    readFile: vi.fn(() => Promise.resolve('')),
  },
}));

describe('System Routes Type Validation', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  describe('POST /api/directories', () => {
    it('should return 400 for number as path', async () => {
      const payload = { path: 12345 };
      const response = await request(app)
        .post('/api/directories')
        .send(payload);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid path');
    });

    it('should return 400 for object as path', async () => {
      const payload = { path: { bad: 'object' } };
      const response = await request(app)
        .post('/api/directories')
        .send(payload);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid path');
    });
  });

  describe('DELETE /api/directories', () => {
    it('should return 400 for number as path', async () => {
      const payload = { path: 12345 };
      const response = await request(app)
        .delete('/api/directories')
        .send(payload);
      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/directories/active', () => {
    it('should return 400 for number as path', async () => {
      const payload = { path: 12345, isActive: true };
      const response = await request(app)
        .put('/api/directories/active')
        .send(payload);
      expect(response.status).toBe(400);
    });
  });
});
