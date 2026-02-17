import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Generate a unique salt for this process lifetime.
const AUTH_SALT = crypto.randomBytes(16);

// Cache for derived keys to avoid re-computation
let cachedUser: string | undefined;
let cachedPass: string | undefined;
let cachedUserKey: Buffer | null = null;
let cachedPassKey: Buffer | null = null;

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
    // Reset cache if credentials are removed
    cachedUser = undefined;
    cachedPass = undefined;
    cachedUserKey = null;
    cachedPassKey = null;
    return next();
  }

  // Update cache if credentials changed
  if (user !== cachedUser || pass !== cachedPass) {
    cachedUser = user;
    cachedPass = pass;

    // Use HMAC-SHA256 for fast, secure key derivation for comparison.
    // This avoids the CPU overhead of scrypt (DoS risk) while still providing
    // fixed-length buffers for timingSafeEqual.
    // The "password" is an environment variable token, not a stored user password hash.
    // We use HMAC for constant-time comparison, not for secure storage.
    // lgtm[js/weak-cryptographic-algorithm]
    cachedUserKey = crypto
      .createHmac('sha256', AUTH_SALT)
      .update(user)
      .digest();
    // lgtm[js/weak-cryptographic-algorithm]
    cachedPassKey = crypto
      .createHmac('sha256', AUTH_SALT)
      .update(pass)
      .digest();
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

  // Derive keys for the provided credentials using the same method
  // lgtm[js/weak-cryptographic-algorithm]
  const loginKey = crypto
    .createHmac('sha256', AUTH_SALT)
    .update(login)
    .digest();
  // lgtm[js/weak-cryptographic-algorithm]
  const passwordKey = crypto
    .createHmac('sha256', AUTH_SALT)
    .update(password)
    .digest();

  // Safe comparison
  const userMatch =
    cachedUserKey && crypto.timingSafeEqual(cachedUserKey, loginKey);
  const passMatch =
    cachedPassKey && crypto.timingSafeEqual(cachedPassKey, passwordKey);

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
