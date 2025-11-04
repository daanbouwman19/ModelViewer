<template>
  <div
    class="w-full md:w-1/3 bg-gray-800 shadow-lg rounded-lg p-4 flex flex-col overflow-y-auto panel"
  >
    <div class="header-controls">
      <button @click="handleStartSlideshow" class="action-button">
        Start Slideshow
      </button>
      <div class="timer-controls">
        <label for="timer-duration">Timer (s):</label>
        <input
          type="number"
          id="timer-duration"
          v-model.number="timerDuration"
          min="1"
          class="timer-input"
        />
        <button @click="handleToggleTimer" class="timer-button">
          {{ isTimerRunning ? 'Pause' : 'Play' }}
        </button>
      </div>
      <button @click="openModal" class="action-button">Manage Sources</button>
    </div>
    <div class="smart-timer-controls">
      <label class="checkbox-container">
        <input type="checkbox" v-model="playFullVideo" />
        <span class="checkmark"></span>
        Play Full Video
      </label>
      <label class="checkbox-container">
        <input
          type="checkbox"
          v-model="pauseTimerOnPlay"
          :disabled="playFullVideo"
        />
        <span class="checkmark"></span>
        Pause Timer on Play
      </label>
    </div>

    <h2 class="albums-list-header">Albums</h2>
    <ul class="space-y-1 flex-grow pr-2 albums-list">
      <li v-if="allAlbums.length === 0" class="text-gray-400">
        Loading albums...
      </li>
      <li
        v-for="album in allAlbums"
        :key="album.name"
        class="album-item"
        :class="{
          'selected-for-slideshow': albumsSelectedForSlideshow[album.name],
        }"
        @click="handleClickAlbum(album)"
      >
        <div class="album-controls" @click.stop>
          <label class="checkbox-container">
            <input
              type="checkbox"
              :checked="!!albumsSelectedForSlideshow[album.name]"
              @change="handleToggleSelection(album.name)"
            />
            <span class="checkmark"></span>
          </label>
        </div>
        <span class="album-name-clickable">
          {{ album.name }} ({{ album.textures.length }})
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup>
/**
 * @file This component displays the list of all available media albums.
 * It provides controls for starting a global slideshow, managing the timer,
 * opening the sources modal, and selecting/deselecting albums for the slideshow.
 * Clicking on an album's name starts a slideshow for that specific album.
 */
import { useAppState } from '../composables/useAppState';
import { useSlideshow } from '../composables/useSlideshow';

const {
  allAlbums,
  albumsSelectedForSlideshow,
  timerDuration,
  isTimerRunning,
  isSourcesModalVisible,
  playFullVideo,
  pauseTimerOnPlay,
} = useAppState();

const {
  toggleAlbumSelection,
  startSlideshow,
  startIndividualAlbumSlideshow,
  toggleSlideshowTimer,
} = useSlideshow();

/**
 * Toggles the selection of an album for the global slideshow.
 * @param {string} albumName - The name of the album to toggle.
 */
const handleToggleSelection = (albumName) => {
  toggleAlbumSelection(albumName);
};

/**
 * Starts the global slideshow with all selected albums.
 */
const handleStartSlideshow = () => {
  startSlideshow();
};

/**
 * Starts a slideshow for a single, specific album.
 * @param {import('../../main/media-scanner.js').Album} album - The album to start the slideshow for.
 */
const handleClickAlbum = (album) => {
  startIndividualAlbumSlideshow(album);
};

/**
 * Toggles the slideshow timer (play/pause).
 */
const handleToggleTimer = () => {
  toggleSlideshowTimer();
};

/**
 * Opens the 'Manage Sources' modal.
 */
const openModal = () => {
  isSourcesModalVisible.value = true;
};
</script>

<style scoped>
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

.smart-timer-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
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

.album-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 15px;
  border-radius: 12px;
  transition: all 0.3s ease;
  border: 2px solid transparent;
  margin-bottom: 8px;
  cursor: pointer;
}

.album-item:hover {
  background-color: rgba(255, 182, 193, 0.1);
  border-color: #ffb6c1;
  transform: translateX(3px);
  box-shadow: 0 4px 12px rgba(255, 182, 193, 0.2);
}

.album-item.selected-for-slideshow {
  background-color: rgba(255, 192, 203, 0.15);
  border-color: #ffb6c1;
}

.album-name-clickable {
  flex-grow: 1;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-color);
  transition: color 0.2s ease;
  pointer-events: none; /* Let the parent handle clicks */
}

.album-item:hover .album-name-clickable {
  color: #ff69b4;
}

.album-controls {
  display: flex;
  align-items: center;
}

/* Custom checkbox styling */
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
  width: 24px;
  height: 24px;
  background: linear-gradient(135deg, #ffeef8 0%, #ffe0f0 100%);
  border: 2px solid #ffb6c1;
  border-radius: 8px;
  transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  box-shadow: 0 2px 6px rgba(255, 105, 180, 0.15);
}

.checkbox-container:hover .checkmark {
  border-color: #ff69b4;
  box-shadow: 0 4px 12px rgba(255, 105, 180, 0.3);
  transform: scale(1.1);
}

.checkbox-container input[type='checkbox']:checked ~ .checkmark {
  background: linear-gradient(135deg, #ff69b4 0%, #ff1493 100%);
  border-color: #ff1493;
  box-shadow: 0 4px 16px rgba(255, 20, 147, 0.4);
}

.checkmark::after {
  content: '';
  position: absolute;
  display: none;
  left: 7px;
  top: 3px;
  width: 6px;
  height: 11px;
  border: solid white;
  border-width: 0 3px 3px 0;
  transform: rotate(45deg);
}

.checkbox-container input[type='checkbox']:checked ~ .checkmark::after {
  display: block;
  animation: checkmark-pop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes checkmark-pop {
  0% {
    transform: rotate(45deg) scale(0);
  }
  50% {
    transform: rotate(45deg) scale(1.2);
  }
  100% {
    transform: rotate(45deg) scale(1);
  }
}
</style>
