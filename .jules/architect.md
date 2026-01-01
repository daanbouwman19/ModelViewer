# Architect's Journal

## 2025-02-18 - Encapsulate Process Configuration

**Smell:** FFmpeg argument lists were constructed inline within large handler functions (`serveTranscodedStream`), mixing configuration logic with execution logic.
**Insight:** This made the handler functions long and difficult to test (requiring process spawning mocks to verify arguments). It also led to drift where the implementation didn't match the architectural intent described in team memory.
**Prevention:** Extract process argument construction into pure utility functions (e.g., `getTranscodeArgs`). These functions should take inputs and return the argument array, allowing for direct unit testing of the configuration logic without side effects.

## 2024-05-22 - [Pattern Extraction] **Smell:** [Duplicate traversal logic] **Insight:** [4 functions implemented the same stack-based DFS independently] **Prevention:** [Use generator functions for common traversal patterns]

## 2025-02-18 - [Centralize Access Control] **Smell:** [Repetitive Security Logic] **Insight:** [Multiple route handlers implemented their own variant of `if (!gdrive) authorize()` logic. This creates a risk of forgetting the check in new handlers and inconsistent error responses.] **Prevention:** [Encapsulate the specific authorization policy (e.g., "Allow GDrive, Authorize Local") in a dedicated helper function (`validateFileAccess`). Use this helper in all relevant Express handlers to ensure uniform security and error messaging.]
## 2024-05-22 - Extracted File Extension Logic\n\n**Smell:** Duplicate logic for parsing file extensions and checking media types across multiple Vue components and core utilities. This led to potential inconsistencies (e.g., handling dotfiles or paths with mixed separators) and violated DRY.\n\n**Insight:** By extracting this logic into a pure, testable utility (`src/core/utils/file-utils.ts`), we improved the robustness of extension parsing and simplified the consuming components. We avoided using Node's `path` module in the shared utility to ensure it remains safe for use in the Renderer process (browser environment) without polyfills.\n\n**Prevention:** Future file-related logic should always use `src/core/utils/file-utils.ts` instead of implementing ad-hoc string parsing. If new logic is needed, add it to this utility.
