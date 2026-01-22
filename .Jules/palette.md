## 2024-05-23 - Custom Checkbox Focus States

**Learning:** The app uses `sr-only` inputs for custom toggles but was missing visual focus indicators on the sibling `div`s, making keyboard navigation impossible.
**Action:** When finding `sr-only` inputs, always check if the visual sibling has `peer-focus-visible` styles. Use `peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500` to match the design system.
