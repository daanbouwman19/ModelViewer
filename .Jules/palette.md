## 2024-05-22 - [Icon-Only Glass Buttons Accessibility]

**Learning:** The application frequently uses `.glass-button` or `.glass-button-icon` for control buttons. These often contain only icons (arrows, VLC icon) and lack text labels. This pattern repeats in `MediaDisplay` and `SourcesModal` close buttons.
**Action:** When using glass-styled buttons with icons, always verify `aria-label` presence, as they are likely to be purely visual. Future audits should target `.glass-button-icon` specifically.

## 2025-02-18 - [Custom Checkbox Accessibility in Tree Views]

**Learning:** The custom checkbox implementation in `AlbumTree.vue` separated the input from the text label, leaving the checkbox with no accessible name.
**Action:** When styling custom checkboxes where the text is a sibling, explicitly add `aria-label` to the input element referencing the item name.

## 2025-05-22 - [Semantic Buttons for Grid Items]

**Learning:** `div`s with click handlers (like in `MediaGrid`) are invisible to keyboard users and screen readers unless manually patched with `role` and `tabindex`.
**Action:** Always wrap interactive list/grid items in a `<button>` tag instead of a `div`. This provides native focus handling, keyboard activation (Enter/Space), and semantic meaning for free. Use CSS reset utilities to remove button styling if a custom look is needed.

## 2025-05-23 - [Action Buttons in Lists]

**Learning:** List items (like media sources) often have repetitive action buttons (e.g., "Remove"). Without specific context, screen readers just announce "Remove, Remove, Remove".
**Action:** Always append the item's name or identifier to the `aria-label` of action buttons in lists (e.g., `aria-label="'Remove ' + item.name"`).

## 2025-10-27 - [Keyboard Navigation in File Explorers]

**Learning:** When converting file explorer items from `div` to `button`, the native `Enter` key triggers a `click` event, which typically only *selects* the item. Keyboard users need a way to *open* (navigate into) folders, which corresponds to `dblclick` for mouse users.
**Action:** Explicitly bind `@keydown.enter.prevent` to the open/navigate action on the button. This allows Space to select (via standard click) and Enter to open, matching standard OS file explorer behavior.
