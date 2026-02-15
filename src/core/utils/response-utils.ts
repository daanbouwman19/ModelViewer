import { Response } from 'express';
import { validateFileAccess } from '../access-validator.ts';

/**
 * Validates file access and sends an error response if access is denied.
 * Returns the authorized path if successful, or null if an error response was sent.
 *
 * @param res - The Express Response object.
 * @param filePath - The path to the file to check.
 * @returns The authorized path string or null.
 */
export async function ensureAuthorizedAccess(
  res: Response,
  filePath: string,
): Promise<string | null> {
  const access = await validateFileAccess(filePath);
  if (!access.success) {
    if (!res.headersSent) {
      res.status(access.statusCode).send(access.error);
    }
    return null;
  }
  return access.path;
}
