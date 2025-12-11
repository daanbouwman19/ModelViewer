# Agent Guidelines

This document provides guidelines for agents working on this repository.

## Pre-push Checks

To ensure the Continuous Integration (CI) pipeline remains green, please follow these steps before submitting any changes:

1.  **Format Check:** Run `npm run format:check` to ensure code style compliance.
2.  **Linting:** Run `npm run lint` to catch potential errors.
3.  **Type Checking:** Run `npm run typecheck` to verify TypeScript types.
4.  **Testing:** Run `npm run test` to execute the test suite.

**Do not push changes if any of these steps fail.**

By adhering to these guidelines, we can prevent unnecessary CI failures and maintain a stable codebase.
