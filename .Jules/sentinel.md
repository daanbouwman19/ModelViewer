## 2024-05-23 - IPC Authorization Checks

**Vulnerability:** Several IPC handlers (`record-media-view`, `get-media-view-counts`, `db:upsert-metadata`, etc.) accepted arbitrary file paths from the renderer without validating that they belonged to configured media directories. This could allow a compromised renderer process to probe for file existence (via timing side-channels or error messages) or potentially trigger NTLM hash leaks on Windows by accessing UNC paths.
**Learning:** IPC handlers in Electron are trusted entry points but often lack the same middleware/validation layers as HTTP servers. It's easy to assume "the renderer is my code", but in a defense-in-depth model (or if XSS occurs), the renderer should be treated as untrusted.
**Prevention:** Always validate file paths in IPC handlers using `authorizeFilePath` (or equivalent) before performing any file system operations or database writes involving those paths. Ensure consistent validation logic between the HTTP server and Electron IPC.

## 2024-05-24 - Unrestricted Media Directory Addition

**Vulnerability:** The `addMediaDirectory` endpoint allowed users to add sensitive system directories (like `/`, `/etc`, or `C:\`) as media sources. Since `authorizeFilePath` trusts all configured media directories, adding a root directory effectively bypassed path traversal protections, granting full file system access.
**Learning:** Whitelisting (checking against `getMediaDirectories`) is only as strong as the integrity of the whitelist itself. If users (or attackers) can easily add "everything" to the whitelist, the protection is nullified. Input validation must be applied to configuration changes too.
**Prevention:** Implement a blocklist for sensitive system paths (root, system dirs) in the `addMediaDirectory` logic. Ensure that the mechanism for expanding the trust boundary (adding a source) has its own security checks.

## 2024-05-24 - File System Enumeration via Listing API

**Vulnerability:** The `/api/fs/ls` endpoint (used for browsing to find new media folders) allowed listing the contents of any directory on the server, including sensitive system paths like `/etc` or `C:\Windows`. This provided an information disclosure vector where an attacker could map the server's filesystem structure.
**Learning:** File browsing features require nuanced access controls. While users need to traverse directories to find media, allowing unrestricted listing of the entire filesystem exposes internal system details. "Navigability" does not imply "Unrestricted Visibility".
**Prevention:** Implement a separate `isRestrictedPath` check for listing operations that blocks known sensitive directories (e.g., `/etc`, `/proc`) while still allowing navigation through safe parents (e.g., `/`, `/home`) to reach user data. Distinguish between "Allowed to Scan" (whitelist) and "Allowed to Browse" (blacklist).

## 2024-05-27 - Security Fix Disparity between Server and IPC

**Vulnerability:** While `addMediaDirectory` and `listDirectory` were secured in the Express server (`server.ts`), the corresponding Electron IPC handlers (`system-controller.ts`) were missing the `isSensitiveDirectory` and `isRestrictedPath` checks. This left the Desktop application vulnerable to the same issues (path traversal, system enumeration) that were fixed in the Web version.
**Learning:** In dual-platform applications (Electron + Web), business logic and security checks must be centralized in the `core` or `shared` layer, or explicitly applied to both entry points (HTTP routes and IPC handlers). It is easy to fix one and forget the other.
**Prevention:** Centralize the "Operation" logic (e.g. `System.addMediaDirectory`) into a service that performs the security checks, rather than checking in the controller layer. If controllers must handle it, enforce a "Contract Test" that verifies security on both interfaces.

## 2024-05-23 - [Unauthenticated Directory Listing]

**Vulnerability:** The local web server (`src/server/server.ts`) exposed the `/api/fs/ls` endpoint to the entire local network by binding to `0.0.0.0` without authentication. This allowed any device on the network to enumerate the host's directory structure (Information Disclosure).
**Learning:** Development servers or "Personal" web apps often default to `0.0.0.0` for convenience (e.g., testing on mobile), but this is insecure when combined with unauthenticated sensitive endpoints.
**Prevention:** Default to `127.0.0.1` (localhost) for all local servers. Require explicit configuration (e.g., `HOST=0.0.0.0`) to expose services to the network, and document the risks.
