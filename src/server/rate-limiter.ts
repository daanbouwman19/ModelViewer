import type { Request, Response, NextFunction, RequestHandler } from 'express';

// [SECURITY] Rate Limiter Factory to prevent abuse
// Replaces the previous single-purpose limiter with a reusable one
export function createRateLimiter(
  windowMs: number,
  max: number,
  message: string,
): RequestHandler {
  const hits = new Map<string, { count: number; resetTime: number }>();

  // Cleanup interval to prevent memory leaks
  setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of hits.entries()) {
      if (now > data.resetTime) hits.delete(ip);
    }
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    let data = hits.get(ip);

    if (!data || now > data.resetTime) {
      data = { count: 0, resetTime: now + windowMs };
      hits.set(ip, data);
    }

    if (data.count >= max) {
      console.warn(
        `[Security] Rate limit exceeded for ${req.method} ${req.path} from ${ip}`,
      );
      res.status(429).json({ error: message });
      return;
    }

    data.count++;
    next();
  };
}
