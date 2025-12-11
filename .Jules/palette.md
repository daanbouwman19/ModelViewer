## 2024-05-22 - [Icon-Only Glass Buttons Accessibility]
**Learning:** The application frequently uses `.glass-button` or `.glass-button-icon` for control buttons. These often contain only icons (arrows, VLC icon) and lack text labels. This pattern repeats in `MediaDisplay` and `SourcesModal` close buttons.
**Action:** When using glass-styled buttons with icons, always verify `aria-label` presence, as they are likely to be purely visual. Future audits should target `.glass-button-icon` specifically.
