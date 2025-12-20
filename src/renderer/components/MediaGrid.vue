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
        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-4"
      >
        <button
          v-for="item in visibleItems"
          :key="item.path"
          type="button"
          class="relative group grid-item cursor-pointer w-full h-full text-left bg-transparent border-0 p-0 block focus:outline-none focus:ring-2 focus:ring-pink-500 rounded"
          :aria-label="`View ${item.displayName}`"
          @click="handleItemClick(item)"
        >
          <template v-if="item.isImage">
            <img
              :src="item.mediaUrl"
              alt=""
              class="h-full w-full object-cover rounded"
              loading="lazy"
            />
          </template>
          <template v-else-if="item.isVideo">
            <video
              :src="item.mediaUrl"
              muted
              preload="metadata"
              :poster="item.posterUrl"
              class="h-full w-full object-cover rounded"
            ></video>
            <div
              class="absolute top-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded flex items-center pointer-events-none"
            >
              VIDEO
            </div>
          </template>
          <!-- Rating Overlay -->
          <div
            v-if="item.rating"
            class="absolute top-2 left-2 bg-black/60 text-yellow-400 text-xs px-1.5 py-0.5 rounded flex items-center pointer-events-none gap-1"
          >
            <span>★</span> {{ item.rating }}
          </div>
          <div
            class="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
          >
            <p class="text-white text-xs truncate">
              {{ item.displayName }}
            </p>
          </div>
        </button>

        <div
          v-if="visibleItems.length < allMediaFiles.length"
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
 * Uses incremental rendering (infinite scroll) and pre-calculated metadata for performance.
 */
import { ref, onMounted, computed, watch, shallowRef } from 'vue';
import { useAppState } from '../composables/useAppState';
import type { MediaFile } from '../../core/types';
import { api } from '../api';

const { state, imageExtensionsSet, videoExtensionsSet } = useAppState();

// Reactive reference to the full list from state
const allMediaFiles = computed(() => state.gridMediaFiles);

/**
 * Extended interface for cached media item properties.
 * Using this prevents repeated string parsing and extension lookups during render.
 */
interface ProcessedMediaItem extends MediaFile {
  isImage: boolean;
  isVideo: boolean;
  mediaUrl: string;
  posterUrl: string;
  displayName: string;
}

// -- Infinite Scroll Logic --
const visibleCount = ref(24); // Initial number of items to render (balanced for scrolling + 60fps)
const BATCH_SIZE = 24; // Items to add per scroll event

// Use shallowRef for performance: we treat the array as immutable chunks
const visibleItems = shallowRef<ProcessedMediaItem[]>([]);

/**
 * Helper to extract file extension efficiently.
 * @param nameOrPath - The file path or name.
 * @returns The extension including the dot, or empty string if none.
 */
const getExtension = (nameOrPath: string) => {
  const lastDotIndex = nameOrPath.lastIndexOf('.');
  if (lastDotIndex === -1) return '';

  const lastSlashIndex = Math.max(
    nameOrPath.lastIndexOf('/'),
    nameOrPath.lastIndexOf('\\'),
  );
  if (lastDotIndex < lastSlashIndex) return ''; // Dot is in directory name
  if (lastDotIndex === lastSlashIndex + 1) return ''; // Dotfile (e.g. .gitignore)

  return nameOrPath.substring(lastDotIndex).toLowerCase();
};

const mediaUrlGenerator = ref<((path: string) => string) | null>(null);
const thumbnailUrlGenerator = ref<((path: string) => string) | null>(null);

/**
 * Transforms a MediaFile into a ProcessedMediaItem with pre-calculated fields.
 * This runs only once per item when it first becomes visible, rather than on every render.
 */
const processItem = (item: MediaFile): ProcessedMediaItem => {
  const nameOrPath = item.name || item.path;
  const ext = getExtension(nameOrPath);
  const isImg = imageExtensionsSet.value.has(ext);
  const isVid = videoExtensionsSet.value.has(ext);

  let url = '';
  if (mediaUrlGenerator.value) {
    url = mediaUrlGenerator.value(item.path);
    // For videos, add a time fragment to force a thumbnail frame
    if (isVid) {
      url += '#t=0.001';
    }
  }

  let poster = '';
  if (thumbnailUrlGenerator.value) {
    poster = thumbnailUrlGenerator.value(item.path);
  }

  const displayName = item.name || item.path.replace(/^.*[\\/]/, '');

  return {
    ...item,
    isImage: isImg,
    isVideo: isVid,
    mediaUrl: url,
    posterUrl: poster,
    displayName,
  };
};

// Watchers for data changes

// 1. Handle full list changes or dependency updates (generators)
watch(
  [allMediaFiles, mediaUrlGenerator, thumbnailUrlGenerator],
  () => {
    // Reset count
    visibleCount.value = BATCH_SIZE;

    // Rebuild the initial batch
    const initialBatch = allMediaFiles.value.slice(0, BATCH_SIZE);
    visibleItems.value = initialBatch.map(processItem);

    // Scroll to top when album changes
    const container = document.querySelector('.media-grid-container');
    if (container) container.scrollTop = 0;
  },
  { immediate: true },
);

// 2. Handle infinite scroll (append-only update for O(1) performance)
watch(visibleCount, (newCount, oldCount) => {
  if (newCount > oldCount) {
    // Append new items
    const newSlice = allMediaFiles.value.slice(oldCount, newCount);
    const processed = newSlice.map(processItem);
    // Assign a new array to trigger shallowRef update
    visibleItems.value = [...visibleItems.value, ...processed];
  } else if (newCount < oldCount) {
    // Shrink (rare, but correct for safety)
    visibleItems.value = visibleItems.value.slice(0, newCount);
  }
});

// Also watch extensions in case they change dynamically (unlikely but safe)
watch([imageExtensionsSet, videoExtensionsSet], () => {
  // Force full re-process of current items
  // Since we only store visibleItems, we re-process them from source
  const currentCount = visibleCount.value;
  const currentSlice = allMediaFiles.value.slice(0, currentCount);
  visibleItems.value = currentSlice.map(processItem);
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

onMounted(async () => {
  try {
    mediaUrlGenerator.value = await api.getMediaUrlGenerator();
    thumbnailUrlGenerator.value = await api.getThumbnailUrlGenerator();
  } catch (e) {
    console.error('Failed to initialize media URL generators', e);
  }
});

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
  state.currentMediaItem = item; // MediaFile compatible
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
