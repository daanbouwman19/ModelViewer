## 2026-01-07 - Extracting FFmpeg Utils

**Smell:** `media-handler.ts` was becoming a "God Object", mixing HTTP request handling with low-level FFmpeg process spawning and output parsing (`getFFmpegDuration`).
**Insight:** Logic that parses command-line tool output is purely functional and doesn't belong in an Express route handler or Controller. It belongs in a utility module.
**Prevention:** When adding new "helper" functions to a Controller/Handler file, ask: "Does this function need `req` or `res`?" If not, it probably belongs in `utils/` or a dedicated service.

## 2026-01-08 - Extracting Media Type Logic

**Smell:** Duplicated logic for checking media types (image/video) in `MediaDisplay.vue` and `MediaGridItem.vue`. `MediaDisplay` implemented its own logic while `MediaGridItem` used cached extensions, leading to potential inconsistency.
**Insight:** Domain logic like "is this file an image?" should be centralized. This ensures consistency (e.g., handling Google Drive paths vs local paths) and performance (leveraging caches).
**Prevention:** When adding "check" functions in components (like `isImage` or `isValid`), check if a utility function already exists or create one if the logic is generic.

## 2026-01-09 - Extracting Middleware Factories

**Smell:** `server.ts` contained inline middleware factory functions (`createRateLimiter`), cluttering the route configuration logic.
**Insight:** Middleware factories are infrastructure components independent of the specific app instance. Extracting them improves the readability of the main server file and enables easier unit testing of the middleware itself.
**Prevention:** If a function in `server.ts` returns an `express.RequestHandler` and defines its own scope/closure (like `setInterval` or `Map`), move it to a dedicated file.
