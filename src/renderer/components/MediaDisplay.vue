<template>
  <div
    class="w-full h-full flex flex-col justify-center items-center relative"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
  >
    <div class="flex justify-center items-center mb-2 mt-4 flex-shrink-0 z-10">
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

    <div
      class="media-display-area mb-3 grow w-full flex items-center justify-center relative"
    >
      <!-- Local Ambient Canvas Removed -->
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
        ref="videoElement"
        :src="mediaUrl"
        autoplay
        @error="handleMediaError"
        @ended="handleVideoEnded"
        @play="handleVideoPlay"
        @playing="handleVideoPlaying"
        @pause="handleVideoPause"
        @timeupdate="handleVideoTimeUpdate"
        @loadedmetadata="handleVideoLoadedMetadata"
      />
      <div
        v-if="!isVideoSupported && !isImage && !isTranscodingMode"
        class="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10 p-6 text-center"
      >
        <p class="text-xl font-bold text-red-400 mb-2">
          Video Format Not Supported
        </p>
        <p class="text-gray-300 mb-4">
          This video codec (likely HEVC) cannot be played natively.
        </p>
        <button
          class="glass-button px-6 py-3 flex items-center gap-2"
          @click="openInVlc"
        >
          <VlcIcon /> Open in VLC
        </button>
        <button
          v-if="!isTranscodingMode"
          class="glass-button px-6 py-3 flex items-center gap-2 mt-2"
          @click="() => tryTranscoding(0)"
        >
          Try Transcoding
        </button>
        <p v-if="isTranscodingLoading" class="text-accent mt-2 animate-pulse">
          Transcoding...
        </p>
      </div>
      <div
        v-if="isTranscodingLoading"
        class="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10 pointer-events-none"
      >
        <div
          class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent mb-4"
        ></div>
        <p class="text-white font-semibold">Transcoding...</p>
      </div>
      <div
        v-if="currentMediaItem && !isImage"
        data-testid="video-progress-bar"
        class="video-progress-bar-container cursor-pointer transition-transform-opacity duration-300 ease-in-out will-change-transform"
        :class="{ 'translate-y-full opacity-0': !isControlsVisible }"
        @click="handleProgressBarClick"
      >
        <div
          class="video-progress-bar"
          :style="{ width: `${videoProgress}%` }"
        ></div>
      </div>
      <div
        v-if="currentMediaItem && !isImage"
        class="absolute right-2 bottom-3 text-xs text-white font-mono bg-black/60 px-2 py-1 rounded pointer-events-none z-20 transition-transform-opacity duration-500 ease-in-out will-change-transform"
        :class="{ 'translate-y-20 opacity-0': !isControlsVisible }"
      >
        {{ formattedCurrentTime }} / {{ formattedDuration }}
      </div>
    </div>

    <div
      class="smart-timer-controls-media absolute top-4 right-4 flex flex-col gap-2 z-20 items-end transition-transform-opacity duration-500 ease-in-out will-change-transform"
      :class="{ '-translate-y-20 opacity-0': !isControlsVisible }"
    >
      <label class="glass-toggle" title="Play Full Video">
        <input v-model="playFullVideo" type="checkbox" />
        <span class="toggle-label">Play Full Video</span>
      </label>
      <label class="glass-toggle" title="Pause Timer on Play">
        <input v-model="pauseTimerOnPlay" type="checkbox" />
        <span class="toggle-label">Pause Timer on Play</span>
      </label>
    </div>

    <div
      class="floating-controls absolute bottom-8 left-1/2 transform -translate-x-1/2 flex justify-between items-center gap-6 z-20 transition-transform-opacity duration-500 ease-in-out will-change-transform"
      :class="{ 'translate-y-48 opacity-0': !isControlsVisible }"
    >
      <button
        :disabled="!canNavigate"
        class="nav-button glass-button"
        @click="handlePrevious"
      >
        ←
      </button>

      <div class="media-info text-center">
        <p
          class="text-lg font-bold drop-shadow-md text-white max-w-[300px] truncate"
          :title="currentMediaItem ? currentMediaItem.name : ''"
        >
          {{ currentMediaItem ? currentMediaItem.name : 'Select an album' }}
        </p>
        <p class="text-xs text-gray-300 drop-shadow-md">
          {{ countInfo }}
        </p>
      </div>

      <button
        :disabled="!canNavigate"
        class="nav-button glass-button"
        @click="handleNext"
      >
        →
      </button>

      <div
        v-if="!isImage && currentMediaItem"
        class="w-px h-8 bg-white/10 mx-2"
      ></div>

      <button
        v-if="!isImage && currentMediaItem"
        class="vlc-button glass-button-icon"
        title="Open with VLC"
        @click="openInVlc"
      >
        <VlcIcon />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file This component is responsible for displaying the current media item (image or video).
 * It handles loading the media from the main process, displaying loading/error states,
 * and providing navigation controls to move between media items.
 */
