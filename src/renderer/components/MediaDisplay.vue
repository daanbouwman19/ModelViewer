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
      :class="!isControlsVisible ? 'opacity-0 md:-translate-y-20' : ''"
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

      <!-- 1. Placeholder (No Item & Not Loading) -->
      <p
        v-if="!currentMediaItem && !isLoading"
        class="text-gray-500 placeholder"
      >
        Media will appear here.
      </p>

      <!-- 2. Loading / Transcoding / Buffering Overlay -->
      <div
        v-if="isLoading || isTranscodingLoading || isBuffering"
        class="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20 pointer-events-none"
      >
        <div
          class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent mb-4"
        ></div>
        <p class="text-white font-semibold">
          <template v-if="isTranscodingLoading">Transcoding...</template>
          <template v-else-if="isBuffering">Buffering...</template>
          <template v-else>Loading media...</template>
        </p>
      </div>

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
          @waiting="handleVideoWaiting"
          @canplay="handleVideoCanPlay"
          @progress="handleVideoProgress"
        />
      </template>

      <!-- Controls (always available if item exists) -->
      <div
        v-if="currentMediaItem && !isImage"
        data-testid="video-progress-bar"
        class="video-progress-bar-container cursor-pointer transition-transform-opacity duration-300 ease-in-out will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        :class="{ 'translate-y-full opacity-0': !isControlsVisible }"
        role="slider"
        tabindex="0"
        aria-label="Seek video"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="videoProgress"
        @click="handleProgressBarClick"
        @keydown="handleProgressBarKeydown"
      >
        <!-- Buffered Ranges -->
        <div
          v-for="(range, index) in bufferedRanges"
          :key="index"
          class="absolute h-full bg-white/30 rounded-full pointer-events-none transition-all duration-300"
          :style="{
            left: `${range.start}%`,
            width: `${range.end - range.start}%`,
          }"
        ></div>
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
      class="floating-controls absolute bottom-4 md:bottom-8 left-1/2 transform -translate-x-1/2 flex justify-between items-center gap-4 md:gap-6 z-20 transition-transform-opacity duration-500 ease-in-out will-change-transform w-[90%] md:w-auto"
      :class="{ 'translate-y-48 opacity-0': !isControlsVisible }"
    >
      <button
        :disabled="!canNavigate"
        class="nav-button glass-button"
        aria-label="Previous media"
        @click="handlePrevious"
      >
        ←
      </button>

      <div class="media-info text-center">
        <p
          class="text-lg font-bold drop-shadow-md text-white max-w-75 truncate"
          :title="currentMediaItem ? currentMediaItem.name : ''"
        >
          {{ currentMediaItem ? currentMediaItem.name : 'Select an album' }}
        </p>

        <!-- Rating Controls -->
        <div v-if="currentMediaItem" class="flex justify-center gap-1 my-1">
          <button
            v-for="star in 5"
            :key="star"
            class="focus:outline-none transition-transform hover:scale-110"
            :aria-label="'Rate ' + star + ' star' + (star > 1 ? 's' : '')"
            @click.stop="setRating(star)"
          >
            <StarIcon
              class="w-5 h-5 transition-colors"
              :class="
                (currentMediaItem.rating || 0) >= star
                  ? 'text-yellow-400 drop-shadow-md'
                  : 'text-gray-500 hover:text-yellow-200'
              "
            />
          </button>
        </div>

        <p
          v-if="currentMediaItem"
          class="text-xs text-gray-400 mb-1 drop-shadow-md"
        >
          Views: {{ currentMediaItem.viewCount || 0 }}
          <span v-if="currentMediaItem.lastViewed">
            • Last:
            {{ new Date(currentMediaItem.lastViewed).toLocaleDateString() }}
          </span>
        </p>

        <p v-if="currentMediaItem" class="text-xs text-gray-300 drop-shadow-md">
          {{ countInfo }}
        </p>
      </div>

      <button
        :disabled="!canNavigate"
        class="nav-button glass-button"
        aria-label="Next media"
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
        title="Open in VLC"
        aria-label="Open in VLC"
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
import { ref, computed, watch, onMounted } from 'vue';
import { useAppState } from '../composables/useAppState';
import { useSlideshow } from '../composables/useSlideshow';
import { api } from '../api';
import VlcIcon from './icons/VlcIcon.vue';
import StarIcon from './icons/StarIcon.vue';

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
const isBuffering = ref(false);
const bufferedRanges = ref<{ start: number; end: number }[]>([]);
const transcodedDuration = ref(0);
const currentTranscodeStartTime = ref(0);
const currentVideoTime = ref(0);
const currentVideoDuration = ref(0);
const isControlsVisible = ref(true);
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
});

