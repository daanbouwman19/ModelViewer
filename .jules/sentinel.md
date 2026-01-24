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

## 2026-01-15 - Cached Thumbnail IDOR

**Vulnerability:** Cached thumbnails were served based solely on the file path hash, checking for cache existence before validating if the user still had access to the original file. This allowed access to thumbnails of files that were subsequently restricted or removed from allowed directories.
**Learning:** Caching layers must enforce the same access controls as the primary data source. "Cache hit" logic should not bypass authorization checks.
**Prevention:** Moved `validateFileAccess` to the beginning of `serveThumbnail` in `src/core/thumbnail-handler.ts`, ensuring access is verified before checking the cache.

## 2025-01-20 - Sensitive Directory Root Protection

**Vulnerability:** An attacker could bypass sensitive file protections by adding the sensitive directory itself (e.g., `~/.ssh`) as a media source. The existing check only validated files _relative_ to the media source root, missing the root directory itself.
**Learning:** Validation logic must check the _entire_ path chain, including the root anchor, not just the segments below it.
**Prevention:** Updated `isSensitiveDirectory` to explicitly check if the target directory or any of its segments match the `SENSITIVE_SUBDIRECTORIES` blocklist.

## 2026-01-17 - Database Exposure and Case-Insensitive Bypass

**Vulnerability:** Access to the database file (`media-library.db`) and sensitive directories (like `node_modules`) was possible. The database file was not in the blocklist, allowing download if the app root was added as a source. Directory protection was bypassable on case-insensitive file systems (e.g., accessing `NODE_MODULES` on Windows).
**Learning:** File system security checks must account for platform-specific case sensitivity. Explicitly identifying and blocking critical application artifacts (like databases) is essential when user-controlled paths can overlap with application paths.
**Prevention:** Added database filenames and lockfiles to the blocklist. Updated `authorizeFilePath` to perform case-insensitive checks against the sensitive directory list.

## 2026-01-22 - Critical Environment File Exposure

**Vulnerability:** Files like `.npmrc` (containing auth tokens), `docker-compose.yml`, and shell history files were accessible via the API if located within an allowed media directory. The `SENSITIVE_SUBDIRECTORIES` blocklist was incomplete.
**Learning:** Default blocklists for sensitive files must be comprehensive and include development artifacts (Docker, NPM config) and system history files, not just common secrets like `.env` or `.ssh`. Attackers look for these specific files for credentials.
**Prevention:** Expanded `SENSITIVE_SUBDIRECTORIES` to include `.npmrc`, `.docker`, `docker-compose.yml`, `.bash_history` and other critical files.
