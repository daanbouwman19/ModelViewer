# Sentinel's Journal

## 2026-02-11 - Missing IPC Path Validation

**Vulnerability:** The `MEDIA_EXTRACT_METADATA` IPC handler accepted an array of file paths and passed them directly to `extractAndSaveMetadata` without validation. This allowed an attacker (renderer process) to probe for file existence and extract metadata (duration) of any file on the system, bypassing the allowed media directories restriction.
**Learning:** In Electron apps, IPC handlers are the security boundary. Services often assume trusted input. Explicit validation must happen at the IPC layer.
**Prevention:** Always apply `filterAuthorizedPaths` (for arrays) or `validatePathAccess` (for single paths) in every IPC handler that accepts file paths.
