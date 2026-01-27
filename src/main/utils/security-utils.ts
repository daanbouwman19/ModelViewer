import { authorizeFilePath } from '../../core/security';
import { isDrivePath } from '../../core/media-utils';

/**
 * Validates access to a file path. Throws if access is denied.
 * Allows gdrive:// paths without check (assumed safe/handled by other layers).
 */
export async function validatePathAccess(filePath: string): Promise<void> {
  if (isDrivePath(filePath)) return;
  const auth = await authorizeFilePath(filePath);
  if (!auth.isAllowed) {
    throw new Error(auth.message || 'Access denied');
  }
}

/**
 * Filters a list of file paths, returning only those authorized.
 * Uses Promise.all for parallel verification.
 */
export async function filterAuthorizedPaths(
  filePaths: string[],
): Promise<string[]> {
  const results = await Promise.all(
    filePaths.map(async (p) => {
      if (isDrivePath(p)) return p;
      const auth = await authorizeFilePath(p);
      return auth.isAllowed ? p : null;
    }),
  );
  return results.filter((p) => p !== null) as string[];
}
