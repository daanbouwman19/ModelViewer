<template>
  <div
    class="w-full h-full flex flex-col justify-center items-center relative"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
  >
    <div
      class="flex flex-wrap justify-center items-center mb-2 mt-4 shrink-0 z-10 gap-4"
    >
      <h2
        class="text-lg md:text-xl font-semibold text-center album-title max-w-[85vw] md:max-w-none"
        :class="{ truncate: isSlideshowActive }"
      >
        {{ displayTitle }}
      </h2>
      <div class="filter-buttons flex flex-wrap justify-center gap-2">
        <button
          v-for="filter in filters"
          :key="filter"
          class="filter-button whitespace-nowrap text-sm md:text-base"
          :class="{ active: mediaFilter === filter }"
          :aria-pressed="mediaFilter === filter"
          @click="setFilter(filter)"
        >
          {{ filter }}
        </button>
      </div>
    </div>

    <div
      class="smart-timer-controls-media z-20 transition-transform-opacity duration-500 ease-in-out will-change-transform flex flex-row justify-center gap-4 w-full mb-2 md:absolute md:top-4 md:right-4 md:flex-col md:gap-2 md:w-auto md:items-end md:mb-0"
      :class="{ 'opacity-0 md:-translate-y-20': !isControlsVisible }"
    >
      <label class="glass-toggle" title="Play Full Video">
        <input v-model="playFullVideo" type="checkbox" />
        <span class="toggle-label text-xs md:text-sm">Play Full Video</span>
      </label>
      <label class="glass-toggle" title="Pause Timer on Play">
        <input v-model="pauseTimerOnPlay" type="checkbox" />
        <span class="toggle-label text-xs md:text-sm">Pause Timer on Play</span>
      </label>
    </div>

    <div
      class="media-display-area mb-3 grow w-full flex items-center justify-center relative"
    >
      <!-- State Handling: Mutually Exclusive Blocks -->

      <!-- 1. Loading / Transcoding / Buffering Overlay -->
      <TranscodingStatus
        :is-loading="isLoading"
        :is-transcoding-loading="isTranscodingLoading"
        :is-buffering="isBuffering"
        :transcoded-duration="transcodedDuration"
        :current-transcode-start-time="currentTranscodeStartTime"
      />

      <!-- 2. Placeholder (No Item & Not Loading) -->
      <p
        v-if="!currentMediaItem && !isLoading"
        class="text-gray-500 placeholder"
      >
        Media will appear here.
      </p>

      <!-- 3. Error Message (Only if not loading) -->
      <p
        v-else-if="error"
        class="text-red-400 placeholder z-10 text-center px-4"
      >
        {{ error }}
      </p>

      <!-- 4. Unsupported Format Message (Only if not loading/transcoding) -->
      <div
        v-else-if="!isVideoSupported && !isImage && !isTranscodingMode"
        class="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10 p-6 text-center"
      >
        <p class="text-lg md:text-xl font-bold text-red-400 mb-2">
          Video Format Not Supported
        </p>
        <p class="text-gray-300 mb-4 text-sm md:text-base">
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
      </div>

      <!-- 5. Media Content -->
      <template v-else>
        <img
          v-if="currentMediaItem && mediaUrl && isImage"
          :src="mediaUrl"
          :alt="currentMediaItem.name"
          @error="handleMediaError"
        />
        <VideoPlayer
          v-if="currentMediaItem && mediaUrl && !isImage"
          ref="videoPlayerRef"
          :src="mediaUrl"
          :is-transcoding-mode="isTranscodingMode"
          :is-controls-visible="isControlsVisible"
          :transcoded-duration="transcodedDuration"
          :current-transcode-start-time="currentTranscodeStartTime"
          :is-transcoding-loading="isTranscodingLoading"
          :is-buffering="isBuffering"
          @play="handleVideoPlay"
          @pause="handleVideoPause"
          @ended="handleVideoEnded"
          @error="handleMediaError"
          @trigger-transcode="tryTranscoding"
          @buffering="handleBuffering"
          @playing="handleVideoPlaying"
          @update:video-element="handleVideoElementUpdate"
        />
      </template>
    </div>

    <!-- Media Controls -->
    <MediaControls
      class="floating-controls"
      :current-media-item="currentMediaItem"
      :is-playing="isPlaying"
      :can-navigate="canNavigate"
      :is-controls-visible="isControlsVisible"
      :is-image="isImage"
      :count-info="countInfo"
      @previous="handlePrevious"
      @next="handleNext"
      @toggle-play="togglePlay"
      @open-in-vlc="openInVlc"
      @set-rating="setRating"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @file This component is responsible for displaying the current media item (image or video).
 * It handles loading the media from the main process, displaying loading/error states,
 * and providing navigation controls to move between media items.
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useAppState } from '../composables/useAppState';
import { useSlideshow } from '../composables/useSlideshow';
import { api } from '../api';
import VlcIcon from './icons/VlcIcon.vue';
import TranscodingStatus from './TranscodingStatus.vue';
import MediaControls from './MediaControls.vue';
import VideoPlayer from './VideoPlayer.vue';
import {
  LEGACY_VIDEO_EXTENSIONS,
  MEDIA_FILTERS,
  type MediaFilter,
} from '../../core/constants';