import { ref, computed, watch } from 'vue';
import { useAppState } from '../composables/useAppState';
import { useSlideshow } from '../composables/useSlideshow';
import VlcIcon from './icons/VlcIcon.vue';

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
  mainVideoElement,
} = useAppState();

const {
  navigateMedia,
  reapplyFilter,
  pauseSlideshowTimer,
  resumeSlideshowTimer,
} = useSlideshow();

/**
 * An array of available media filters.
 */
const filters: ('All' | 'Images' | 'Videos')[] = ['All', 'Images', 'Videos'];

/**
 * The URL of the media to be displayed (can be a Data URL or an HTTP URL).
 */
const mediaUrl = ref<string | null>(null);

/**
 * A flag indicating if the media is currently being loaded.
 */
const isLoading = ref(false);

/**
 * A string to hold any error message that occurs during media loading.
 */
const error = ref<string | null>(null);

/**
 * The current progress of video playback (0-100).
 */
const videoProgress = ref(0);

/**
 * Reference to the video element.
 */
const videoElement = ref<HTMLVideoElement | null>(null);
const isVideoSupported = ref(true);
const isTranscodingMode = ref(false);
const isTranscodingLoading = ref(false);
const transcodedDuration = ref(0);
const currentTranscodeStartTime = ref(0);
const currentVideoTime = ref(0);
const currentVideoDuration = ref(0);
const isControlsVisible = ref(true);
let controlsTimeout: NodeJS.Timeout | null = null;

/* Removed local ambient lighting logic */
/* const ambientCanvas = ref<HTMLCanvasElement | null>(null); */
/* updateAmbientLighting, startVideoAmbientLoop, etc. removed */

/**
 * Handles errors from the <img> or <video> elements.
 */

/**
 * A computed property that determines if the current media item is an image.
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
 */
const displayTitle = computed(() => {
  return isSlideshowActive.value
    ? 'Slideshow'
    : 'Select albums and start slideshow';
});

/**
 * A computed property that provides information about the current position in the slideshow.
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
  isVideoSupported.value = true;
  isTranscodingMode.value = false;
  isTranscodingLoading.value = false;
  transcodedDuration.value = 0;
  currentTranscodeStartTime.value = 0;
  currentVideoTime.value = 0;
  currentVideoDuration.value = 0;

  try {
    const result = await window.electronAPI.loadFileAsDataURL(
      currentMediaItem.value.path,
    );
    if (result.type === 'error') {
      error.value = result.message || 'Unknown error';
      mediaUrl.value = null;
    } else {
      mediaUrl.value = result.url || null;
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
 * @param filter - The filter to apply.
 */
