import { describe, it, expect, vi, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';
import { MAX_API_BATCH_SIZE } from '../../src/core/constants';
import * as security from '../../src/core/security';
import * as database from '../../src/core/database';

// Mock dependencies
vi.mock('../../src/core/database');
vi.mock('../../src/core/security');

// Mock fs/promises with a factory to ensure we control the mocked functions
vi.mock('fs/promises', () => {
  return {
    default: {
      mkdir: vi.fn().mockResolvedValue(undefined),
      access: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(''),
      writeFile: vi.fn().mockResolvedValue(undefined),
      realpath: vi.fn().mockImplementation((path) => Promise.resolve(path)),
    },
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    realpath: vi.fn().mockImplementation((path) => Promise.resolve(path)),
  };
});

// Mock security to allow everything by default for these tests
vi.spyOn(security, 'authorizeFilePath').mockResolvedValue({
  isAllowed: true,
  realPath: '/mock/path',
});

// Mock database
vi.spyOn(database, 'getMediaViewCounts').mockResolvedValue({});
vi.spyOn(database, 'getMetadata').mockResolvedValue({});

describe('Server Batch Limit Security', () => {
  let app: any;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  it(`should reject /api/media/views requests with more than ${MAX_API_BATCH_SIZE} items`, async () => {
    const hugeArray = new Array(MAX_API_BATCH_SIZE + 1).fill(
      '/path/to/file.mp4',
    );

    const res = await request(app)
      .post('/api/media/views')
      .send({ filePaths: hugeArray });

    expect(res.status).toBe(400);
    expect(res.text).toBe(`Batch size exceeds limit of ${MAX_API_BATCH_SIZE}`);
  });

  it(`should accept /api/media/views requests with ${MAX_API_BATCH_SIZE} items`, async () => {
    const largeArray = new Array(MAX_API_BATCH_SIZE).fill('/path/to/file.mp4');

    const res = await request(app)
      .post('/api/media/views')
      .send({ filePaths: largeArray });

    expect(res.status).toBe(200);
  });

  it(`should reject /api/media/metadata/batch requests with more than ${MAX_API_BATCH_SIZE} items`, async () => {
    const hugeArray = new Array(MAX_API_BATCH_SIZE + 1).fill(
      '/path/to/file.mp4',
    );

    const res = await request(app)
      .post('/api/media/metadata/batch')
      .send({ filePaths: hugeArray });

    expect(res.status).toBe(400);
    expect(res.text).toBe(`Batch size exceeds limit of ${MAX_API_BATCH_SIZE}`);
  });

  it(`should accept /api/media/metadata/batch requests with ${MAX_API_BATCH_SIZE} items`, async () => {
    const largeArray = new Array(MAX_API_BATCH_SIZE).fill('/path/to/file.mp4');

    const res = await request(app)
      .post('/api/media/metadata/batch')
      .send({ filePaths: largeArray });

    expect(res.status).toBe(200);
  });
});
