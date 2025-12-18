<template>
  <li
    class="flex flex-col items-start p-1.5 rounded-md transition-colors duration-200 cursor-pointer mb-0.5"
    :class="{
      'bg-indigo-500/15 border-l-2 border-indigo-500':
        selectionState !== 'none',
      'hover:bg-white/5': selectionState === 'none',
    }"
    :style="{ marginLeft: `${depth * 20}px` }"
    @click="handleClickAlbum(album)"
  >
    <div
      class="group flex items-center gap-2 w-full text-gray-300 hover:text-white"
    >
      <!-- Toggle Button (Triangle) -->
      <button
        v-if="isFolder"
        class="toggle-button flex items-center justify-center w-6 h-6 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors focus:outline-none"
        :aria-expanded="isOpen"
        :aria-label="isOpen ? `Collapse ${album.name}` : `Expand ${album.name}`"
        @click.stop="toggle"
      >
        <span
          class="text-[10px] transform transition-transform duration-200"
          :class="{ 'rotate-0': isOpen, '-rotate-90': !isOpen }"
          >▼</span
        >
      </button>
      <div v-else class="w-6 h-6"></div>

      <!-- Selection Checkbox -->
      <button
        class="flex items-center justify-center w-5 h-5 rounded hover:bg-white/10 transition-colors"
        data-testid="album-checkbox"
        :aria-label="`Select ${album.name}`"
        @click.stop="handleToggleSelection(album, $event)"
      >
        <div
          class="w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors"
          :class="[
            selectionState === 'all'
              ? 'bg-indigo-500 border-indigo-500'
              : selectionState === 'some'
                ? 'bg-indigo-500 border-indigo-500'
                : 'border-gray-600 hover:border-gray-400',
          ]"
        >
          <!-- Checkmark -->
          <svg
            v-if="selectionState === 'all'"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="w-2.5 h-2.5 text-white"
          >
            <path
              fill-rule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clip-rule="evenodd"
            />
          </svg>
          <!-- Indeterminate Dash -->
          <div
            v-else-if="selectionState === 'some'"
            class="w-2 h-0.5 bg-white rounded-full"
          ></div>
        </div>
      </button>

      <!-- Album Name -->
      <span class="grow text-sm font-medium truncate select-none">
        {{ album.name }}
      </span>

      <!-- Badge for count -->
      <span
        v-if="totalTextureCount > 0"
        class="shrink-0 bg-gray-800 text-gray-400 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
      >
        {{ totalTextureCount }}
      </span>

      <!-- Action buttons -->
      <div
        class="album-controls flex items-center gap-1 opacity-100 transition-opacity"
        @click.stop
      >
        <!-- Play Button for Folder/Album -->
        <button
          class="shrink-0 text-gray-500 hover:text-white p-1 rounded"
          title="Play Album"
          @click.stop="handleClickAlbum(album)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="w-4 h-4"
          >
            <path
              fill-rule="evenodd"
              d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z"
              clip-rule="evenodd"
            />
          </svg>
        </button>

        <!-- Grid Button -->
        <button
          class="shrink-0 text-gray-500 hover:text-white p-1 rounded"
          title="Open in Grid"
          @click.stop="handleOpenGrid(album)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="w-4 h-4"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Recursive Children -->
    <ul v-if="isFolder && isOpen" class="w-full mt-1">
      <AlbumTree
        v-for="child in album.children"
        :key="child.id"
        :album="child"
        :depth="depth + 1"
        :selection="selection"
        @toggle-selection="$emit('toggleSelection', $event)"
        @album-click="$emit('albumClick', $event)"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
/**
 * @file Recursive component for album tree.
 * Refactored to use Tailwind CSS and icon-based navigation.
 */
import { ref, computed } from 'vue';
import { countTextures, getAlbumAndChildrenIds } from '../utils/albumUtils';
import { useSlideshow } from '../composables/useSlideshow';
import type { Album } from '../../core/types';

const props = withDefaults(
  defineProps<{
    album: Album;
    depth?: number;
    selection: { [key: string]: boolean };
  }>(),
  {
    depth: 0,
  },
);

const emit = defineEmits<{
  (e: 'toggleSelection', payload: { album: Album; recursive: boolean }): void;
  (e: 'albumClick', album: Album): void;
}>();

const isOpen = ref(false);
const slideshow = useSlideshow();

const isFolder = computed(() => {
  return props.album.children && props.album.children.length > 0;
});

const toggle = () => {
  isOpen.value = !isOpen.value;
};

const totalTextureCount = computed(() => countTextures(props.album));

const selectionState = computed(() => {
  // We keep this logic in case visuals need to reflect selection state from elsewhere,
  // even if the checkbox is gone, we might highlight valid slideshow selections.
  const allChildrenIds = getAlbumAndChildrenIds(props.album);
  const selectedChildrenIds = allChildrenIds.filter(
    (id) => props.selection[id],
  );

  if (selectedChildrenIds.length === 0) {
    return 'none';
  }
  if (selectedChildrenIds.length === allChildrenIds.length) {
    return 'all';
  }
  return 'some';
});

// NOTE: Checkbox emit removed as UI element is removed.
// We can still trigger selection via other means or just rely on 'albumClick' for navigation.

/**
 * Emits an event to toggle the selection of an album.
 * @param album - The album to toggle.
 * @param event - The interaction event.
 */
const handleToggleSelection = (album: Album, event: MouseEvent) => {
  // If shift key is pressed, toggle ONLY the parent (not recursive)
  // Otherwise default to recursive (standard behavior)
  const recursive = !event.shiftKey;
  emit('toggleSelection', { album, recursive });
};

const handleClickAlbum = (album: Album) => {
  emit('albumClick', album);
};

const handleOpenGrid = (album: Album) => {
  slideshow.openAlbumInGrid(album);
};
</script>
