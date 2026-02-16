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

  // Address CodeQL Warning: Use HMAC-SHA256 for secure constant-time comparison.
  // Using a fixed salt/key for the HMAC ensures deterministic output for the same input
  // within the same process lifetime, but prevents simple hash attacks if the DB were leaked (not applicable here).
  // More importantly, it satisfies static analysis tools that flag raw SHA-256 on passwords.
  // We use a random ephemeral key per process restart to further secure the comparison in memory.
  const hmacKey = getHmacKey();

  const expectedUserHash = crypto
    .createHmac('sha256', hmacKey)
    .update(user)
    .digest();
  const actualUserHash = crypto
    .createHmac('sha256', hmacKey)
    .update(login)
    .digest();
  const expectedPassHash = crypto
    .createHmac('sha256', hmacKey)
    .update(pass)
    .digest();
  const actualPassHash = crypto
    .createHmac('sha256', hmacKey)
    .update(password)
    .digest();

  // Use timingSafeEqual on fixed-length HMACs
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

// Generate a random key once per process startup for HMAC operations
let _hmacKey: Buffer | null = null;
function getHmacKey(): Buffer {
  if (!_hmacKey) {
    _hmacKey = crypto.randomBytes(32);
  }
  return _hmacKey;
}

// Address Comment 2811708621: Extract 401 response logic helper
function sendUnauthorized(res: Response) {
  res.set('WWW-Authenticate', 'Basic realm="Media Player"');
  return res.status(401).send('Authentication required.');
}
