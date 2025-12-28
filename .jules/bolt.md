## 2025-02-19 - Batch SQL Statement Caching

**Learning:** Recompiling SQL statements (`db.prepare`) inside a loop is a significant performance anti-pattern, especially for batch operations.
**Action:** Prepare a single parameterized statement for the standard batch size (e.g., 900) during initialization. Reuse this statement for all full batches, and only fallback to dynamic preparation for the final partial batch. This reduces SQL parsing overhead by O(N/BatchSize).
