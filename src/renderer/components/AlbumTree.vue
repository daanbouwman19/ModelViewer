<template>
  <li
    class="album-item"
    :class="{ 'selected-for-slideshow': selectionState !== 'none' }"
    :style="{ marginLeft: `${depth * 20}px` }"
    @click="handleClickAlbum(album)"
  >
    <div class="album-content">
      <button
        v-if="isFolder"
        class="toggle-button"
        :aria-expanded="isOpen"
        :aria-label="isOpen ? `Collapse ${album.name}` : `Expand ${album.name}`"
        @click.stop="toggle"
      >
        {{ isOpen ? '▼' : '▶' }}
      </button>
      <div class="album-controls" @click.stop>
        <label class="checkbox-container">
          <input
            type="checkbox"
            :checked="selectionState === 'all'"
            :indeterminate="selectionState === 'some'"
            :aria-label="`Select ${album.name}`"
            @click="handleToggleSelection(album, $event)"
          />
          <span
            class="checkmark"
            :class="{ indeterminate: selectionState === 'some' }"
          ></span>
        </label>
      </div>
      <span class="album-name-clickable">
        {{ album.name }} ({{ totalTextureCount }})
      </span>
      <button
        class="text-xs text-gray-400 hover:text-white ml-2 p-1 rounded border border-gray-600 hover:bg-gray-700"
        title="Open in Grid"
        @click.stop="handleOpenGrid(album)"
      >
        Grid
      </button>
    </div>
    <ul v-if="isFolder && isOpen" class="album-subtree">
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
 * @file This is a recursive component used to render a tree of albums.
 * Each node in the tree can be expanded or collapsed to show/hide its children.
 * It emits events for album selection and clicks, which are handled by the parent component.
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

/**
 * Checks if the album is a folder (i.e., has children).
 * @returns True if the album has children.
 */
const isFolder = computed(() => {
  return props.album.children && props.album.children.length > 0;
});

/**
 * Toggles the expanded/collapsed state of the album.
 */
const toggle = () => {
  isOpen.value = !isOpen.value;
};

/**
 * The total number of textures in the current album and its descendants.
 */
const totalTextureCount = computed(() => countTextures(props.album));

const selectionState = computed(() => {
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

/**
 * Emits an event to handle a click on an album.
 * @param album - The clicked album.
 */
const handleClickAlbum = (album: Album) => {
  emit('albumClick', album);
};

/**
 * Opens the album in Grid View.
 * @param album - The album to open.
 */
const handleOpenGrid = (album: Album) => {
  slideshow.openAlbumInGrid(album);
};
</script>

<style scoped>
.album-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 8px 12px;
  border-radius: 8px;
  transition: all 0.2s ease;
  cursor: pointer;
}

.album-item:hover {
  background-color: rgba(255, 182, 193, 0.1);
}

.album-item.selected-for-slideshow {
  background-color: rgba(255, 192, 203, 0.15);
}

.album-content {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.toggle-button {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.toggle-button:hover {
  background-color: var(--accent-color);
  color: white;
}

.album-controls {
  display: flex;
  align-items: center;
}

.album-name-clickable {
  flex-grow: 1;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-color);
}

.album-subtree {
  list-style: none;
  padding: 0;
  width: 100%;
  margin-top: 4px;
}

/* Custom checkbox styling from AlbumsList.vue */
.checkbox-container {
  display: inline-block;
  position: relative;
  cursor: pointer;
  user-select: none;
}

.checkbox-container input[type='checkbox'] {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}

.checkmark {
  position: relative;
  display: inline-block;
  width: 20px;
  height: 20px;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  transition: all 0.3s ease;
}

.checkbox-container:hover .checkmark {
  border-color: var(--accent-color);
  transform: scale(1.1);
  box-shadow: 0 0 8px rgba(99, 102, 241, 0.4);
}

.checkbox-container input[type='checkbox']:checked ~ .checkmark {
  background: var(--accent-color);
  border-color: var(--accent-color);
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.5);
}

.checkmark.indeterminate {
  background: var(--accent-color);
  border-color: var(--accent-color);
}

.checkmark::after {
  content: '';
  position: absolute;
  display: none;
}

.checkbox-container input[type='checkbox']:checked ~ .checkmark::after {
  display: block;
  left: 6px;
  top: 2px;
  width: 5px;
  height: 10px;
  border: solid white;
  border-width: 0 3px 3px 0;
  transform: rotate(45deg);
}

.checkmark.indeterminate::after {
  display: block;
  left: 50%;
  top: 50%;
  width: 10px;
  height: 3px;
  background-color: white;
  transform: translate(-50%, -50%);
}
</style>
