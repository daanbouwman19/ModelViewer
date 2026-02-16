import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Generate a unique key for HMAC operations at module load.
// This key is used only for secure comparison of credentials within this process lifetime.
// It does not need to persist across restarts.
const AUTH_COMPARISON_KEY = crypto.randomBytes(32);

/**
 * Middleware for Basic Authentication.
 * Checks for `SYSTEM_USER` and `SYSTEM_PASSWORD` environment variables.
 * If set, enforces Basic Auth on all requests.
 */
export function basicAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const user = process.env.SYSTEM_USER;
  const pass = process.env.SYSTEM_PASSWORD;

  if (!user || !pass) {
    return next();
  }

  // Parse the Authorization header
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Basic (.+)$/);

  if (!match) {
    return sendUnauthorized(res);
  }

  const credentials = Buffer.from(match[1], 'base64').toString();
  // Split on the FIRST colon only to support passwords with colons
  const idx = credentials.indexOf(':');
  if (idx === -1) {
    return sendUnauthorized(res);
  }

  const login = credentials.substring(0, idx);
  const password = credentials.substring(idx + 1);

  // Address CodeQL Warning: Avoid hashing passwords with fast hashes.
  // Instead, use HMAC-SHA256 with a random key for secure comparison.
  // This produces fixed-length outputs suitable for constant-time comparison
  // without exposing the raw password or using a weak hash algorithm.

  const userHmac = crypto
    .createHmac('sha256', AUTH_COMPARISON_KEY)
    .update(user)
    .digest();
  const passHmac = crypto
    .createHmac('sha256', AUTH_COMPARISON_KEY)
    .update(pass)
    .digest();
  const loginHmac = crypto
    .createHmac('sha256', AUTH_COMPARISON_KEY)
    .update(login)
    .digest();
  const passwordHmac = crypto
    .createHmac('sha256', AUTH_COMPARISON_KEY)
    .update(password)
    .digest();

  const userMatch = crypto.timingSafeEqual(userHmac, loginHmac);
  const passMatch = crypto.timingSafeEqual(passHmac, passwordHmac);

  if (userMatch && passMatch) {
    return next();
  }

  return sendUnauthorized(res);
}

// Address Comment 2811708621: Extract 401 response logic helper
function sendUnauthorized(res: Response) {
  res.set('WWW-Authenticate', 'Basic realm="Media Player"');
  return res.status(401).send('Authentication required.');
}
