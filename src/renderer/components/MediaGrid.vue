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

    <!-- Virtual Scroller Container -->
    <div
      ref="scrollerContainer"
      class="media-grid-container p-4 grow overflow-hidden"
    >
      <div
        v-if="allMediaFiles.length === 0"
        class="flex items-center justify-center h-full text-gray-500"
      >
        No media files found in this album.
      </div>

      <RecycleScroller
        v-else
        :key="columnCount"
        class="h-full custom-scrollbar"
        :items="chunkedItems"
        :item-size="rowHeight"
        key-field="id"
      >
        <template #default="{ item: row }">
          <div class="grid w-full h-full" :style="gridStyle">
            <button
              v-for="mediaItem in row.items"
              :key="mediaItem.path"
              type="button"
              class="relative group grid-item cursor-pointer w-full h-full text-left bg-transparent border-0 p-0 block focus:outline-none focus:ring-2 focus:ring-pink-500 rounded overflow-hidden"
              :aria-label="`View ${mediaItem.displayName}`"
              @click="handleItemClick(mediaItem)"
            >
              <template v-if="mediaItem.isImage">
                <div
                  v-if="failedImagePaths.has(mediaItem.path)"
                  class="h-full w-full flex items-center justify-center bg-gray-800 text-gray-600 rounded"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-12 w-12"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <img
                  v-else
                  :src="mediaItem.mediaUrl"
                  alt=""
                  class="h-full w-full object-cover rounded"
                  loading="lazy"
                  @error="handleImageError($event, mediaItem)"
                />
              </template>
              <template v-else-if="mediaItem.isVideo">
                <video
                  :src="mediaItem.mediaUrl"
                  muted
                  preload="metadata"
                  :poster="mediaItem.posterUrl"
                  class="h-full w-full object-cover rounded block"
                ></video>
                <div
                  class="absolute top-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded flex items-center pointer-events-none"
                >
                  VIDEO
                </div>
              </template>
              <!-- Rating Overlay -->
              <div
                v-if="mediaItem.rating"
                class="absolute top-2 left-2 bg-black/60 text-yellow-400 text-xs px-1.5 py-0.5 rounded flex items-center pointer-events-none gap-1"
              >
                <span>★</span> {{ mediaItem.rating }}
              </div>
              <div
                class="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
              >
                <p class="text-white text-xs truncate">
                  {{ mediaItem.displayName }}
                </p>
              </div>
            </button>
          </div>
        </template>
      </RecycleScroller>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file Displays a grid of media items (images and videos).
 * Supports hover-to-preview for videos and click-to-play functionality.
 * Uses vue-virtual-scroller for performance on large albums.
 */
import {
  ref,
  onMounted,
  onUnmounted,
  computed,
  watch,
  shallowRef,
  reactive,
} from 'vue';
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

interface GridRow {
  id: string;
  items: ProcessedMediaItem[];
}

const scrollerContainer = ref<HTMLElement | null>(null);
const containerWidth = ref(1024); // Default fallback

// -- Grid Dimensions Logic --
const columnCount = computed(() => {
  const w = containerWidth.value;
  if (w < 640) return 2; // grid-cols-2
  if (w < 1024) return 3; // sm:grid-cols-3 and md:grid-cols-3
  if (w < 1280) return 4; // lg:grid-cols-4
  return 5; // xl:grid-cols-5
});

const gap = computed(() => {
  // Matching gap-2 (8px) and md:gap-4 (16px)
  return containerWidth.value < 768 ? 8 : 16;
});

// Calculate item width (square)
const itemWidth = computed(() => {
  const PADDING_PX = 16; // p-4 = 1rem = 16px
  const totalGapWidth = gap.value * (columnCount.value - 1);
  const availableWidth = containerWidth.value - PADDING_PX * 2;
  // Use floor to ensure we fit in the container without sub-pixel overflow
  return Math.floor((availableWidth - totalGapWidth) / columnCount.value);
});

