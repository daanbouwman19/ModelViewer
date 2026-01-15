## 2026-01-11 - Parameterized Tests for Utility Functions
**Discovery:** `tests/core/media-utils.query.test.ts` was using repetitive `it` blocks for simple input/output testing.
**Strategy:** Refactored to use `it.each` with a table-driven approach to cleanly handle edge cases like arrays, undefined, and null values, improving readability and maintainability.

## 2026-01-11 - Factory Extraction for Mock Processes
**Discovery:** Multiple test files (`tests/core/media-utils.test.ts`, `tests/core/media-handler.input.test.ts`, `tests/core/media-handler.test.ts`) were manually constructing complex mock child process objects with `EventEmitter` and stream setup, leading to high duplication and noise.
**Strategy:** Extracted a `createMockProcess(mockSpawn)` helper in `tests/core/test-utils.ts` that handles the boilerplate setup of `stdout`, `stderr`, and event methods, significantly reducing setup code in individual tests.
