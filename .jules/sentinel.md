## 2025-02-18 - Basic Auth DoS Mitigation

**Vulnerability:** The basic authentication middleware was using `scryptSync` (a slow KDF) to derive keys for `SYSTEM_USER` and `SYSTEM_PASSWORD` on _every_ request. This created a significant Denial of Service (DoS) vector where an attacker could flood the server with requests, causing high CPU usage and unresponsiveness.
**Learning:** While `scrypt` is excellent for password storage (hashing), it should not be used for per-request authentication checks unless there is strict rate limiting or caching. Using it for _input_ validation (deriving a key from the incoming password) on every request allows an attacker to force the server to perform expensive computations.
**Prevention:**

1.  **Cache static keys:** Derive keys for static credentials (like environment variables) once and cache them.
2.  **Use appropriate algorithms:** For comparing in-memory credentials (where the "hash" is not stored permanently), use a faster but still secure method like HMAC-SHA256 with a per-process random salt. This prevents timing attacks (via `timingSafeEqual`) without the massive CPU cost of `scrypt`.
