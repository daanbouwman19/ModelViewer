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

  // Address Comment 2811708282: Use SHA-256 hashing to prevent timing attacks based on length.
  // We hash both the expected and provided credentials so they are always the same length (32 bytes).
  const expectedUserHash = crypto.createHash('sha256').update(user).digest();
  const actualUserHash = crypto.createHash('sha256').update(login).digest();
  const expectedPassHash = crypto.createHash('sha256').update(pass).digest();
  const actualPassHash = crypto.createHash('sha256').update(password).digest();

  // Use timingSafeEqual on fixed-length hashes
  let valid = true;

  if (!crypto.timingSafeEqual(actualUserHash, expectedUserHash)) {
    valid = false;
  }

  if (!crypto.timingSafeEqual(actualPassHash, expectedPassHash)) {
    valid = false;
  }

  if (valid) {
    return next();
  }

  return sendUnauthorized(res);
}

// Address Comment 2811708621: Extract 401 response logic helper
function sendUnauthorized(res: Response) {
  res.set('WWW-Authenticate', 'Basic realm="Media Player"');
  return res.status(401).send('Authentication required.');
}
