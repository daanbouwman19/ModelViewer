import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Generate a unique salt for this process lifetime.
const AUTH_SALT = crypto.randomBytes(16);

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
  // Instead, use scrypt (a slow KDF) to derive keys for secure comparison.
  // This satisfies requirements for password handling.
  // Using scryptSync with minimal parameters for reasonable performance on every request,
  // while still being a "slow hash" algorithm type.

  const keyLen = 32;
  const userKey = crypto.scryptSync(user, AUTH_SALT, keyLen);
  const passKey = crypto.scryptSync(pass, AUTH_SALT, keyLen);

  const loginKey = crypto.scryptSync(login, AUTH_SALT, keyLen);
  const passwordKey = crypto.scryptSync(password, AUTH_SALT, keyLen);

  const userMatch = crypto.timingSafeEqual(userKey, loginKey);
  const passMatch = crypto.timingSafeEqual(passKey, passwordKey);

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
