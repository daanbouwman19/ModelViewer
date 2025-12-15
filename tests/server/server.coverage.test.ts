import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';
import * as database from '../../src/core/database';

// Mock dependencies
vi.mock('../../src/core/database');
vi.mock('../../src/core/media-service');
vi.mock('../../src/core/file-system');
vi.mock('../../src/core/security', () => ({
  authorizeFilePath: vi.fn().mockResolvedValue({ isAllowed: true }),
}));

describe('Server Coverage (Extra Routes)', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  describe('Smart Playlists Routes', () => {
    describe('GET /api/smart-playlists', () => {
      it('should return lists', async () => {
        const lists = [{ id: 1, name: 'List' }];
        (database.getSmartPlaylists as any).mockResolvedValue(lists);
        const res = await request(app).get('/api/smart-playlists');
        expect(res.status).toBe(200);
        expect(res.body).toEqual(lists);
      });
      it('should handle errors', async () => {
        (database.getSmartPlaylists as any).mockRejectedValue(
          new Error('Fail'),
        );
        const res = await request(app).get('/api/smart-playlists');
        expect(res.status).toBe(500);
      });
    });

    describe('POST /api/smart-playlists', () => {
      it('should create list', async () => {
        (database.createSmartPlaylist as any).mockResolvedValue({ id: 2 });
        const res = await request(app)
          .post('/api/smart-playlists')
          .send({ name: 'New', criteria: '{}' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ id: 2 });
      });
      it('should 400 on missing arguments', async () => {
        const res = await request(app)
          .post('/api/smart-playlists')
          .send({ name: 'New' });
        expect(res.status).toBe(400);
      });
      it('should handle errors', async () => {
        (database.createSmartPlaylist as any).mockRejectedValue(
          new Error('Fail'),
        );
        const res = await request(app)
          .post('/api/smart-playlists')
          .send({ name: 'New', criteria: '{}' });
        expect(res.status).toBe(500);
      });
    });

    describe('PUT /api/smart-playlists/:id', () => {
      it('should update list', async () => {
        const res = await request(app)
          .put('/api/smart-playlists/1')
          .send({ name: 'Upd', criteria: '{}' });
        expect(res.status).toBe(200);
        expect(database.updateSmartPlaylist).toHaveBeenCalledWith(
          1,
          'Upd',
          '{}',
        );
      });
      it('should 400 on invalid id or args', async () => {
        const res = await request(app)
          .put('/api/smart-playlists/invalid')
          .send({ name: 'Upd' });
        expect(res.status).toBe(400);
      });
      it('should handle errors', async () => {
        (database.updateSmartPlaylist as any).mockRejectedValue(
          new Error('Fail'),
        );
        const res = await request(app)
          .put('/api/smart-playlists/1')
          .send({ name: 'Upd', criteria: '{}' });
        expect(res.status).toBe(500);
      });
    });

    describe('DELETE /api/smart-playlists/:id', () => {
      it('should delete list', async () => {
        const res = await request(app).delete('/api/smart-playlists/1');
        expect(res.status).toBe(200);
        expect(database.deleteSmartPlaylist).toHaveBeenCalledWith(1);
      });
      it('should 400 on invalid id', async () => {
        const res = await request(app).delete('/api/smart-playlists/bad');
        expect(res.status).toBe(400);
      });
      it('should handle errors', async () => {
        (database.deleteSmartPlaylist as any).mockRejectedValue(
          new Error('Fail'),
        );
        const res = await request(app).delete('/api/smart-playlists/1');
        expect(res.status).toBe(500);
      });
    });
  });

  describe('Media Operations Routes', () => {
    describe('POST /api/media/rate', () => {
      it('should set rating', async () => {
        const res = await request(app)
          .post('/api/media/rate')
          .send({ filePath: 'f.mp4', rating: 5 });
        expect(res.status).toBe(200);
        expect(database.setRating).toHaveBeenCalledWith('f.mp4', 5);
      });
      it('should 400 on missing arguments', async () => {
        const res = await request(app)
          .post('/api/media/rate')
          .send({ filePath: 'f.mp4' });
        expect(res.status).toBe(400);
      });
      it('should handle errors', async () => {
        (database.setRating as any).mockRejectedValue(new Error('Fail'));
        const res = await request(app)
          .post('/api/media/rate')
          .send({ filePath: 'f.mp4', rating: 5 });
        expect(res.status).toBe(500);
      });
    });

    describe('GET /api/media/all', () => {
      it('should return all items', async () => {
        (database.getAllMetadataAndStats as any).mockResolvedValue([]);
        const res = await request(app).get('/api/media/all');
        expect(res.status).toBe(200);
      });
      it('should handle errors', async () => {
        (database.getAllMetadataAndStats as any).mockRejectedValue(
          new Error('Fail'),
        );
        const res = await request(app).get('/api/media/all');
        expect(res.status).toBe(500);
      });
    });

    describe('POST /api/media/metadata', () => {
      it('should upsert metadata', async () => {
        const res = await request(app)
          .post('/api/media/metadata')
          .send({ filePath: 'f.mp4', metadata: {} });
        expect(res.status).toBe(200);
      });
      it('should 400 on missing', async () => {
        const res = await request(app)
          .post('/api/media/metadata')
          .send({ filePath: 'f.mp4' });
        expect(res.status).toBe(400);
      });
      it('should handle errors', async () => {
        (database.upsertMetadata as any).mockRejectedValue(new Error('Fail'));
        const res = await request(app)
          .post('/api/media/metadata')
          .send({ filePath: 'f.mp4', metadata: {} });
        expect(res.status).toBe(500);
      });
    });

    describe('POST /api/media/metadata/batch', () => {
      it('should return batch metadata', async () => {
        (database.getMetadata as any).mockResolvedValue({});
        const res = await request(app)
          .post('/api/media/metadata/batch')
          .send({ filePaths: ['a'] });
        expect(res.status).toBe(200);
      });
      it('should 400 on invalid arg', async () => {
        const res = await request(app)
          .post('/api/media/metadata/batch')
          .send({ filePaths: 'nope' });
        expect(res.status).toBe(400);
      });
      it('should handle errors', async () => {
        (database.getMetadata as any).mockRejectedValue(new Error('Fail'));
        const res = await request(app)
          .post('/api/media/metadata/batch')
          .send({ filePaths: ['a'] });
        expect(res.status).toBe(500);
      });
    });
  });
});
