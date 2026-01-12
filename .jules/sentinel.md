## 2026-01-11 - Input Validation Improvement: Regex DOS Prevention

**Vulnerability:** The regex used to validate time formats in `src/core/media-utils.ts` (`/^(\d+:)+\d+(\.\d+)?$/`) was permissive, allowing an arbitrary number of colon-separated groups. While `(\d+:)+` followed by `\d+` does not inevitably lead to catastrophic backtracking due to the distinct separator, it is "bad code" that accepts invalid formats like `00:00:00:00:01` and could be stressful for regex engines with extremely long inputs.

**Learning:** Regex patterns allowing infinite repetition of groups (like `(a+)+` or `(group)+`) should be scrutinized for ReDoS risks. Even if safe from exponential backtracking, loose validation can lead to downstream issues (e.g., FFmpeg argument parsing) or resource exhaustion.

**Prevention:** Tighter validation was implemented using `^(?:\d+:){0,2}\d+(?:\.\d+)?$`. This explicitly limits the input to standard HH:MM:SS format (max 2 colons), rejecting malformed inputs early and safely.

## 2026-01-12 - [Sensitive Environment File Protection]

**Vulnerability:** The application blocked exact matches for sensitive directories (e.g., `.env`), but did not block variants like `.env.local`, `.env.production`, or `.env.staging` if they appeared within an allowed media directory. This could lead to information disclosure if a user accidentally adds a project root as a media source.
**Learning:** Checking for sensitive files using strict equality against a set (`Set.has`) is insufficient for files that follow a naming convention (like `.env*`).
**Prevention:** Use pattern matching (e.g., `startsWith('.env')`) or regex for blocking sensitive file categories, rather than relying on a static list of exact filenames.
