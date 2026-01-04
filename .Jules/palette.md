## 2024-05-23 - Focus Visible on Custom Controls

**Learning:** Custom UI components (like floating media controls) often rely on `outline: none` to look sleek, but this destroys keyboard accessibility. Using `focus-visible:ring-*` provides a robust fallback that only appears when needed (keyboard navigation), preserving the mouse-user aesthetic while enabling full a11y.
**Action:** Always pair `outline: none` with a `focus-visible` ring style, especially on dark backgrounds where default browser rings might be invisible.
