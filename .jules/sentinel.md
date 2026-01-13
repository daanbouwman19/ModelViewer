# Sentinel Journal

## 2026-01-11 - Input Validation Improvement: Regex DOS Prevention

**Vulnerability:** The regex used to validate time formats in `src/core/media-utils.ts` (`/^(\d+:)+\d+(\.\d+)?$/`) was permissive, allowing an arbitrary number of colon-separated groups. While `(\d+:)+` followed by `\d+` does not inevitably lead to catastrophic backtracking due to the distinct separator, it is "bad code" that accepts invalid formats like `00:00:00:00:01` and could be stressful for regex engines with extremely long inputs.
**Learning:** Regex patterns allowing infinite repetition of groups (like `(a+)+` or `(group)+`) should be scrutinized for ReDoS risks. Even if safe from exponential backtracking, loose validation can lead to downstream issues (e.g., FFmpeg argument parsing) or resource exhaustion.
**Prevention:** Tighter validation was implemented using `^(?:\d+:){0,2}\d+(?:\.\d+)?$`. This explicitly limits the input to standard HH:MM:SS format (max 2 colons), rejecting malformed inputs early and safely.

## 2026-01-12 - Sensitive Environment File Protection

**Vulnerability:** The file system scanner could potentially index sensitive configuration files (like `.env`) if they were inside a media directory.
**Learning:** Blocklists should be applied at the file discovery layer, not just at the access layer.
**Prevention:** Added `.env` to the `SENSITIVE_SUBDIRECTORIES` set and enforced checks during file scanning.

## 2026-01-13 - Concurrent Transcoding DoS Protection

**Vulnerability:** The `/api/stream` endpoint with `transcode=true` spawned unlimited FFmpeg processes.
**Learning:** `supertest` requests are lazy Thenables. When testing concurrency, you must explicitly call `.then()` to start the request; otherwise, `Promise.all` starts them sequentially or too late relative to the assertion.
**Prevention:** Implemented `MAX_CONCURRENT_TRANSCODES` semaphore in `src/server/server.ts` to limit active transcoding sessions to 3.
