/**
 * @file Auth routes.
 */
import { Router } from 'express';
import { AppError } from '../../core/errors.ts';
import { escapeHtml } from '../../core/security.ts';
import { getQueryParam } from '../../core/utils/http-utils.ts';
import {
  generateAuthUrl,
  authenticateWithCode,
} from '../../main/google-auth.ts';
import { getGoogleAuthSuccessPage } from '../auth-views.ts';
import type { RateLimiters } from '../middleware/rate-limiters.ts';
import { asyncHandler } from '../middleware/async-handler.ts';

export function createAuthRoutes(limiters: RateLimiters) {
  const router = Router();

  router.get(
    '/api/auth/google-drive/start',
    limiters.authLimiter,
    asyncHandler(async (_req, res) => {
      const url = generateAuthUrl();
      res.send(url);
    }),
  );

  router.post(
    '/api/auth/google-drive/code',
    limiters.authLimiter,
    asyncHandler(async (req, res) => {
      const { code } = req.body;
      if (!code) {
        throw new AppError(400, 'Missing code');
      }

      try {
        await authenticateWithCode(code);
        res.sendStatus(200);
      } catch (e: unknown) {
        const error = e as {
          code?: number;
          response?: { status?: number };
          message?: string;
        };
        if (
          error.code === 400 ||
          error.response?.status === 400 ||
          error.message?.includes('invalid_grant')
        ) {
          return res.status(400).json({ error: 'Invalid code' });
        }
        return res.status(500).json({ error: 'Authentication failed' });
      }
    }),
  );

  router.get(
    '/auth/google/callback',
    limiters.authLimiter,
    asyncHandler(async (req, res) => {
      const code = getQueryParam(req.query, 'code');
      if (!code || typeof code !== 'string') {
        throw new AppError(400, 'Missing or invalid code parameter');
      }

      const safeCode = escapeHtml(code);
      const nonce = res.locals.nonce as string;

      const html = getGoogleAuthSuccessPage(safeCode, nonce);
      res.send(html);
    }),
  );

  return router;
}
