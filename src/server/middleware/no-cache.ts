import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to prevent caching for sensitive API responses.
 * Sets Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
 * Sets Pragma: no-cache
 * Sets Expires: 0
 * Sets Surrogate-Control: no-store
 *
 * Excludes streaming endpoints that benefit from caching/range requests.
 */
export function noCacheMiddleware(req: Request, res: Response, next: NextFunction) {
  // Check if the path is one of the streaming endpoints
  // Note: req.path is relative to the mount point '/api'
  const path = req.path;

  // Streaming endpoints to exclude from no-store
  if (
    path.startsWith('/stream') ||
    path.startsWith('/thumbnail') ||
    path.startsWith('/hls') ||
    path.startsWith('/serve') ||
    path.startsWith('/video/heatmap')
  ) {
    return next();
  }

  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  );
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}