// Calculate row height to maintain square aspect ratio for items
const rowHeight = computed(() => {
  // Add gap to height because RecycleScroller packs rows tightly, we simulate gap with marginBottom
  return itemWidth.value + gap.value;
});

// Update styles to use explicit height
// We set the height of the content row to exactly itemWidth.
// The RecycleScroller item-size (rowHeight) is itemWidth + gap.
// This leaves exactly 'gap' pixels of empty space at the bottom of each row.
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${columnCount.value}, minmax(0, 1fr))`,
  gap: `${gap.value}px`,
  height: `${itemWidth.value}px`,
}));

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
    if (isVid) {
      // For videos, use the full media URL with a time fragment to generate a thumbnail frame.
      url = mediaUrlGenerator.value(item.path) + '#t=0.001';
    } else if (isImg && thumbnailUrlGenerator.value) {
      // For images, prefer the pre-generated thumbnail for performance.
      url = thumbnailUrlGenerator.value(item.path);
    } else {
      // Fallback for images without a thumbnail generator or other file types.
      url = mediaUrlGenerator.value(item.path);
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

const failedImagePaths = reactive(new Set<string>());

const handleImageError = (event: Event, item: ProcessedMediaItem) => {
  // If we are already showing the full URL or don't have a generator, just mark as failed
  if (!mediaUrlGenerator.value || failedImagePaths.has(item.path)) return;

  const imgElement = event.target as HTMLImageElement;
  const fullUrl = mediaUrlGenerator.value(item.path);

  // If we were using a thumbnail and it failed, try the full URL
  if (imgElement.src !== fullUrl && item.mediaUrl !== fullUrl) {
    // Retry with full URL
    imgElement.src = fullUrl;
  } else {
    // Already tried full URL or it matches, so it's a real failure
    failedImagePaths.add(item.path);
  }
};

// Processed list of ALL items
const allProcessedItems = shallowRef<ProcessedMediaItem[]>([]);

watch(
  [
    allMediaFiles,
    mediaUrlGenerator,
    thumbnailUrlGenerator,
    imageExtensionsSet,
    videoExtensionsSet,
  ],
  () => {
    // potential perf: might want to clear failed paths if the list completely changes?
    // But keeping them is safer to avoid flickering if reloaded.
    // If the file actually exists now, it will stay failed until reload.
    // This is acceptable for "Code Quality" pass.
    allProcessedItems.value = allMediaFiles.value.map(processItem);
  },
  { immediate: true },
);

// Chunk items into rows for the scroller
const chunkedItems = computed<GridRow[]>(() => {
  const items = allProcessedItems.value;
  const cols = columnCount.value;
  const rows: GridRow[] = [];

  for (let i = 0; i < items.length; i += cols) {
    rows.push({
      id: `row-${i}`,
      items: items.slice(i, i + cols),
    });
  }
  return rows;
});

// Resize Observer
let resizeObserver: ResizeObserver | null = null;

const setupResizeObserver = () => {
  if (scrollerContainer.value && !resizeObserver) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentBoxSize) {
          // Use content box width to match how CSS grid calculates available space
          containerWidth.value = entry.contentRect.width;
        }
      }
    });
    resizeObserver.observe(scrollerContainer.value);
  }
};

onMounted(async () => {
  try {
    mediaUrlGenerator.value = await api.getMediaUrlGenerator();
    thumbnailUrlGenerator.value = await api.getThumbnailUrlGenerator();
  } catch (e) {
    console.error('Failed to initialize media URL generators', e);
  }

  // Initial setup attempt
  setupResizeObserver();
});

// Watch for the container appearing (e.g. when items are loaded)
watch(scrollerContainer, () => {
  setupResizeObserver();
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

/**
 * Handlers for interactions
 */
const handleItemClick = async (item: MediaFile) => {
  if (failedImagePaths.has(item.path)) {
    // Optional: Prevent clicking broken images or let it handle error in player?
    // For now, let's allow trying to play/view it, maybe player handles it.
  }

  // When clicking an item, we pass the FULL list to the player
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
