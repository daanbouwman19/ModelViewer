## 2024-05-22 - [Icon-Only Glass Buttons Accessibility]

**Learning:** The application frequently uses `.glass-button` or `.glass-button-icon` for control buttons. These often contain only icons (arrows, VLC icon) and lack text labels. This pattern repeats in `MediaDisplay` and `SourcesModal` close buttons.
**Action:** When using glass-styled buttons with icons, always verify `aria-label` presence, as they are likely to be purely visual. Future audits should target `.glass-button-icon` specifically.

## 2025-02-18 - [Custom Checkbox Accessibility in Tree Views]
**Learning:** The custom checkbox implementation in `AlbumTree.vue` separated the input from the text label, leaving the checkbox with no accessible name.
**Action:** When styling custom checkboxes where the text is a sibling, explicitly add `aria-label` to the input element referencing the item name.
