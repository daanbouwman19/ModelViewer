<template>
  <div
    class="flex flex-col h-full w-full bg-gray-900 rounded-lg overflow-hidden shadow-lg border border-gray-700"
  >
    <div
      class="flex justify-between items-center p-3 bg-gray-800 border-b border-gray-700 shrink-0"
    >
      <h2 class="text-lg font-semibold text-gray-200">Grid View</h2>
      <button
        class="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
        title="Close Grid View"
        @click="closeGrid"
      >
        Close
      </button>
    </div>
    <div
      class="media-grid-container p-4 grow overflow-y-auto custom-scrollbar"
      @scroll="handleScroll"
    >
      <div
        v-if="allMediaFiles.length === 0"
        class="flex items-center justify-center h-full text-gray-500"
      >
        No media files found in this album.
      </div>
      <div
        v-else
        class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
      >
        <div
          v-for="item in visibleMediaFiles"
          :key="item.path"
          class="relative group grid-item cursor-pointer"
          @click="handleItemClick(item)"
        >
          <template v-if="isImage(item)">
            <img
              :src="getMediaUrl(item)"
              :alt="getFileName(item.path)"
              class="h-full w-full object-cover rounded"
              loading="lazy"
            />
          </template>
          <template v-else-if="isVideo(item)">
            <video
              :src="getMediaUrl(item)"
              muted
              preload="metadata"
              :poster="getPosterUrl()"
              class="h-full w-full object-cover rounded"
            ></video>
            <div
              class="absolute top-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded flex items-center pointer-events-none"
            >
              VIDEO
            </div>
          </template>
          <div
            class="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          >
            <p class="text-white text-xs truncate">
              {{ getFileName(item.path) }}
            </p>
          </div>
        </div>

        <div
          v-if="visibleCount < allMediaFiles.length"
          class="col-span-full py-4 text-center text-gray-500"
        >
          Loading more...
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file Displays a grid of media items (images and videos).
 * Supports hover-to-preview for videos and click-to-play functionality.
 * Uses incremental rendering (infinite scroll) for performance.
 */
import { ref, onMounted, computed, watch } from 'vue';
import { useAppState } from '../composables/useAppState';
import type { MediaFile } from '../../main/media-scanner';

const { state } = useAppState();

// Reactive reference to the full list from state
const allMediaFiles = computed(() => state.gridMediaFiles);

// -- Infinite Scroll Logic --
const visibleCount = ref(24); // Initial number of items to render (balanced for scrolling + 60fps)
const BATCH_SIZE = 24; // Items to add per scroll event

const visibleMediaFiles = computed(() => {
  return allMediaFiles.value.slice(0, visibleCount.value);
});

/**
 * Throttle helper function to limit how often a function can be called
 * @param func - The function to throttle
 * @param delay - Delay in milliseconds
 * @returns Throttled function
 */
const throttle = <A extends unknown[]>(
  func: (...args: A) => void,
  delay: number,
) => {
  let inThrottle: boolean;
  return function (this: unknown, ...args: A) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), delay);
    }
  };
};

/**
 * Handles scroll events to load more items incrementally
 */
const handleScrollInternal = (e: Event) => {
  const target = e.target as HTMLElement;
  const { scrollTop, scrollHeight, clientHeight } = target;

  // Load more when the user scrolls within 300px of the bottom
  if (scrollTop + clientHeight >= scrollHeight - 300) {
    if (visibleCount.value < allMediaFiles.value.length) {
      visibleCount.value = Math.min(
        visibleCount.value + BATCH_SIZE,
        allMediaFiles.value.length,
      );
    }
  }
};

// Throttled version of scroll handler (fires at most every 150ms)
const handleScroll = throttle(handleScrollInternal, 150);

// Reset visible count when the underlying data changes (e.g. new album opened)
watch(allMediaFiles, () => {
  visibleCount.value = BATCH_SIZE;
  // Scroll to top when album changes
  const container = document.querySelector('.media-grid-container');
  if (container) container.scrollTop = 0;
});
// -- End Infinite Scroll Logic --

/**
 * Checks if the file is an image based on extension.
 * @param item - The media item.
 * @returns True if it is an image.
 */
const isImage = (item: MediaFile) => {
  const ext = item.path.split('.').pop()?.toLowerCase();
  return ext ? state.supportedExtensions.images.includes(`.${ext}`) : false;
};

/**
 * Checks if the file is a video based on extension.
 * @param item - The media item.
 * @returns True if it is a video.
 */
const isVideo = (item: MediaFile) => {
  const ext = item.path.split('.').pop()?.toLowerCase();
  return ext ? state.supportedExtensions.videos.includes(`.${ext}`) : false;
};

/**
 * Generates a URL for the media item.
 * Uses the new 'preferHttp' option to get an HTTP URL for grid performance.
 */
const serverPort = ref(0);

onMounted(async () => {
  try {
    serverPort.value = await window.electronAPI.getServerPort();
  } catch (e) {
    console.error('Failed to determine server port', e);
  }
});

const getMediaUrl = (item: MediaFile) => {
  if (serverPort.value > 0) {
    let pathForUrl = item.path.replace(/\\/g, '/');
    // Encode each path segment to handle all special characters
    pathForUrl = pathForUrl
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    let url = `http://localhost:${serverPort.value}/${pathForUrl}`;

    // For videos, add a time fragment to force a thumbnail frame
    if (isVideo(item)) {
      url += '#t=0.001';
    }

    return url;
  }
  return ''; // Placeholder until port is loaded
};

const getPosterUrl = () => {
  // For videos, we might not have a thumbnail.
  // Just return null/empty to show black or first frame (if preload metadata).
  return '';
};

const getFileName = (path: string) => {
  return path.replace(/^.*[\\/]/, '');
};

/**
 * Handlers for interactions
 */
const handleItemClick = async (item: MediaFile) => {
  // When clicking an item, we pass the FULL list to the player, not just visible ones
  state.displayedMediaFiles = [...allMediaFiles.value];
  const index = state.displayedMediaFiles.findIndex(
    (f) => f.path === item.path,
  );
  state.currentMediaIndex = index;
  state.currentMediaItem = item;
  state.viewMode = 'player';
  state.isSlideshowActive = true;
  state.isTimerRunning = false;
};

const closeGrid = () => {
  state.viewMode = 'player';
};
</script>

<style scoped>
/* Performance-critical optimizations for grid items */
.grid-item {
  /* Use content-visibility for better rendering performance */
  content-visibility: auto;
  contain-intrinsic-size: 200px;

  /* Enable GPU acceleration */
  will-change: border-color;
  transform: translateZ(0);

  /* Optimize rendering */
  backface-visibility: hidden;
  -webkit-font-smoothing: antialiased;
}

/* Simplified hover effect - no transitions */
.grid-item:hover {
  border-color: #ec4899;
}

/* Optimize image rendering */
.grid-item img,
.grid-item video {
  /* Force GPU acceleration */
  transform: translateZ(0);

  /* Optimize image rendering */
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
}
</style>
