<template>
  <div
    class="w-full md:w-2/3 bg-gray-800 shadow-lg rounded-lg p-4 flex flex-col panel"
  >
    <div class="flex justify-center items-center mb-2">
      <h2 class="text-xl font-semibold text-center album-title">
        {{ displayTitle }}
      </h2>
      <div class="ml-4 filter-buttons">
        <button
          v-for="filter in filters"
          :key="filter"
          class="filter-button"
          :class="{ active: mediaFilter === filter }"
          @click="setFilter(filter)"
        >
          {{ filter }}
        </button>
      </div>
    </div>

    <div class="media-display-area mb-3">
      <p
        v-if="!currentMediaItem && !isLoading"
        class="text-gray-500 placeholder"
      >
        Media will appear here.
      </p>
      <p v-if="isLoading" class="text-gray-400 placeholder">Loading media...</p>
      <p v-if="error" class="text-red-400 placeholder">
        {{ error }}
      </p>
      <img
        v-if="currentMediaItem && mediaUrl && isImage"
        :src="mediaUrl"
        :alt="currentMediaItem.name"
        @error="handleMediaError"
      />
      <video
        v-if="currentMediaItem && mediaUrl && !isImage"
        :src="mediaUrl"
        controls
        autoplay
        @error="handleMediaError"
        @ended="handleVideoEnded"
        @play="handleVideoPlay"
        @pause="handleVideoPause"
        @timeupdate="handleVideoTimeUpdate"
      />
      <div
        v-if="currentMediaItem && !isImage"
        class="video-progress-bar-container"
        data-testid="video-progress-bar"
      >
        <div
          class="video-progress-bar"
          :style="{ width: `${videoProgress}%` }"
        ></div>
      </div>
    </div>

    <div class="text-center mb-3 media-info">
      <p class="text-sm text-gray-400">
        {{ currentMediaItem ? currentMediaItem.name : '\u00A0' }}
      </p>
      <p class="text-sm text-gray-300">
        {{ countInfo }}
      </p>
    </div>

    <div class="smart-timer-controls-media">
      <label class="checkbox-container">
        <input type="checkbox" v-model="playFullVideo" />
        <span class="checkmark"></span>
        Play Full Video
      </label>
      <label class="checkbox-container">
        <input type="checkbox" v-model="pauseTimerOnPlay" />
        <span class="checkmark"></span>
        Pause Timer on Play
      </label>
    </div>

    <div
      class="flex justify-between items-center mt-auto pt-2 border-t border-gray-700"
    >
      <button
        @click="handlePrevious"
        :disabled="!canNavigate"
        class="nav-button"
      >
        Previous (←)
      </button>
      <button @click="handleNext" :disabled="!canNavigate" class="nav-button">
        Next (→)
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * @file This component is responsible for displaying the current media item (image or video).
 * It handles loading the media from the main process, displaying loading/error states,
 * and providing navigation controls to move between media items.
 */
import { ref, computed, watch } from 'vue';
import { useAppState } from '../composables/useAppState';
import { useSlideshow } from '../composables/useSlideshow';

const {
  currentMediaItem,
  displayedMediaFiles,
  currentMediaIndex,
  isSlideshowActive,
  mediaFilter,
  totalMediaInPool,
  supportedExtensions,
  playFullVideo,
  pauseTimerOnPlay,
  isTimerRunning,
  viewMode,
} = useAppState();

const {
  navigateMedia,
  reapplyFilter,
  pauseSlideshowTimer,
  resumeSlideshowTimer,
} = useSlideshow();

/**
 * An array of available media filters.
 * @type {string[]}
 */
const filters = ['All', 'Images', 'Videos'];

/**
 * The URL of the media to be displayed (can be a Data URL or an HTTP URL).
 * @type {import('vue').Ref<string | null>}
 */
const mediaUrl = ref(null);

/**
 * A flag indicating if the media is currently being loaded.
 * @type {import('vue').Ref<boolean>}
 */
const isLoading = ref(false);

/**
 * A string to hold any error message that occurs during media loading.
 * @type {import('vue').Ref<string | null>}
 */
const error = ref(null);

/**
 * The current progress of video playback (0-100).
 * @type {import('vue').Ref<number>}
 */
const videoProgress = ref(0);

/**
 * A computed property that determines if the current media item is an image.
 * @type {import('vue').ComputedRef<boolean>}
 */
const isImage = computed(() => {
  if (!currentMediaItem.value) return false;
  const imageExtensions = supportedExtensions.value.images;
  const ext = currentMediaItem.value.path
    .slice(currentMediaItem.value.path.lastIndexOf('.'))
    .toLowerCase();
  return imageExtensions.includes(ext);
});

