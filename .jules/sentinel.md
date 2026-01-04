## 2024-05-23 - IDOR on Metadata Endpoints

**Vulnerability:** The `/api/media/rate`, `/api/media/metadata`, and `/api/media/metadata/batch` endpoints were accepting arbitrary file paths from the request body and passing them directly to the database without checking if the file belonged to an authorized media directory.
**Learning:** Even internal API endpoints that seem to just update database records must validate that the target resource (filePath) is authorized. The existence of `authorizeFilePath` helper makes this easy, but it must be applied to _all_ endpoints dealing with file paths, not just file serving ones.
**Prevention:** Audit all endpoints that take a `filePath` or `filePaths` parameter. Ensure `authorizeFilePath` is called before any processing. For batch operations, filter the list to only allowed paths.

## 2024-05-24 - Implicit vs. Explicit Security Checks

**Vulnerability:** The `/api/serve` endpoint relied on `LocalMediaSource` to perform file access authorization implicitly. While technically secure, this created a dependency on the internal implementation of the source class, which is fragile.
**Learning:** Implicit security checks are risky because refactoring the underlying class might inadvertently remove the check. Explicit validation at the controller/route level (using `validateFileAccess`) provides "Defense in Depth" and ensures security policies are enforced consistently regardless of the underlying handler's implementation.
**Prevention:** Always use explicit validation (e.g., `validateFileAccess`) at the entry point (Route Handler) for all endpoints that access file resources, even if the service layer also performs checks.
