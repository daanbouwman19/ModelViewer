import { Response } from 'express';
import {
  validateFileAccess,
  handleAccessCheck,
} from './access-validator.ts';

/**
 * Helper: Validates access and handles the response if denied.
 * Returns the authorized path if successful, or null if denied (response already sent).
 */
export async function getAuthorizedPath(
  res: Response,
  filePath: string,
): Promise<string | null> {
  const access = await validateFileAccess(filePath);
  if (handleAccessCheck(res, access)) {
    return null;
  }
  return access.success ? access.path : null;
}
