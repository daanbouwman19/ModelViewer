## 2024-05-24 - Extracting FFmpeg Utils
**Smell:** `media-handler.ts` was becoming a "God Object", mixing HTTP request handling with low-level FFmpeg process spawning and output parsing (`getFFmpegDuration`).
**Insight:** Logic that parses command-line tool output is purely functional and doesn't belong in an Express route handler or Controller. It belongs in a utility module.
**Prevention:** When adding new "helper" functions to a Controller/Handler file, ask: "Does this function need `req` or `res`?" If not, it probably belongs in `utils/` or a dedicated service.
