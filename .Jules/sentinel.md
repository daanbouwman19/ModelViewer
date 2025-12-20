## 2024-05-23 - IPC Authorization Checks

**Vulnerability:** Several IPC handlers (`record-media-view`, `get-media-view-counts`, `db:upsert-metadata`, etc.) accepted arbitrary file paths from the renderer without validating that they belonged to configured media directories. This could allow a compromised renderer process to probe for file existence (via timing side-channels or error messages) or potentially trigger NTLM hash leaks on Windows by accessing UNC paths.
**Learning:** IPC handlers in Electron are trusted entry points but often lack the same middleware/validation layers as HTTP servers. It's easy to assume "the renderer is my code", but in a defense-in-depth model (or if XSS occurs), the renderer should be treated as untrusted.
**Prevention:** Always validate file paths in IPC handlers using `authorizeFilePath` (or equivalent) before performing any file system operations or database writes involving those paths. Ensure consistent validation logic between the HTTP server and Electron IPC.

## 2024-05-24 - Unrestricted Media Directory Addition

**Vulnerability:** The `addMediaDirectory` endpoint allowed users to add sensitive system directories (like `/`, `/etc`, or `C:\`) as media sources. Since `authorizeFilePath` trusts all configured media directories, adding a root directory effectively bypassed path traversal protections, granting full file system access.
**Learning:** Whitelisting (checking against `getMediaDirectories`) is only as strong as the integrity of the whitelist itself. If users (or attackers) can easily add "everything" to the whitelist, the protection is nullified. Input validation must be applied to configuration changes too.
**Prevention:** Implement a blocklist for sensitive system paths (root, system dirs) in the `addMediaDirectory` logic. Ensure that the mechanism for expanding the trust boundary (adding a source) has its own security checks.