/**
 * A computed property that determines if the current media item is an image.
 */
const isImage = computed(() => {
  if (!currentMediaItem.value) return false;
  const imageExtensions = supportedExtensions.value.images;

  // For Google Drive (or paths without extension), rely on the name
  const sourceString = currentMediaItem.value.path.startsWith('gdrive://')
    ? currentMediaItem.value.name
    : currentMediaItem.value.path;

  const lastDotIndex = sourceString.lastIndexOf('.');
  if (lastDotIndex === -1) return false; // No extension found

  const ext = sourceString.slice(lastDotIndex).toLowerCase();
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
  bufferedRanges.value = [];
  transcodedDuration.value = 0;
  currentTranscodeStartTime.value = 0;
  currentVideoTime.value = 0;
  currentVideoDuration.value = 0;

  // Cleanup previous video stream explicitly to prevent pending requests
  if (videoElement.value) {
    videoElement.value.pause();
    videoElement.value.removeAttribute('src'); // Remove src attribute directly
    videoElement.value.load(); // Force browser to cancel pending download
  }

  // Proactively transcode formats that often fail in browsers or have poor performance (e.g. MOOV at end)
  const fileName = currentMediaItem.value.name
    ? currentMediaItem.value.name.toLowerCase()
    : '';
  const legacyFormats = ['.mov', '.avi', '.wmv', '.mkv', '.flv'];

  if (legacyFormats.some((ext) => fileName.endsWith(ext))) {
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
const setFilter = async (filter: 'All' | 'Images' | 'Videos') => {
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
};

/**
 * Handles the video pause event.
 */
const handleVideoPause = () => {
  if (!isTimerRunning.value && pauseTimerOnPlay.value && !playFullVideo.value) {
    resumeSlideshowTimer();
  }
};

/**
 * Updates the video progress bar based on the video's current time and duration.
 */
const handleVideoTimeUpdate = (event: Event) => {
  const target = event.target as HTMLVideoElement;
  const { currentTime, duration } = target;

  if (isTranscodingMode.value && transcodedDuration.value > 0) {
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

/**
 * Formats a time in seconds to HH:MM:SS or MM:SS string.
 */
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

/**
 * Handles clicks on the video progress bar to seek.
 */
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

/**
 * Handles keyboard navigation on the progress bar.
 */
const handleProgressBarKeydown = (event: KeyboardEvent) => {
  if (!currentMediaItem.value) return;

  const step = 5; // 5 seconds
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;

    if (isTranscodingMode.value) {
      if (transcodedDuration.value > 0) {
        const newTime = currentVideoTime.value + step * direction;
        const seekTime = Math.max(
          0,
          Math.min(newTime, transcodedDuration.value),
        );
        tryTranscoding(seekTime);
      }
    } else if (videoElement.value && videoElement.value.duration) {
      const newTime = videoElement.value.currentTime + step * direction;
      videoElement.value.currentTime = Math.max(
        0,
        Math.min(newTime, videoElement.value.duration),
      );
    }
  }
};

/**
 * Handles the loadedmetadata event for the video element.
 */
const handleVideoLoadedMetadata = (event: Event) => {
  const video = event.target as HTMLVideoElement;
  if (
    (video.videoWidth === 0 || video.videoHeight === 0) &&
    !isTranscodingMode.value
  ) {
    isVideoSupported.value = false;
    tryTranscoding(0);
  }
};

/**
 * Handles the playing event to clear the loading state.
 */
const handleVideoPlaying = () => {
  isTranscodingLoading.value = false;
  isBuffering.value = false;
};

const handleVideoWaiting = () => {
  if (!isTranscodingLoading.value) {
    isBuffering.value = true;
  }
};

const handleVideoCanPlay = () => {
  isBuffering.value = false;
};

const handleVideoProgress = (event: Event) => {
  const video = event.target as HTMLVideoElement;
  if (!video.duration) return;

  const ranges = [];
  for (let i = 0; i < video.buffered.length; i++) {
    const start = (video.buffered.start(i) / video.duration) * 100;
    const end = (video.buffered.end(i) / video.duration) * 100;
    ranges.push({ start, end });
  }
  bufferedRanges.value = ranges;
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

.floating-controls {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(16px);
  padding: 0.75rem 1.5rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.floating-controls:hover {
  background: rgba(0, 0, 0, 0.8);
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
  color: #ff9800;
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
