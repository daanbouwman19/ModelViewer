<template>
  <div
    class="w-full md:w-1/3 md:shrink-0 bg-gray-800 shadow-lg rounded-lg p-4 flex flex-col overflow-y-auto panel custom-scrollbar"
  >
    <div class="header-controls">
      <button
        class="action-button"
        data-testid="start-slideshow-button"
        @click="handleStartSlideshow"
      >
        Start Slideshow
      </button>
      <div class="timer-controls">
        <label for="timer-duration">Timer (s):</label>
        <input
          id="timer-duration"
          v-model.number="timerDuration"
          type="number"
          min="1"
          class="timer-input"
        />
        <button class="timer-button" @click="handleToggleTimer">
          {{ isTimerRunning ? 'Pause' : 'Play' }}
        </button>
      </div>
      <div class="color-controls">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            v-model="chameleonMode"
            class="checkbox-input"
          />
          <span class="text-sm font-bold text-gray-300">Chameleon Mode</span>
        </label>
        <input
          v-if="chameleonMode"
          type="color"
          v-model="chameleonColor"
          class="color-picker"
        />
      </div>
      <button class="action-button" @click="openModal">Manage Sources</button>
    </div>
    <div
      v-if="isTimerRunning"
      class="progress-bar-container"
      data-testid="slideshow-progress-bar"
    >
      <div class="progress-bar" :style="{ width: `${timerProgress}%` }"></div>
    </div>
    <h2 class="albums-list-header">Albums</h2>
    <ul class="space-y-1 grow pr-2 albums-list">
      <li v-if="allAlbums.length === 0" class="text-gray-400">
        Loading albums...
      </li>
      <AlbumTree
        v-for="album in allAlbums"
        :key="album.name"
        :album="album"
        :selection="albumsSelectedForSlideshow"
        @toggle-selection="handleToggleSelection"
        @album-click="handleClickAlbum"
      />
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * @file This component displays the list of all available media albums in a tree structure.
 * It provides controls for starting a global slideshow, managing the timer,
 * opening the sources modal, and selecting/deselecting albums for the slideshow.
 * Clicking on an album's name starts a slideshow for that specific album and its sub-albums.
 */
import { useAppState } from '../composables/useAppState';
import { useSlideshow } from '../composables/useSlideshow';
import AlbumTree from './AlbumTree.vue';
import {
  getAlbumAndChildrenNames,
  collectTexturesRecursive,
} from '../utils/albumUtils';
import type { Album } from '../../main/media-scanner';

const {
  allAlbums,
  albumsSelectedForSlideshow,
  timerDuration,
  isTimerRunning,
  isSourcesModalVisible,
  timerProgress,
  chameleonMode,
  chameleonColor,
} = useAppState();

const slideshow = useSlideshow();

/**
 * Toggles the selection of an album and all its children. If any child is unselected,
 * it selects all of them. If all are already selected, it deselects all of them.
 * @param album - The album to toggle.
 */
const handleToggleSelection = (album: Album) => {
  const names = getAlbumAndChildrenNames(album);
  // Determine the new state: if any child is unselected, the new state is "selected" (true).
  // Otherwise, if all are selected, the new state is "unselected" (false).
  const newSelectionState = names.some(
    (name) => !albumsSelectedForSlideshow.value[name],
  );

  for (const name of names) {
    slideshow.toggleAlbumSelection(name, newSelectionState);
  }
};

/**
 * Starts a slideshow for a single album and all its sub-albums.
 * @param album - The album to start the slideshow for.
 */
const handleClickAlbum = (album: Album) => {
  const textures = collectTexturesRecursive(album);
  const albumWithAllTextures = { ...album, textures };
  slideshow.startIndividualAlbumSlideshow(albumWithAllTextures);
};

/**
 * Starts the global slideshow.
 */
const handleStartSlideshow = () => {
  slideshow.startSlideshow();
};

/**
 * Toggles the slideshow timer (play/pause).
 */
const handleToggleTimer = () => {
  slideshow.toggleSlideshowTimer();
};

/**
 * Opens the 'Manage Sources' modal.
 */
const openModal = () => {
  isSourcesModalVisible.value = true;
};
</script>

<style scoped>
/* Scoped styles from the original AlbumsList.vue */
.panel {
  background-color: var(--secondary-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);
}

.header-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.header-controls > * {
  flex-shrink: 0;
}

.timer-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.color-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.timer-controls label {
  color: var(--text-muted);
  font-weight: 700;
  font-size: 0.85rem;
}

.timer-input {
  background-color: var(--primary-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-color);
  font-weight: 500;
  width: 65px;
  padding: 0.4rem 0.5rem;
  text-align: center;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.timer-input:focus {
  outline: none;
  border-color: var(--accent-color);
  box-shadow: 0 0 0 2px var(--accent-color);
}

.checkbox-input {
  accent-color: var(--accent-color);
  width: 16px;
  height: 16px;
}

.color-picker {
  width: 40px;
  height: 30px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}

.albums-list-header {
  font-family: var(--body-font);
  text-transform: uppercase;
  font-size: 1.1rem;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  font-weight: 700;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 0.75rem;
}

.albums-list {
  list-style: none;
  padding: 0;
}

.progress-bar-container {
  height: 6px;
  background-color: var(--tertiary-bg);
  border-radius: 3px;
  margin-bottom: 1rem;
  overflow: hidden;
  width: 100%;
}

.progress-bar {
  height: 100%;
  background-color: var(--accent-color);
  border-radius: 3px;
  transition: width 0.05s linear;
}
</style>
