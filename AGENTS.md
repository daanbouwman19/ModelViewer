# IMPERATIVE: STOP AND READ THIS

To ensure a smooth development workflow and maintain a high-quality codebase, all contributors must adhere to the following guidelines.

> [!CRITICAL]
> **THE GOLDEN RULE:**
> You **MUST** run `npm run verify` locally before creating a PR.
> This command auto-fixes formatting. **CI runs `npm run format:check` and WILL FAIL if you skip this step.**
> Ensure `npm run verify` passes with **100% success** and **Coverage >= 80%**.
> **NO EXCEPTIONS.**

## 1. The Verification Process

Before you even _think_ about committing code, run this command:

```bash
npm run verify
```

This command runs:

1.  **Format** (`npm run format`)
2.  **Lint** (`npm run lint`)
3.  **Typecheck** (`npm run typecheck`)
4.  **Test & Coverage** (`npm run test:coverage`)

### If it fails:

- **FIX IT.** Do not ignore it. Do not "fix it later".
- If you cannot fix it, **revert your changes** and try a different approach.
- **NEVER** push code that fails verification. A broken build is a wasted PR.

## 2. Journal Guidelines

- **Date:** When adding a new entry to the journal (e.g., `.jules/bolt.md`, `.jules/architect.md`), **YOU MUST USE THE CURRENT DATE**.
- **Check:** Do not infer the year from previous entries. Check the "current local time" provided in your context.

## 3. Project Structure

- **.jules Directory:** Must always be lowercase.
- **Formatting:** Maintain perfect formatting in all files.
