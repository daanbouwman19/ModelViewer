import { authorizeFilePath } from '../../core/security';
export { filterAuthorizedPaths } from '../../core/security';
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
