import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import * as systemRoutes from '../../../src/server/routes/system.routes';
import * as security from '../../../src/core/security';
import { ALL_SUPPORTED_EXTENSIONS } from '../../../src/core/constants';

// Mocks
vi.mock('../../../src/core/database');
vi.mock('../../../src/core/file-system');
vi.mock('../../../src/core/security');
vi.mock('../../../src/main/google-drive-service');
vi.mock('fs/promises');

// Mock Limiters
const mockLimiters = {
  readLimiter: (_req: any, _res: any, _next: any) => { _next(); },
  writeLimiter: (_req: any, _res: any, _next: any) => { _next(); },
  fileLimiter: (_req: any, _res: any, _next: any) => { _next(); },
  streamLimiter: (_req: any, _res: any, _next: any) => { _next(); },
};

describe('System Routes Final Gap Fill', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(bodyParser.json());
    app.use(systemRoutes.createSystemRoutes(mockLimiters as any));

    // Error handler
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((_err: any, _req: any, _res: any, _next: any) => {
        res.status(err.statusCode || 500).json({ error: err.message });
    });

    // Default mocks
    vi.mocked(security.validateInput).mockReturnValue(null);
  });

  it('GET /api/config/extensions: returns correct structure', async () => {
      const res = await request(app).get('/api/config/extensions');
      expect(res.status).toBe(200);
      expect(res.body.all).toEqual(ALL_SUPPORTED_EXTENSIONS);
  });

  it('GET /api/fs/ls: handles invalid path type (array/object passed as query)', async () => {
      const res = await request(app).get('/api/fs/ls?path[]=foo');
       expect(res.status).toBe(500);
  });

  it('GET /api/fs/parent: handles invalid path type', async () => {
      const res = await request(app).get('/api/fs/parent?path[]=foo');
       expect(res.status).toBe(500);
  });

  it('GET /api/fs/parent: handles validation failure', async () => {
      vi.mocked(security.validateInput).mockReturnValue({ isValid: false, message: 'Invalid' });
      const res = await request(app).get('/api/fs/parent?path=/foo');
       expect(res.status).toBe(500);
  });
});