const {
  currentMediaItem,
  displayedMediaFiles,
  currentMediaIndex,
  isSlideshowActive,
  mediaFilter,
  totalMediaInPool,
  imageExtensionsSet,
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
const filters = MEDIA_FILTERS;

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
 * Reference to the video element.
 */
const videoElement = ref<HTMLVideoElement | null>(null);
const videoPlayerRef = ref<InstanceType<typeof VideoPlayer> | null>(null);

const isVideoSupported = ref(true);
const isTranscodingMode = ref(false);
const isTranscodingLoading = ref(false);
const isBuffering = ref(false);
const transcodedDuration = ref(0);
const currentTranscodeStartTime = ref(0);

const isControlsVisible = ref(true);
const isPlaying = ref(false);
const currentVideoTime = computed({
  get: () => videoPlayerRef.value?.currentVideoTime ?? 0,
  set: (val) => {
    if (videoPlayerRef.value) {
      videoPlayerRef.value.currentVideoTime = val;
    }
  },
});
let controlsTimeout: NodeJS.Timeout | null = null;
const videoStreamUrlGenerator = ref<
  ((filePath: string, startTime?: number) => string) | null
>(null);

// Request tracking to prevent race conditions
let currentLoadRequestId = 0;

let videoStreamGeneratorInitPromise: Promise<
  (filePath: string, startTime?: number) => string
> | null = null;

const ensureVideoStreamGenerator = async (): Promise<
  (filePath: string, startTime?: number) => string
> => {
  if (videoStreamUrlGenerator.value) {
    return videoStreamUrlGenerator.value;
  }

  if (!videoStreamGeneratorInitPromise) {
    videoStreamGeneratorInitPromise = api
      .getVideoStreamUrlGenerator()
      .then((generator) => {
        videoStreamUrlGenerator.value = generator;
        return generator;
      })
      .catch((error) => {
        console.error('Failed to initialize video stream generator', error);
        videoStreamGeneratorInitPromise = null;
        throw error;
      });
  }

  return videoStreamGeneratorInitPromise;
};

onMounted(() => {
  ensureVideoStreamGenerator().catch(() => {
    // Already logged in ensureVideoStreamGenerator
  });
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
});

/**
 * A computed property that determines if the current media item is an image.
 */
const isImage = computed(() => {
  if (!currentMediaItem.value) return false;

  // For Google Drive (or paths without extension), rely on the name
  const sourceString = currentMediaItem.value.path.startsWith('gdrive://')
    ? currentMediaItem.value.name
    : currentMediaItem.value.path;

  const lastDotIndex = sourceString.lastIndexOf('.');
  if (lastDotIndex === -1) return false; // No extension found

  const ext = sourceString.slice(lastDotIndex).toLowerCase();
  return imageExtensionsSet.value.has(ext);
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
  return `${currentInHistory} / ${total}`;
});

/**
 * A computed property that determines if media navigation is possible.
 */
const canNavigate = computed(() => {
  return displayedMediaFiles.value.length > 0;
});

/**
 * Attempts to transcode the current video file starting from a specific time.
 * @param startTime - The time to start transcoding from (in seconds).
 * @param requestId - The request ID associated with this operation (optional).
 */
const tryTranscoding = async (startTime = 0, requestId?: number) => {
  // If no specific requestId was passed, assume this is a user action and we should respect the current one,
  // OR it's a new "intent" (like a button click) which conceptually updates the state of the *current* item.
  // Ideally, button clicks on the *same* item shouldn't increment request ID, but loadMediaUrl does.
  // So we just check against currentLoadRequestId.

  if (!currentMediaItem.value) return;

  const effectiveRequestId =
    requestId !== undefined ? requestId : currentLoadRequestId;

  // Guard: If we are running part of an old request sequence, stop.
  if (effectiveRequestId !== currentLoadRequestId) return;

  isTranscodingMode.value = true;
  isTranscodingLoading.value = true;
  // Don't clear error globally here, as we might be recovering from one.
  // But usually starting a new attempt clears old errors.
  error.value = null;

  currentTranscodeStartTime.value = startTime;

  try {
    const generator = await ensureVideoStreamGenerator();
    if (effectiveRequestId !== currentLoadRequestId) return;

    const encodedPath = currentMediaItem.value.path;

    // Fetch duration if not already known
    if (transcodedDuration.value === 0) {
      try {
        const meta = await api.getVideoMetadata(encodedPath);
        if (meta.duration) {
          transcodedDuration.value = meta.duration;
        }
      } catch {
        // Failed to fetch metadata
      }
    }
    if (effectiveRequestId !== currentLoadRequestId) return;

    let transcodeUrl = generator(encodedPath, startTime);

    if (transcodeUrl.includes('?')) {
      transcodeUrl += '&transcode=true';
    } else {
      transcodeUrl += '?transcode=true';
    }

    console.log('Transcoding URL:', transcodeUrl);
    mediaUrl.value = transcodeUrl;

    isVideoSupported.value = true;
  } catch (e) {
    if (effectiveRequestId !== currentLoadRequestId) return;

    console.error('Transcoding failed', e);
    isTranscodingMode.value = false;
    isTranscodingLoading.value = false;
    if (!error.value) {
      error.value = 'Local server not available';
    }
  }
};

/**
 * Asynchronously loads the URL for the current media item.
 */
const loadMediaUrl = async () => {
  // Increment ID to invalidate any pending requests
  currentLoadRequestId++;
  const requestId = currentLoadRequestId;

  if (!currentMediaItem.value) {
    mediaUrl.value = null;
    return;
  }

  isLoading.value = true;

  // Reset all state flags for the new item
  error.value = null;
  isVideoSupported.value = true;
  isTranscodingMode.value = false;
  isTranscodingLoading.value = false;
  isBuffering.value = false;
  transcodedDuration.value = 0;
  currentTranscodeStartTime.value = 0;

  // Cleanup previous video stream explicitly to prevent pending requests
  if (videoPlayerRef.value) {
    videoPlayerRef.value.reset();
  } else if (videoElement.value) {
    // Fallback if ref is not ready but element is lingering
    videoElement.value.pause();
    videoElement.value.removeAttribute('src');
    videoElement.value.load();
  }

  // Proactively transcode formats that often fail in browsers or have poor performance (e.g. MOOV at end)
  const fileName = currentMediaItem.value.name
    ? currentMediaItem.value.name.toLowerCase()
    : '';

  if (LEGACY_VIDEO_EXTENSIONS.some((ext) => fileName.endsWith(ext))) {
    console.log('Proactively transcoding legacy format:', fileName);
    await tryTranscoding(0, requestId);

    // Only turn off loading if this request is still active
    if (requestId === currentLoadRequestId) {
      isLoading.value = false;
    }
    return;
  }

  try {
    const result = await api.loadFileAsDataURL(currentMediaItem.value.path);

    if (requestId !== currentLoadRequestId) return;

    if (result.type === 'error') {
      error.value = result.message || 'Unknown error';
      mediaUrl.value = null;
    } else {
      mediaUrl.value = result.url || null;
    }
  } catch (err) {
    if (requestId !== currentLoadRequestId) return;

    console.error('Error loading media:', err);
    error.value = 'Failed to load media file.';
    mediaUrl.value = null;
  } finally {
    if (requestId === currentLoadRequestId) {
      isLoading.value = false;
    }
  }
};

/**
 * Toggles video playback.
 */
const togglePlay = () => {
  if (videoPlayerRef.value) {
    videoPlayerRef.value.togglePlay();
  }
};

const handleGlobalKeydown = (event: KeyboardEvent) => {
  if (event.code === 'Space') {
    event.preventDefault(); // Prevent scrolling
    togglePlay();
  }
};

/**
 * Handles errors from the <img> or <video> elements.
 */
const handleMediaError = () => {
  if (!isTranscodingMode.value) {
    console.log('Media playback error, attempting auto-transcode...');
    tryTranscoding(0); // Uses currentLoadRequestId implicitly
  } else {
    error.value = 'Failed to display media file.';
  }
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
const setFilter = async (filter: MediaFilter) => {
  mediaFilter.value = filter;
  await reapplyFilter();
};

const setRating = async (rating: number) => {
  if (!currentMediaItem.value) return;

  const newRating = currentMediaItem.value.rating === rating ? 0 : rating;
  currentMediaItem.value.rating = newRating;

  try {
    await api.setRating(currentMediaItem.value.path, newRating);
  } catch (e) {
    console.error('Failed to set rating', e);
  }
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
const handleVideoElementUpdate = (el: HTMLVideoElement | null) => {
  videoElement.value = el;
};
watch(videoElement, (el) => {
  mainVideoElement.value = el;
});

/**
 * Handles the end of video playback.
 */
const handleVideoEnded = () => {
  if (playFullVideo.value) {
    navigateMedia(1);
  }
};

/**
 * Handles the video play event.
 */
const handleVideoPlay = () => {
  if (isTimerRunning.value && (playFullVideo.value || pauseTimerOnPlay.value)) {
    pauseSlideshowTimer();
  }
  isPlaying.value = true;
};

/**
 * Handles the video pause event.
 */
const handleVideoPause = () => {
  if (!isTimerRunning.value && pauseTimerOnPlay.value && !playFullVideo.value) {
    resumeSlideshowTimer();
  }
  isPlaying.value = false;
};

/**
 * Handles the playing event to clear the loading state.
 */
const handleVideoPlaying = () => {
  isTranscodingLoading.value = false;
  isBuffering.value = false;
};

const handleBuffering = (buffering: boolean) => {
  if (buffering) {
    if (!isTranscodingLoading.value) {
      isBuffering.value = true;
    }
  } else {
    isBuffering.value = false;
  }
};

/**
 * Opens the current media file in VLC Media Player.
 */
const openInVlc = async () => {
  if (!currentMediaItem.value) return;

  if (videoElement.value) {
    videoElement.value.pause();
  }

  const result = await api.openInVlc(currentMediaItem.value.path);
  if (!result.success) {
    error.value = result.message || 'Failed to open in VLC.';
  }
};

/**
 * Shows controls on mouse move and hides them after a timeout.
 */
const handleMouseMove = () => {
  isControlsVisible.value = true;
  if (controlsTimeout) clearTimeout(controlsTimeout);
  controlsTimeout = setTimeout(() => {
    // Only hide if video is playing (not paused)
    if (!videoElement.value?.paused) {
      isControlsVisible.value = false;
    }
  }, 3000);
};

/**
 * Hides controls immediately when the mouse leaves the container.
 */
const handleMouseLeave = () => {
  if (!videoElement.value?.paused) {
    isControlsVisible.value = false;
  }
};
defineExpose({
  isTranscodingMode,
  isTranscodingLoading,
  transcodedDuration,
  currentVideoTime,
  currentTranscodeStartTime,
  isBuffering,
  videoElement,
  videoStreamUrlGenerator,
  tryTranscoding,
  togglePlay,
});
</script>

<style scoped>
.media-display-area {
  border: none;
  background-color: transparent;
  width: 100%;
  min-height: 0;
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
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
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

.glass-toggle:has(input:checked) {
  background: rgba(99, 102, 241, 0.2);
  border-color: var(--accent-color);
  color: white;
  box-shadow: 0 0 15px rgba(99, 102, 241, 0.3);
}

.glass-toggle input {
  accent-color: var(--accent-color);
  width: 1.1em;
  height: 1.1em;
}

.transition-transform-opacity {
  transition-property: transform, opacity;
}

.will-change-transform {
  will-change: transform, opacity;
}
</style>
