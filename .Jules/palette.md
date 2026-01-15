## 2025-02-20 - Extending Media Model
**Learning:** To add new metadata (like duration) to `MediaFile`, updates are required in:
1. `src/core/types.ts` (Interface)
2. `src/core/media-service.ts` (Backend mapping)
3. `src/renderer/composables/useLibraryStore.ts` (History mapping)
4. `src/renderer/components/AlbumsList.vue` (Playlist mapping)
**Action:** When adding properties, ensure all mapping points are updated to prevent partial data.
