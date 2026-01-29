## 2026-01-07 - Extracting FFmpeg Utils

**Smell:** `media-handler.ts` was becoming a "God Object", mixing HTTP request handling with low-level FFmpeg process spawning and output parsing (`getFFmpegDuration`).
**Insight:** Logic that parses command-line tool output is purely functional and doesn't belong in an Express route handler or Controller. It belongs in a utility module.
**Prevention:** When adding new "helper" functions to a Controller/Handler file, ask: "Does this function need `req` or `res`?" If not, it probably belongs in `utils/` or a dedicated service.

## 2026-01-08 - Extracting Media Type Logic

**Smell:** Duplicated logic for checking media types (image/video) in `MediaDisplay.vue` and `MediaGridItem.vue`. `MediaDisplay` implemented its own logic while `MediaGridItem` used cached extensions, leading to potential inconsistency.
**Insight:** Domain logic like "is this file an image?" should be centralized. This ensures consistency (e.g., handling Google Drive paths vs local paths) and performance (leveraging caches).
**Prevention:** When adding "check" functions in components (like `isImage` or `isValid`), check if a utility function already exists or create one if the logic is generic.

## 2026-01-14 - Extracting Rate Limiter

**Smell:** `server.ts` contained a reusable `createRateLimiter` factory function, adding noise to a "God Object".
**Insight:** Utility factories like rate limiters are generic and should be isolated from route handling logic to improve testability and readability.
**Prevention:** When creating factory functions or helpers that don't directly depend on the specific app context (other than types), move them to a dedicated utility file.

## 2026-01-16 - Extracting File Processing from Scan Loop

**Smell:** `scanDirectoryRecursive` had "Arrow Code" (deep nesting) inside its main loop, mixing iteration, type checking, filtering, and logging.
**Insight:** Separating traversal logic (recursion) from item processing (file validation) makes the recursive function easier to read and allows independent testing of file validation rules.
**Prevention:** When writing loops that iterate over items and perform complex checks, extract the check-and-process logic into a helper function (e.g., `processItem`).

## 2026-01-17 - Extracting Root Scan Logic

**Smell:** `performFullMediaScan` mixed iteration logic with the complex details of how to scan each root (Drive vs Local, error handling).
**Insight:** Extracting the per-root scanning logic into `scanRootDirectory` removed nested try/catch blocks and made the main orchestration function declarative and readable.
**Prevention:** When mapping over items to perform complex async operations (especially with error handling), extract the operation into a named async function.

## 2026-01-18 - Extracting FFmpeg Configuration

**Smell:** `getTranscodeArgs` contained a long list of magic strings defining the FFmpeg transcoding profile, making it hard to read and modify.
**Insight:** Separating configuration (transcoding parameters) from logic (argument building) improves readability and reduces the risk of accidental flag deletion.
**Prevention:** When defining complex CLI commands or configurations, use named constants to group related arguments instead of inlining them.

## 2026-01-22 - Extracting VLC Path Logic

**Smell:** `media-utils.ts` was becoming a "Kitchen Sink" containing platform-specific VLC path discovery mixed with generic file logic and FFmpeg helpers.
**Insight:** Platform-specific tool discovery (like finding VLC binary) is distinct from generic media file utilities.
**Prevention:** Group external tool discovery/configuration in dedicated modules (e.g., `utils/vlc-paths.ts`) rather than generic utility files.

## 2026-01-23 - Extracting Environment Logging

**Smell:** `media-scanner.ts` was polluted with repetitive `if (process.env.NODE_ENV !== 'test')` checks around every log statement, burying the actual scanning logic.
**Insight:** Logging conditional logic is an implementation detail that should be abstracted away. Inline environment checks create visual noise that makes control flow harder to follow.
**Prevention:** Use a dedicated logger or helper functions (`safeLog`) to encapsulate environment-specific logging rules.

## 2026-01-29 - Extracting Stream Processing Logic

**Smell:** `handleStreamRequest` in `media-handler.ts` had deep nesting and mixed concerns (authorization vs streaming strategy), making the flow hard to follow.
**Insight:** Separating the "decision" phase (checking authorization, optimizing for direct file) from the "action" phase (streaming via Ffmpeg or raw) clarifies the intent and reduces complexity.
**Prevention:** When a handler function performs multiple distinct steps (validate, authorize, optimize, execute), try to extract the "execute" phase into a separate function to keep the high-level flow linear.
