# Agent Guidelines

This document provides guidelines for agents working on this repository.

## Pre-push Checks

To ensure the Continuous Integration (CI) pipeline remains green, please follow these steps before submitting any changes:

1.  **Verify:** Run `npm run verify`. This command runs format, lint, typecheck, and test:coverage in sequence. **YOU MUST RUN THIS AND ENSURE IT PASSES BEFORE COMMITTING.** If this step fails, **DO NOT SUBMIT**. Manually fixing these issues after submission wastes time and resources. Ensure success locally first.
2.  **Format:** Run `npm run format` to ensure code style compliance. **You MUST run this after every code modification.** Agents: Do not forget this step. Even if you only changed one line, format the entire project to ensure consistency.
3.  **Linting:** Run `npm run lint` to catch potential errors.
4.  **Type Checking:** Run `npm run typecheck` to verify TypeScript types.
5.  **Testing:** Run `npm run test` to execute the full test suite. **Verify ALL tests pass.** Do not rely on running only a subset of tests.
6.  **Coverage:** Run `npm run test:coverage` to check code coverage. **Ensure your changes do not decrease the overall coverage and new code is adequately covered.**

**Do not push changes if any of these steps fail. Failure to perform these checks will result in CI failure and rejection.**

## Project Structure and Conventions

### .jules Directory

- **Casing:** The directory named `.jules` must **ALWAYS** be lowercase. Never create a directory named `.Jules`.
- **Formatting:** All markdown files within `.jules` must be properly formatted. The `npm run verify` command includes checks for this, but be mindful of it.

## Definition of Done

A task is only complete after `npm run verify` passes with 100% success and coverage >= 80%.

By adhering to these guidelines, we can prevent unnecessary CI failures and maintain a stable codebase.
