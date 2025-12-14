## 2025-02-18 - Permissive CORS Configuration
**Vulnerability:** The Express server used `cors()` without options, allowing any origin (`*`) to access the API.
**Learning:** Defaulting to `*` is dangerous for local servers (localhost:3000) because it allows websites (like evil.com) to access local resources via the user's browser.
**Prevention:** Always restrict `origin` in `cors` configuration, especially for development servers. Use `Access-Control-Allow-Origin` to allow only the specific frontend URL.

## 2025-02-18 - Asynchronous Testing with Event Emitters
**Issue:** Tests for `getVideoDuration` (which wraps `spawn` in a Promise) timed out because events were emitted synchronously before the Promise logic could attach listeners or return.
**Learning:** When testing Promise-based wrappers around EventEmitters, ensure events are emitted asynchronously (e.g., `await new Promise(r => setTimeout(r, 0))`) to allow the Promise construction and listener attachment to complete.
**Prevention:** Use `setTimeout` or `setImmediate` in tests to defer event emission when mocking streams/processes.

## 2025-02-18 - Secure Architecture for Electron/Web Hybrid
**Issue:** Strict CORS breaks Electron's ability to fetch data from the local server if using `fetch` from `file://` origin (which is `null`).
**Learning:** Relying on HTTP `fetch` for internal application logic in Electron is brittle when implementing security best practices.
**Prevention:** Use IPC for all data retrieval in Electron. Reserve the local HTTP server strictly for media streaming (where `<video>` tags don't require CORS). This allows locking down the HTTP server completely.
