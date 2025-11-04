<template>
  <li
    class="album-item"
    :class="{ 'selected-for-slideshow': selectionState !== 'none' }"
    @click="handleClickAlbum(album)"
    :style="{ marginLeft: `${depth * 20}px` }"
  >
    <div class="album-content">
      <button @click.stop="toggle" v-if="isFolder" class="toggle-button">
        {{ isOpen ? '[-]' : '[+]' }}
      </button>
      <div class="album-controls" @click.stop>
        <label class="checkbox-container">
          <input
            type="checkbox"
            :checked="selectionState === 'all'"
            :indeterminate="selectionState === 'some'"
            @change="handleToggleSelection(album)"
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
    </div>
    <ul v-if="isFolder && isOpen" class="album-subtree">
      <AlbumTree
        v-for="child in album.children"
        :key="child.name"
        :album="child"
        :depth="depth + 1"
        :selection="selection"
        @toggleSelection="$emit('toggleSelection', $event)"
        @albumClick="$emit('albumClick', $event)"
      />
    </ul>
  </li>
</template>

<script setup>
/**
 * @file This is a recursive component used to render a tree of albums.
 * Each node in the tree can be expanded or collapsed to show/hide its children.
 * It emits events for album selection and clicks, which are handled by the parent component.
 */
import { ref, computed } from 'vue';
import { countTextures, getAlbumAndChildrenNames } from '../utils/albumUtils';

const props = defineProps({
  album: {
    type: Object,
    required: true,
  },
  depth: {
    type: Number,
    default: 0,
  },
  selection: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['toggleSelection', 'albumClick']);
const isOpen = ref(false);

/**
 * Checks if the album is a folder (i.e., has children).
 * @returns {boolean} True if the album has children.
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
 * @type {import('vue').ComputedRef<number>}
 */
const totalTextureCount = computed(() => countTextures(props.album));

const selectionState = computed(() => {
  const allChildren = getAlbumAndChildrenNames(props.album);
  const selectedChildren = allChildren.filter((name) => props.selection[name]);

  if (selectedChildren.length === 0) {
    return 'none';
  }
  if (selectedChildren.length === allChildren.length) {
    return 'all';
  }
  return 'some';
});

/**
 * Emits an event to toggle the selection of an album.
 * @param {import('../../main/media-scanner.js').Album} album - The album to toggle.
 */
const handleToggleSelection = (album) => {
  emit('toggleSelection', album);
};

/**
 * Emits an event to handle a click on an album.
 * @param {import('../../main/media-scanner.js').Album} album - The clicked album.
 */
const handleClickAlbum = (album) => {
  emit('albumClick', album);
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
  font-family: monospace;
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
  background: linear-gradient(135deg, #ffeef8 0%, #ffe0f0 100%);
  border: 2px solid #ffb6c1;
  border-radius: 6px;
  transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

.checkbox-container:hover .checkmark {
  border-color: #ff69b4;
  transform: scale(1.1);
}

.checkbox-container input[type='checkbox']:checked ~ .checkmark {
  background: linear-gradient(135deg, #ff69b4 0%, #ff1493 100%);
  border-color: #ff1493;
}

.checkmark.indeterminate {
  background: linear-gradient(135deg, #ff69b4 0%, #ff1493 100%);
  border-color: #ff1493;
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
