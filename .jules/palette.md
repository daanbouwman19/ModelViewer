## 2026-01-14 - Form Inputs Disconnected from Labels

**Learning:** In Vue components, simply placing a label near an input is not enough for accessibility. Inputs must have `id` attributes that match the `for` attribute of their corresponding `<label>`. This is especially easy to miss in "row" or "grid" layouts where they visually align but have no programmatic connection.
**Action:** Always check form layouts for `id` + `for` pairs. Use screen reader testing or automated a11y checks to catch these disconnects.
