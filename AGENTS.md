# Agent Guidelines

This document provides guidelines for agents working on this repository.

## Pre-push Checks

To ensure the Continuous Integration (CI) pipeline remains green, please follow these steps before submitting any changes:

1.  **Format:** Run `npm run format` to ensure code style compliance. **You MUST run this after every code modification.** Agents: Do not forget this step.
2.  **Linting:** Run `npm run lint` to catch potential errors. **Fix ALL linting errors before submitting.**
3.  **Type Checking:** Run `npm run typecheck` to verify TypeScript types. **Fix ALL type errors before submitting.**
4.  **Testing:** Run `npm run test` to execute the full test suite. **Verify ALL tests pass.** Do not rely on running only a subset of tests. **Fix ALL test failures before submitting.**
5.  **Coverage:** Run `npm run test:coverage` to check code coverage. **Ensure your changes do not decrease the overall coverage and new code is adequately covered.**

**Do not push changes if any of these steps fail. Failure to perform these checks will result in CI failure and rejection.**

## Code Quality & Best Practices

*   **Avoid Unused Variables:** Ensure all declared variables, imports, and parameters are used. If a variable is intentionally unused (e.g., in a mock or destructured assignment), prefix it with `_` or remove it.
*   **Comprehensive Testing:** Always run the *full* test suite (`npm run test`) locally before submitting. Running only specific test files can hide regressions in other parts of the application.
*   **Fixing Failures:** If a local check (lint, typecheck, test) fails, **stop and fix it immediately**. Do not attempt to bypass or ignore failures.

By adhering to these guidelines, we can prevent unnecessary CI failures and maintain a stable codebase.
