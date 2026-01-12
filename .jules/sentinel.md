## 2026-01-12 - [Sensitive Environment File Protection]

**Vulnerability:** The application blocked exact matches for sensitive directories (e.g., `.env`), but did not block variants like `.env.local`, `.env.production`, or `.env.staging` if they appeared within an allowed media directory. This could lead to information disclosure if a user accidentally adds a project root as a media source.
**Learning:** Checking for sensitive files using strict equality against a set (`Set.has`) is insufficient for files that follow a naming convention (like `.env*`).
**Prevention:** Use pattern matching (e.g., `startsWith('.env')`) or regex for blocking sensitive file categories, rather than relying on a static list of exact filenames.
