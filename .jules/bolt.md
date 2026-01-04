## 2025-02-19 - Database Worker I/O Optimization

**Learning:** When performing frequent database operations that depend on file system metadata (like generating file IDs from stats), always check the database for existing records first. Using `fs.stat` is expensive and redundant if the record already exists.

**Action:** Before calling `generateFileId` (which calls `fs.stat`), query the database to see if the file path is already indexed. This turns a filesystem call + DB write into a pure DB read for known files, significantly reducing I/O overhead on high-frequency operations like `recordMediaView`.
