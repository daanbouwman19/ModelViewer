# Palette's Journal

**Learning:** The application frequently uses `.glass-button` or `.glass-button-icon` for control buttons. These often contain only icons (arrows, VLC icon) and lack text labels. This pattern repeats in `MediaDisplay` and `SourcesModal` close buttons.
**Action:** When using glass-styled buttons with icons, always verify `aria-label` presence, as they are likely to be purely visual. Future audits should target `.glass-button-icon` specifically.

## 2024-05-24 - [Initial Setup]

## 2025-02-18 - [Custom Checkbox Accessibility in Tree Views]

**Learning:** UX journal created.
**Action:** Use this to track critical UX/a11y learnings.

**Learning:** The custom checkbox implementation in `AlbumTree.vue` separated the input from the text label, leaving the checkbox with no accessible name.
**Action:** When styling custom checkboxes where the text is a sibling, explicitly add `aria-label` to the input element referencing the item name.

## 2024-05-24 - [MediaDisplay Navigation Icons]

## 2025-05-22 - [Semantic Buttons for Grid Items]

**Learning:** `div`s with click handlers (like in `MediaGrid`) are invisible to keyboard users and screen readers unless manually patched with `role` and `tabindex`.
**Action:** Always wrap interactive list/grid items in a `<button>` tag instead of a `div`. This provides native focus handling, keyboard activation (Enter/Space), and semantic meaning for free. Use CSS reset utilities to remove button styling if a custom look is needed.

## 2025-05-23 - [Action Buttons in Lists]

**Learning:** List items (like media sources) often have repetitive action buttons (e.g., "Remove"). Without specific context, screen readers just announce "Remove, Remove, Remove".
**Action:** Always append the item's name or identifier to the `aria-label` of action buttons in lists (e.g., `aria-label="'Remove ' + item.name"`).

## 2025-10-27 - [Keyboard Navigation in File Explorers]

**Learning:** When converting file explorer items from `div` to `button`, the native `Enter` key triggers a `click` event, which typically only _selects_ the item. Keyboard users need a way to _open_ (navigate into) folders, which corresponds to `dblclick` for mouse users.
**Action:** Explicitly bind `@keydown.enter.prevent` to the open/navigate action on the button. This allows Space to select (via standard click) and Enter to open, matching standard OS file explorer behavior.

## 2025-10-28 - [Modal Close Button Patterns]

**Learning:** Modal close buttons often use the generic "×" (&times;) character which screen readers may announce literally or ignore.
**Action:** Always add `aria-label="Close"` to modal close buttons to ensure they are announced as an actionable control.

## 2025-10-29 - [Semantic Buttons in Tree Views]

**Learning:** Tree items (`li`) with click handlers are not natively focusable. Wrapping the label content in a `<button>` (with `grow`) provides native keyboard support and better hit targets than patching `li` with ARIA.
**Action:** Refactor clickable list/tree rows to contain a semantic `<button>` that wraps the text content, ensuring the button grows to fill available space.

## 2025-10-30 - [Consistent Icon Usage]

**Learning:** Using HTML entities like `&times;` for icons leads to inconsistency in sizing and styling compared to SVG components. It also risks screen readers announcing "times" or "multiplication sign".
**Action:** Use dedicated SVG icon components (e.g., `<CloseIcon />`) instead of text characters for UI controls to ensure consistent visual language and better accessibility control.

## 2026-01-05 - [Accessible Names for Icon Buttons]

**Learning:** Icon-only buttons (like the VR recenter button) often rely solely on the `title` attribute, which is not a reliable accessible name for screen readers, especially on touch devices where hover tooltips are unavailable.
**Action:** Always add an explicit `aria-label` to icon-only buttons that mirrors the `title`, and add `aria-hidden="true"` to the internal SVG to prevent redundant or confusing announcements.

## 2026-01-11 - [Actionable Empty States]

**Learning:** The "Media will appear here" placeholder was passive and confusing for first-time users who hadn't configured sources yet.
**Action:** All empty states (library, playlists, search) should detect the _reason_ for emptiness (e.g., no sources vs. no search results) and provide a direct button to fix it (e.g., "Add Source", "Clear Filter").
