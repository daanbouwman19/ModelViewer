## 2026-01-24 - Accessibility of Hover Controls

**Learning:** Interactive controls that appear on hover (like play/grid buttons in a list) are often invisible to keyboard users. Using `opacity-0 group-hover:opacity-100` is insufficient for accessibility.
**Action:** Always include `group-focus-within:opacity-100` alongside `group-hover:opacity-100` to ensure controls become visible when a keyboard user tabs into the container.
