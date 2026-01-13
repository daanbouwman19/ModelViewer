# Sentinel Journal

## 2025-02-23 - Concurrent Transcoding DoS Protection
**Vulnerability:** The `/api/stream` endpoint with `transcode=true` spawned unlimited FFmpeg processes.
**Learning:** `supertest` requests are lazy Thenables. When testing concurrency, you must explicitly call `.then()` to start the request; otherwise, `Promise.all` starts them sequentially or too late relative to the assertion.
**Prevention:** Implemented `MAX_CONCURRENT_TRANSCODES` semaphore in `src/server/server.ts` to limit active transcoding sessions to 3.
