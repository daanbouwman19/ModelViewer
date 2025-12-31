# Architect's Journal

## 2025-02-18 - Encapsulate Process Configuration

**Smell:** FFmpeg argument lists were constructed inline within large handler functions (`serveTranscodedStream`), mixing configuration logic with execution logic.
**Insight:** This made the handler functions long and difficult to test (requiring process spawning mocks to verify arguments). It also led to drift where the implementation didn't match the architectural intent described in team memory.
**Prevention:** Extract process argument construction into pure utility functions (e.g., `getTranscodeArgs`). These functions should take inputs and return the argument array, allowing for direct unit testing of the configuration logic without side effects.

## 2024-05-22 - [Pattern Extraction] **Smell:** [Duplicate traversal logic] **Insight:** [4 functions implemented the same stack-based DFS independently] **Prevention:** [Use generator functions for common traversal patterns]

## 2025-02-18 - [Centralize Access Control] **Smell:** [Repetitive Security Logic] **Insight:** [Multiple route handlers implemented their own variant of `if (!gdrive) authorize()` logic. This creates a risk of forgetting the check in new handlers and inconsistent error responses.] **Prevention:** [Encapsulate the specific authorization policy (e.g., "Allow GDrive, Authorize Local") in a dedicated helper function (`validateFileAccess`). Use this helper in all relevant Express handlers to ensure uniform security and error messaging.]
