import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

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
  // Instead, use direct timing-safe comparison on buffers.
  // UPDATE: Using SHA-256 for comparison ensures constant-time check without leaking length.
  // We are not storing the hash, just using it for secure comparison.

  const userHash = crypto.createHash('sha256').update(user).digest();
  const passHash = crypto.createHash('sha256').update(pass).digest();
  const loginHash = crypto.createHash('sha256').update(login).digest();
  const passwordHash = crypto.createHash('sha256').update(password).digest();

  const userMatch = crypto.timingSafeEqual(userHash, loginHash);
  const passMatch = crypto.timingSafeEqual(passHash, passwordHash);

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
