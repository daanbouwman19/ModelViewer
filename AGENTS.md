# Agent Guidelines

This document provides guidelines for agents working on this repository.

## Pre-push Checks

To ensure the Continuous Integration (CI) pipeline remains green, please follow these steps before submitting any changes:

1.  **Format:** Run `npm run format` to ensure code style compliance. **You MUST run this after every code modification.**
2.  **Linting:** Run `npm run lint` to catch potential errors.
3.  **Type Checking:** Run `npm run typecheck` to verify TypeScript types.
4.  **Testing:** Run `npm run test` to execute the test suite. **Verify all tests pass.**
5.  **Coverage:** Run `npm run test:coverage` to check code coverage. **Ensure your changes do not decrease the overall coverage and new code is adequately covered.**

**Do not push changes if any of these steps fail.**

By adhering to these guidelines, we can prevent unnecessary CI failures and maintain a stable codebase.
