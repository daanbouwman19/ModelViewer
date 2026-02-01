## 2026-02-01 - RecycleScroller & Component Reuse
**Learning:** Components inside `vue-virtual-scroller` (`RecycleScroller`) are reused and props update, but local state does not reset automatically.
**Action:** When adding local state (like `isLoading`) to grid items, you MUST watch props (e.g., `item.path`) to reset the state manually.
