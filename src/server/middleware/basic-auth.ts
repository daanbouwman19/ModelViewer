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
  // We handle length differences manually to ensure constant time relative to the expected credential length.

  const userBuf = Buffer.from(user);
  const passBuf = Buffer.from(pass);
  const loginBuf = Buffer.from(login);
  const passwordBuf = Buffer.from(password);

  let valid = true;

  // Compare User
  if (loginBuf.length !== userBuf.length) {
    valid = false;
    // Burn time consistent with comparison
    crypto.timingSafeEqual(userBuf, userBuf);
  } else {
    if (!crypto.timingSafeEqual(loginBuf, userBuf)) {
      valid = false;
    }
  }

  // Compare Password
  if (passwordBuf.length !== passBuf.length) {
    valid = false;
    // Burn time consistent with comparison
    crypto.timingSafeEqual(passBuf, passBuf);
  } else {
    if (!crypto.timingSafeEqual(passwordBuf, passBuf)) {
      valid = false;
    }
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