const setFilter = async (filter: 'All' | 'Images' | 'Videos') => {
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
  (newItem) => {
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

// Sync video element with global state for ambient background
watch(videoElement, (el) => {
  mainVideoElement.value = el;
});

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
 * @param event - The timeupdate event from the <video> element.
 */
const handleVideoTimeUpdate = (event: Event) => {
  const target = event.target as HTMLVideoElement;
  const { currentTime, duration } = target;

  if (isTranscodingMode.value && transcodedDuration.value > 0) {
    // For transcoding, currentTime is relative to the segment start
    const realCurrentTime = currentTranscodeStartTime.value + currentTime;
    videoProgress.value = (realCurrentTime / transcodedDuration.value) * 100;
    currentVideoTime.value = realCurrentTime;
    currentVideoDuration.value = transcodedDuration.value;
  } else if (duration > 0 && duration !== Infinity) {
    videoProgress.value = (currentTime / duration) * 100;
    currentVideoTime.value = currentTime;
    currentVideoDuration.value = duration;
  } else {
    videoProgress.value = 0;
    currentVideoTime.value = 0;
    currentVideoDuration.value = 0;
  }
};

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const formattedCurrentTime = computed(() => formatTime(currentVideoTime.value));
const formattedDuration = computed(() =>
  formatTime(currentVideoDuration.value),
);

const handleProgressBarClick = (event: MouseEvent) => {
  if (!currentMediaItem.value) return;

  const container = event.currentTarget as HTMLElement;
  const rect = container.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const percentage = clickX / rect.width;

  if (isTranscodingMode.value) {
    if (transcodedDuration.value > 0) {
      const seekTime = percentage * transcodedDuration.value;
      tryTranscoding(seekTime);
    }
  } else if (videoElement.value && videoElement.value.duration) {
    videoElement.value.currentTime = percentage * videoElement.value.duration;
  }
};

const handleVideoLoadedMetadata = (event: Event) => {
  const video = event.target as HTMLVideoElement;
  // Check if video has valid dimensions. If 0, it's likely an unsupported codec (HEVC) playing audio only.
  if (
    (video.videoWidth === 0 || video.videoHeight === 0) &&
    !isTranscodingMode.value
  ) {
    isVideoSupported.value = false;
    // Auto-try transcoding if native playback fails
    tryTranscoding(0);
  }
};

const handleVideoPlaying = () => {
  isTranscodingLoading.value = false;
};

const tryTranscoding = async (startTime = 0) => {
  if (!currentMediaItem.value) return;
  isTranscodingMode.value = true;
  isTranscodingLoading.value = true;
  currentTranscodeStartTime.value = startTime;

  try {
    const port = await window.electronAPI.getServerPort();
    if (port > 0) {
      const encodedPath = encodeURIComponent(currentMediaItem.value.path);

      // Fetch duration if not already known
      if (transcodedDuration.value === 0) {
        try {
          const metaResponse = await fetch(
            `http://localhost:${port}/video/metadata?file=${encodedPath}`,
          );
          const meta = await metaResponse.json();
          if (meta.duration) {
            transcodedDuration.value = meta.duration;
          }
        } catch {
          // Failed to fetch metadata
        }
      }

      const transcodeUrl = `http://localhost:${port}/video/stream?file=${encodedPath}&startTime=${startTime}`;
      console.log('Transcoding URL:', transcodeUrl);

      // Update mediaUrl to point to the transcoding stream
      mediaUrl.value = transcodeUrl;

      // Reset flags to allow video element to try again
      isVideoSupported.value = true;

      // Wait for video to load
    } else {
      error.value = 'Local server not running';
      isTranscodingLoading.value = false;
    }
  } catch (e) {
    console.error('Transcoding failed', e);
    isTranscodingMode.value = false;
    isTranscodingLoading.value = false;
  }
};

/**
 * Opens the current media file in VLC Media Player.
 */
const openInVlc = async () => {
  if (!currentMediaItem.value) return;

  // Pause the current video
  if (videoElement.value) {
    videoElement.value.pause();
  }

  const result = await window.electronAPI.openInVlc(
    currentMediaItem.value.path,
  );
  if (!result.success) {
    error.value = result.message || 'Failed to open in VLC.';
  }
};

const handleMouseMove = () => {
  isControlsVisible.value = true;
  if (controlsTimeout) clearTimeout(controlsTimeout);
  controlsTimeout = setTimeout(() => {
    if (!videoElement.value?.paused) {
      isControlsVisible.value = false;
    }
  }, 3000);
};

const handleMouseLeave = () => {
  if (!videoElement.value?.paused) {
    isControlsVisible.value = false;
  }
};
</script>

<style scoped>
.media-display-area {
  /* Removed border and background for cleaner look */
  border: none;
  background-color: transparent;
  /* overflow: hidden; Removed to prevent clipping of sliding controls */
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.media-display-area video,
.media-display-area img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8); /* Deeper shadow */
}

.glass-button {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
}

.glass-button:hover {
  background: rgba(255, 255, 255, 0.2);
}

.floating-controls {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(16px);
  padding: 0.75rem 1.5rem;
  border-radius: 9999px; /* Pill shape */
  border: 1px solid rgba(255, 255, 255, 0.15);
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.floating-controls:hover {
  background: rgba(0, 0, 0, 0.8);
  /* Transform removed to keep it stable */
}

.vlc-button {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-color);
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.vlc-button:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: #ff9800; /* VLC Orange */
}

.glass-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.glass-toggle:hover {
  background: rgba(0, 0, 0, 0.6);
  color: var(--text-color);
  border-color: rgba(255, 255, 255, 0.3);
}

/* Active state for the toggle wrapper */
.glass-toggle:has(input:checked) {
  background: rgba(99, 102, 241, 0.2); /* Indigo tint */
  border-color: var(--accent-color);
  color: white;
  box-shadow: 0 0 15px rgba(99, 102, 241, 0.3);
}

.glass-toggle input {
  accent-color: var(--accent-color);
  width: 1.1em;
  height: 1.1em;
}

.glass-button-icon {
  padding: 0.5rem;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  transition: all 0.2s;
}

.glass-button-icon:hover {
  background: var(--accent-color);
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

.transition-transform-opacity {
  transition-property: transform, opacity;
}

.will-change-transform {
  will-change: transform, opacity;
}
</style>
