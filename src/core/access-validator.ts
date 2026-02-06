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
  // which verifies they are in the allowed library via isFileInLibrary check.
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