/**
 * A computed property for the title displayed above the media.
 * @type {import('vue').ComputedRef<string>}
 */
const displayTitle = computed(() => {
  return isSlideshowActive.value
    ? 'Slideshow'
    : 'Select albums and start slideshow';
});

/**
 * A computed property that provides information about the current position in the slideshow.
 * @type {import('vue').ComputedRef<string>}
 */
const countInfo = computed(() => {
  if (!isSlideshowActive.value || displayedMediaFiles.value.length === 0) {
    return '\u00A0'; // Non-breaking space
  }
  const currentInHistory = currentMediaIndex.value + 1;
  const historyLength = displayedMediaFiles.value.length;
  const total = totalMediaInPool.value || historyLength;
  return `${currentInHistory} / ${total} (viewed ${historyLength})`;
});

/**
 * A computed property that determines if media navigation is possible.
 * @type {import('vue').ComputedRef<boolean>}
 */
const canNavigate = computed(() => {
  return displayedMediaFiles.value.length > 0;
});

/**
 * Asynchronously loads the URL for the current media item.
 */
const loadMediaUrl = async () => {
  if (!currentMediaItem.value) {
    mediaUrl.value = null;
    return;
  }

  isLoading.value = true;
  error.value = null;

  try {
    const result = await window.electronAPI.loadFileAsDataURL(
      currentMediaItem.value.path,
    );
    if (result.type === 'error') {
      error.value = result.message;
      mediaUrl.value = null;
    } else {
      mediaUrl.value = result.url;
    }
  } catch (err) {
    console.error('Error loading media:', err);
    error.value = 'Failed to load media file.';
    mediaUrl.value = null;
  } finally {
    isLoading.value = false;
  }
};

/**
 * Handles errors from the <img> or <video> elements.
 */
const handleMediaError = () => {
  error.value = 'Failed to display media file.';
};

/**
 * Navigates to the previous media item.
 */
const handlePrevious = () => {
  navigateMedia(-1);
};

/**
 * Navigates to the next media item.
 */
const handleNext = () => {
  navigateMedia(1);
};

/**
 * Sets the media filter and triggers a re-filter of the slideshow.
 * @param {'All' | 'Images' | 'Videos'} filter - The filter to apply.
 */
const setFilter = async (filter) => {
  mediaFilter.value = filter;
  await reapplyFilter();
};

// Watch for changes to the currentMediaItem and trigger a load.
watch(playFullVideo, (newValue) => {
  if (newValue) {
    pauseTimerOnPlay.value = false;
  }
});

watch(pauseTimerOnPlay, (newValue) => {
  if (newValue) {
    playFullVideo.value = false;
  }
});

watch(
  currentMediaItem,
  (newItem, oldItem) => {
    loadMediaUrl();
    if (
      newItem &&
      isImage.value &&
      playFullVideo.value &&
      !isTimerRunning.value
    ) {
      resumeSlideshowTimer();
    }
  },
  { immediate: true },
);

const handleVideoEnded = () => {
  if (playFullVideo.value) {
    navigateMedia(1);
  }
};

const handleVideoPlay = () => {
  if (isTimerRunning.value && (playFullVideo.value || pauseTimerOnPlay.value)) {
    pauseSlideshowTimer();
  }
};

const handleVideoPause = () => {
  if (!isTimerRunning.value && pauseTimerOnPlay.value && !playFullVideo.value) {
    resumeSlideshowTimer();
  }
};

/**
 * Updates the video progress bar based on the video's current time and duration.
 * @param {Event} event - The timeupdate event from the <video> element.
 */
const handleVideoTimeUpdate = (event) => {
  const { currentTime, duration } = event.target;
  if (duration > 0) {
    videoProgress.value = (currentTime / duration) * 100;
  } else {
    videoProgress.value = 0;
  }
};
</script>

<style scoped>
.panel {
  background-color: var(--secondary-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);
}

.filter-buttons {
  display: flex;
  gap: 4px;
}

.media-display-area {
  border: 2px dashed var(--tertiary-bg);
  border-radius: 10px;
  flex-grow: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  padding: 0;
  background-color: var(--primary-bg);
}

.placeholder {
  color: var(--text-muted);
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 1rem;
}

.media-display-area video,
.media-display-area img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
  border-radius: 8px;
}

.media-info p {
  margin: 0.25rem 0;
}

.smart-timer-controls-media {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.smart-timer-controls-media label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
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

.video-progress-bar-container {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 8px;
  background-color: rgba(0, 0, 0, 0.3);
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
  overflow: hidden;
}

.video-progress-bar {
  height: 100%;
  background-color: var(--accent-color);
  transition: width 0.1s linear;
}
</style>
