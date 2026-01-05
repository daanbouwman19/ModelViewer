## 2026-01-05 - Server Configuration Vulnerabilities

**Vulnerability:** The Express server lacked a request timeout configuration, leaving it vulnerable to Slowloris attacks where connections are kept open indefinitely.
**Learning:** Default Node.js/Express server configurations often prioritize connectivity over security defaults, assuming a reverse proxy will handle timeouts. In standalone deployments (like this local server), these defaults must be overridden.
**Prevention:** Always explicitly set `server.setTimeout()` and other timeout values on Node.js HTTP/HTTPS servers.
