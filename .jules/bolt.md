## 2026-04-01 - Database Worker I/O Optimization

**Learning:** When performing frequent database operations that depend on file system metadata (like generating file IDs from stats), always check the database for existing records first. Using `fs.stat` is expensive and redundant if the record already exists.

**Action:** Before calling `generateFileId` (which calls `fs.stat`), query the database to see if the file path is already indexed. This turns a filesystem call + DB write into a pure DB read for known files, significantly reducing I/O overhead on high-frequency operations like `recordMediaView`.

## 2024-05-22 - [Recursive Concatenation]
**Learning:** `Array.prototype.concat` in recursive functions (like flattening tree structures) has O(N^2) complexity due to repeated array copying.
**Action:** Use iterative stack-based traversal or push to a shared array accumulator instead.

## 2024-05-23 - [MediaGrid Virtualization]
**Learning:** `vue-virtual-scroller` requires fixed height items for optimal performance. Dynamic height calculation during scroll kills FPS.
**Action:** Ensure grid items have deterministic height or use a buffer.

## 2024-05-24 - [Slideshow Random Selection]
**Learning:** `filter().map()` chains in high-frequency loops (like slideshow item selection) create excessive garbage.
**Action:** Use imperative loops or single-pass selection logic to minimize GC pressure.
