## 2024-05-23 - IDOR on Metadata Endpoints

**Vulnerability:** The `/api/media/rate`, `/api/media/metadata`, and `/api/media/metadata/batch` endpoints were accepting arbitrary file paths from the request body and passing them directly to the database without checking if the file belonged to an authorized media directory.
**Learning:** Even internal API endpoints that seem to just update database records must validate that the target resource (filePath) is authorized. The existence of `authorizeFilePath` helper makes this easy, but it must be applied to _all_ endpoints dealing with file paths, not just file serving ones.
**Prevention:** Audit all endpoints that take a `filePath` or `filePaths` parameter. Ensure `authorizeFilePath` is called before any processing. For batch operations, filter the list to only allowed paths.
