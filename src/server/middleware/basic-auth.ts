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
    res.set('WWW-Authenticate', 'Basic realm="Media Player"');
    return res.status(401).send('Authentication required.');
  }

  const credentials = Buffer.from(match[1], 'base64').toString();
  // Split on the FIRST colon only to support passwords with colons
  const idx = credentials.indexOf(':');
  if (idx === -1) {
    res.set('WWW-Authenticate', 'Basic realm="Media Player"');
    return res.status(401).send('Authentication required.');
  }

  const login = credentials.substring(0, idx);
  const password = credentials.substring(idx + 1);

  // Use timingSafeEqual to prevent timing attacks
  const userBuffer = Buffer.from(user);
  const passBuffer = Buffer.from(pass);
  const loginBuffer = Buffer.from(login);
  const passwordBuffer = Buffer.from(password);

  let valid = true;

  // crypto.timingSafeEqual throws if lengths are different, so check length first.
  if (
    loginBuffer.length !== userBuffer.length ||
    !crypto.timingSafeEqual(loginBuffer, userBuffer)
  ) {
    valid = false;
  }

  if (
    passwordBuffer.length !== passBuffer.length ||
    !crypto.timingSafeEqual(passwordBuffer, passBuffer)
  ) {
    valid = false;
  }

  if (valid) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Media Player"');
  res.status(401).send('Authentication required.');
}
