import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Generate a unique salt for this process lifetime.
const AUTH_SALT = crypto.randomBytes(16);

// Cache for derived keys to avoid re-computation
let cachedUser: string | undefined;
let cachedSecret: string | undefined;
let cachedUserKey: Buffer | null = null;
let cachedSecretKey: Buffer | null = null;

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
  const sysUser = process.env.SYSTEM_USER;
  const sysSecret = process.env.SYSTEM_PASSWORD;

  if (!sysUser || !sysSecret) {
    // Reset cache if credentials are removed
    cachedUser = undefined;
    cachedSecret = undefined;
    cachedUserKey = null;
    cachedSecretKey = null;
    return next();
  }

  // Update cache if credentials changed
  if (sysUser !== cachedUser || sysSecret !== cachedSecret) {
    cachedUser = sysUser;
    cachedSecret = sysSecret;

    // Use HMAC-SHA256 for fast, secure key derivation for comparison.
    // This avoids the CPU overhead of scrypt (DoS risk) while still providing
    // fixed-length buffers for timingSafeEqual.
    // The "password" is an environment variable token, not a stored user password hash.
    // We use HMAC for constant-time comparison, not for secure storage.
    // lgtm[js/insufficient-password-hash]
    cachedUserKey = crypto
      .createHmac('sha256', AUTH_SALT)
      .update(sysUser)
      .digest();
    // lgtm[js/insufficient-password-hash]
    cachedSecretKey = crypto
      .createHmac('sha256', AUTH_SALT)
      .update(sysSecret)
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

  const loginUser = credentials.substring(0, idx);
  const loginSecret = credentials.substring(idx + 1);

  // Derive keys for the provided credentials using the same method
  // lgtm[js/insufficient-password-hash]
  const loginKey = crypto
    .createHmac('sha256', AUTH_SALT)
    .update(loginUser)
    .digest();
  // lgtm[js/insufficient-password-hash]
  const secretKey = crypto
    .createHmac('sha256', AUTH_SALT)
    .update(loginSecret)
    .digest();

  // Safe comparison
  const userMatch =
    cachedUserKey && crypto.timingSafeEqual(cachedUserKey, loginKey);
  const secretMatch =
    cachedSecretKey && crypto.timingSafeEqual(cachedSecretKey, secretKey);

  if (userMatch && secretMatch) {
    return next();
  }

  return sendUnauthorized(res);
}

// Address Comment 2811708621: Extract 401 response logic helper
function sendUnauthorized(res: Response) {
  res.set('WWW-Authenticate', 'Basic realm="Media Player"');
  return res.status(401).send('Authentication required.');
}
