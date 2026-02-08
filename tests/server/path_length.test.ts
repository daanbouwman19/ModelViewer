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

  const testCases = [
    {
      method: 'post',
      url: '/api/directories',
      payload: { path: longPath },
      mockFn: database.addMediaDirectory,
      name: 'POST /api/directories',
    },
    {
      method: 'delete',
      url: '/api/directories',
      payload: { path: longPath },
      mockFn: database.removeMediaDirectory,
      name: 'DELETE /api/directories',
    },
    {
      method: 'put',
      url: '/api/directories/active',
      payload: { path: longPath, isActive: true },
      mockFn: database.setDirectoryActiveState,
      name: 'PUT /api/directories/active',
    },
    {
      method: 'get',
      url: '/api/fs/ls',
      query: { path: longPath },
      name: 'GET /api/fs/ls',
    },
    {
      method: 'get',
      url: '/api/fs/parent',
      query: { path: longPath },
      name: 'GET /api/fs/parent',
    },
  ];

  it.each(testCases)(
    'should reject paths longer than MAX_PATH_LENGTH for $name',
    async ({ method, url, payload, query, mockFn }) => {
      if (mockFn) {
        vi.mocked(mockFn).mockResolvedValue(undefined);
      }

      // Dynamic request method invocation
      let req = (request(app) as any)[method](url);

      if (payload) {
        req = req.send(payload);
      }
      if (query) {
        req = req.query(query);
      }

      const response = await req;

      expect(response.status).toBe(400);
      if (mockFn) {
        expect(mockFn).not.toHaveBeenCalled();
      }
    },
  );
});
