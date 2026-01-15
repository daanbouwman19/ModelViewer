## 2026-01-11 - Parameterized Tests for Utility Functions

**Discovery:** `tests/core/media-utils.query.test.ts` was using repetitive `it` blocks for simple input/output testing.
**Strategy:** Refactored to use `it.each` with a table-driven approach to cleanly handle edge cases like arrays, undefined, and null values, improving readability and maintainability.

## 2024-05-23 - Targeted Mocking for IPC Handlers

**Discovery:**
The test `tests/main/main.ipc.test.ts` imports the entire `src/main/main.js` application entry point to register IPC handlers. This causes side effects (like database initialization errors) and makes the test slow and flaky because it relies on the full application bootstrap process.

**Strategy:**
Instead of importing `main.js`, test the specific controller (e.g., `src/main/ipc/media-controller.ts`) that defines the handlers. Mock the `ipc-helper` utility to capture the registered handler and invoke it directly. This isolates the logic under test, removes side effects, and significantly improves test speed.
