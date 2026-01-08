## 2024-05-24 - Extracting Media Type Logic

**Smell:** Duplicated logic for checking media types (image/video) in `MediaDisplay.vue` and `MediaGridItem.vue`. `MediaDisplay` implemented its own logic while `MediaGridItem` used cached extensions, leading to potential inconsistency.
**Insight:** Domain logic like "is this file an image?" should be centralized. This ensures consistency (e.g., handling Google Drive paths vs local paths) and performance (leveraging caches).
**Prevention:** When adding "check" functions in components (like `isImage` or `isValid`), check if a utility function already exists or create one if the logic is generic.
