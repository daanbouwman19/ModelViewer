## 2025-02-19 - Vue Component Optimization

**Learning:** When rendering large lists (even virtualized ones), minimize the work done in child components' `computed` properties. Moving repetitive logic (like string parsing for file extensions) to a shared utility with a `WeakMap` cache prevents redundant recalculations across thousands of component instances.

**Action:** Identify derived properties that depend only on stable object references (like `MediaFile`). Extract them to a shared utility using `WeakMap` for caching. This turns O(N) rendering work into O(1) lookups.
