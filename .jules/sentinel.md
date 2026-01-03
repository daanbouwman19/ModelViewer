## 2024-05-23 - IDOR on Metadata Endpoints

**Vulnerability:** The `/api/media/rate`, `/api/media/metadata`, and `/api/media/metadata/batch` endpoints were accepting arbitrary file paths from the request body and passing them directly to the database without checking if the file belonged to an authorized media directory.
**Learning:** Even internal API endpoints that seem to just update database records must validate that the target resource (filePath) is authorized. The existence of `authorizeFilePath` helper makes this easy, but it must be applied to _all_ endpoints dealing with file paths, not just file serving ones.
**Prevention:** Audit all endpoints that take a `filePath` or `filePaths` parameter. Ensure `authorizeFilePath` is called before any processing. For batch operations, filter the list to only allowed paths.
## 2025-01-03 - Authorization Bypass via Transcoding Parameter

**Vulnerability:** The  function in  had a logic flaw where it bypassed the  check when  was passed in the query parameters. The code relied implicitly on the data source layer () to enforce authorization, which violates defense-in-depth principles and leaves the application vulnerable if the data source implementation changes or if a different source type is used that assumes prior validation.
**Learning:** Security checks must be applied consistently at the controller level for *all* execution paths. Optimization branches (like  for local files) should not be the only place where validation occurs. Implicit reliance on lower layers for security is risky.
**Prevention:** Ensure that  (or equivalent authorization logic) is the first operation performed in any request handler that accesses file system resources, before any branching logic based on request parameters.
## 2025-01-03 - Authorization Bypass via Transcoding Parameter

**Vulnerability:** The `handleStreamRequest` function in `src/core/media-handler.ts` had a logic flaw where it bypassed the `validateFileAccess` check when `transcode=true` was passed in the query parameters. The code relied implicitly on the data source layer (`LocalMediaSource`) to enforce authorization, which violates defense-in-depth principles and leaves the application vulnerable if the data source implementation changes or if a different source type is used that assumes prior validation.
**Learning:** Security checks must be applied consistently at the controller level for *all* execution paths. Optimization branches (like `res.sendFile` for local files) should not be the only place where validation occurs. Implicit reliance on lower layers for security is risky.
**Prevention:** Ensure that `validateFileAccess` (or equivalent authorization logic) is the first operation performed in any request handler that accesses file system resources, before any branching logic based on request parameters.
