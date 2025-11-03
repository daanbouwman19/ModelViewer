**File:** `src/main/database-worker-functions.js`
**Function:** `generateFileId`
**Line:** 13
**Description:** The `generateFileId` function creates an MD5 hash of a file's path to use as a unique identifier in the database. This approach is flawed because the same file can be accessed through different paths (e.g., symlinks, network mounts, or simply being moved). When the path changes, the ID changes, and the application loses track of the file's view count and other associated data. This leads to inaccurate media statistics and a poor user experience.
**Impact:** If a user moves their media files, or accesses them from a different location, all view count history is lost.
**Proposed Fix:** I will modify the `generateFileId` function to create a more robust ID. Since hashing the entire file content is too slow, I will use a composite key based on file statistics that are unlikely to change for the same file: file size and modification time. This will provide a much more reliable way to identify files across different paths. I will also update the database schema to store these new values.
