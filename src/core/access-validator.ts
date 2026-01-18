import { Response } from 'express';
import { isDrivePath } from './media-utils.ts';
import { authorizeFilePath } from './security.ts';

/**
 * Helper: Validates access to the file path.
 * If validation fails, it sends the appropriate error response and returns false.
 * If validation succeeds, it returns true.
 *
 * This encapsulates the logic of checking "gdrive://" bypass vs local file authorization.
 */
export async function validateFileAccess(
  res: Response,
  filePath: string,
): Promise<boolean | string> {
  // GDrive files are handled by their specific providers/logic
  if (isDrivePath(filePath)) return true;

  try {
    const auth = await authorizeFilePath(filePath);
    if (!auth.isAllowed) {
      if (!res.headersSent) res.status(403).send('Access denied.');
      return false;
    }
    // We return the authorized realPath to ensure subsequent file operations use the validated path.
    return auth.realPath || true;
  } catch (error) {
    console.error('[Access] Validation error:', error);
    if (!res.headersSent) res.status(500).send('Internal server error.');
    return false;
  }
}
