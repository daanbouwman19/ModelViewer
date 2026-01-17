## 2026-01-07 - [Set vs Array Lookup]

**Learning:** `Array.prototype.includes` inside high-frequency loops (like weighted selection) creates O(N\*M) complexity.
**Action:** Use `Set` for O(1) lookups to reduce complexity to O(N) and avoid repeated array allocations.

## 2026-01-04 - Database Worker I/O Optimization

**Learning:** When performing frequent database operations that depend on file system metadata (like generating file IDs from stats), always check the database for existing records first. Using `fs.stat` is expensive and redundant if the record already exists.
**Action:** Before calling `generateFileId` (which calls `fs.stat`), query the database to see if the file path is already indexed. This turns a filesystem call + DB write into a pure DB read for known files, significantly reducing I/O overhead on high-frequency operations like `recordMediaView`.

## 2026-01-08 - [Array Spread vs Loop]

**Learning:** Using the spread operator (`push(...arr)`) for array concatenation causes stack overflow errors with large arrays (>65k items) because arguments are passed on the stack.
**Action:** Use manual loops or iterative concat for processing large datasets to ensure stability and reduce memory pressure.

## 2026-01-09 - [Redundant FS Stat in Media Processing]

**Learning:** `fs.stat` is expensive when called in a loop. `LocalFileSystemProvider.getMetadata` performs `fs.stat` but returns a subset of metadata (no duration). Calling it just to check for `duration` (which it doesn't have) is wasteful.
**Action:** Optimized `getVideoDuration` to skip the provider metadata check for local files, and updated `extractAndSaveMetadata` to skip duration extraction entirely for non-video files. This reduces I/O operations by 50% for local videos and 100% (of duration checks) for images.
