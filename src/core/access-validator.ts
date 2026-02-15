import { Response } from 'express';
import { authorizeFilePath, AuthorizationResult } from './security.ts';

export type FileAccessResult =
  | { success: true; path: string }
  | { success: false; error: string; statusCode: number };

/**
 * Helper: Validates access to the file path.
 * Returns a result object indicating success or failure.
 *
 * This encapsulates the logic of checking "gdrive://" bypass vs local file authorization.
 */
export async function validateFileAccess(
  filePath: string,
): Promise<FileAccessResult> {
  try {
    const auth: AuthorizationResult = await authorizeFilePath(filePath);
    if (!auth.isAllowed) {
      return { success: false, error: 'Access denied.', statusCode: 403 };
    }
    // We return the authorized realPath to ensure subsequent file operations use the validated path.
    return { success: true, path: auth.realPath || filePath };
  } catch (error) {
    console.error('[Access] Validation error:', error);
    return { success: false, error: 'Internal server error.', statusCode: 500 };
  }
}

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
