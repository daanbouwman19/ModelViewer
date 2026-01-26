## 2026-01-11 - Parameterized Tests for Utility Functions

**Discovery:** `tests/core/media-utils.query.test.ts` was using repetitive `it` blocks for simple input/output testing.
**Strategy:** Refactored to use `it.each` with a table-driven approach to cleanly handle edge cases like arrays, undefined, and null values, improving readability and maintainability.

## 2024-05-23 - Targeted Mocking for IPC Handlers

**Discovery:**
The test `tests/main/main.ipc.test.ts` imports the entire `src/main/main.js` application entry point to register IPC handlers. This causes side effects (like database initialization errors) and makes the test slow and flaky because it relies on the full application bootstrap process.

**Strategy:**
Instead of importing `main.js`, test the specific controller (e.g., `src/main/ipc/media-controller.ts`) that defines the handlers. Mock the `ipc-helper` utility to capture the registered handler and invoke it directly. This isolates the logic under test, removes side effects, and significantly improves test speed.

## 2026-01-18 - Standardized Child Process Mocking

**Discovery:** Multiple tests (`media-utils.test.ts`, `media-handler.input.test.ts`) were manually constructing mock `EventEmitter` objects to simulate `child_process.spawn`. This led to duplicated setup code and inconsistent mocking of streams like `stdout` and `stderr`.

**Strategy:** Introduced a `createMockProcess` helper in `tests/helpers/test-utils.ts` that factories a standard mock process with `PassThrough` streams for `stdout`/`stderr` and default spies for methods like `kill`. This simplifies test setup and ensures consistent behavior across tests interacting with subprocesses.

## 2026-01-19 - Removing False Async Waits in Worker Mocks

**Discovery:** `tests/core/database.coverage.test.ts` relied on arbitrary `setTimeout` delays to test synchronous mock interactions, introducing unnecessary slowness and potential flakiness. The setup code was also heavily duplicated.

**Strategy:** Refactored to remove all `setTimeout` calls (as `postMessage` on the mock is synchronous) and extracted the worker initialization into a factory helper (`initTestDb`), reducing noise and improving test speed.

## 2026-01-20 - Deterministic Worker Messaging Tests

**Discovery:** `tests/core/media-service.test.ts` relied on flaky `setTimeout` delays (50ms) to wait for worker `postMessage` calls. This introduced race conditions where tests could fail on slower CI environments if the worker didn't respond in time.

**Strategy:**
Implemented a callback-based interception mechanism for the `postMessage` mock. Tests now await a promise that resolves immediately when `postMessage` is called, ensuring deterministic execution and eliminating arbitrary sleeps.

## 2026-01-21 - Targeted Mocking for Process Timeouts

**Discovery:** `tests/core/media-utils.timeout.test.ts` was relying on a real 1-second process sleep to test timeout logic, causing unnecessary delay and reliance on system scheduling.

**Strategy:** Refactored to mock `execa` directly, simulating the timeout condition immediately. This reduced test duration from ~1000ms to ~15ms and removed flaky timing dependencies.

## 2026-01-22 - Deterministic Concurrency Limit Testing

**Discovery:** `tests/server/server.transcode-limit.test.ts` was using `setTimeout(100)` to wait for concurrent requests to be "in flight", and `setTimeout(500)` in the mock to simulate work. This made the test slow and flaky, relying on timing assumptions.

**Strategy:** Replaced time-based waits with a controlled Promise barrier in the mock. The test now uses `vi.waitUntil` to confirm requests have started and explicitly releases them via a closure, ensuring deterministic execution regardless of system speed.
