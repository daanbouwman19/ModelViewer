/**
 * @file Album routes.
 */
import { Router } from 'express';
import { AppError } from '../../core/errors.ts';
import {
  getAlbumsWithViewCounts,
  getAlbumsWithViewCountsAfterScan,
} from '../../core/media-service.ts';
import type { RateLimiters } from '../middleware/rate-limiters.ts';
import { asyncHandler } from '../middleware/async-handler.ts';

export function createAlbumRoutes(limiters: RateLimiters) {
  const router = Router();

  router.get(
    '/api/albums',
    limiters.readLimiter,
    asyncHandler(async (_req, res) => {
      try {
        const albums = await getAlbumsWithViewCounts();
        res.json(albums);
      } catch {
        throw new AppError(500, 'Failed to fetch albums');
      }
    }),
  );

  router.post(
    '/api/albums/reindex',
    limiters.writeLimiter,
    asyncHandler(async (_req, res) => {
      try {
        const albums = await getAlbumsWithViewCountsAfterScan();
        res.json(albums);
      } catch {
        throw new AppError(500, 'Failed to reindex');
      }
    }),
  );

  return router;
}
