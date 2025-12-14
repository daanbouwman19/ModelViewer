## 2025-02-18 - Recursive Array Concatenation Bottleneck

**Learning:** The codebase used `array.concat(recursiveCall())` for flattening album trees. This creates $O(N^2)$ complexity due to repeated array copying.
**Action:** Replace similar recursive patterns (e.g., in `useSlideshow.ts`) with iterative stack-based traversal or a recursive accumulator to achieve $O(N)$.

## 2025-02-19 - Parallelized File ID Generation in Database Worker

**Learning:** Found an N+1 I/O bottleneck in `database-worker.ts` where `fs.stat` was called sequentially for thousands of files.
**Action:** Use `Promise.allSettled` with batching (e.g., chunk size 50) to parallelize file system operations resiliently without exhausting file descriptors.
