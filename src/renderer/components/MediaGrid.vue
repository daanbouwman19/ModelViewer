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
        class="h-full custom-scrollbar"
        :items="chunkedItems"
        :item-size="rowHeight"
        key-field="id"
      >
        <template #default="{ item: row }">
          <div
            class="grid w-full h-full"
            :style="{
              gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
              gap: `${gap}px`,
              marginBottom: `${gap}px` /* Visual gap between rows */,
            }"
          >
            <button
              v-for="mediaItem in row.items"
              :key="mediaItem.path"
              type="button"
              class="relative group grid-item cursor-pointer w-full h-full text-left bg-transparent border-0 p-0 block focus:outline-none focus:ring-2 focus:ring-pink-500 rounded"
              :aria-label="`View ${mediaItem.displayName}`"
              @click="handleItemClick(mediaItem)"
            >
              <template v-if="mediaItem.isImage">
                <img
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
import { ref, onMounted, onUnmounted, computed, watch, shallowRef } from 'vue';
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

// Calculate row height to maintain square aspect ratio for items
const rowHeight = computed(() => {
  const PADDING_PX = 16; // p-4 = 1rem = 16px
  const totalGapWidth = gap.value * (columnCount.value - 1);
  const availableWidth = containerWidth.value - PADDING_PX * 2;
  const itemWidth = (availableWidth - totalGapWidth) / columnCount.value;
  // Add gap to height because RecycleScroller packs rows tightly, we simulate gap with marginBottom
  return itemWidth + gap.value;
});

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
    if (isImg && thumbnailUrlGenerator.value) {
      // For images, use thumbnail by default for better performance
      url = thumbnailUrlGenerator.value(item.path);
    } else {
      url = mediaUrlGenerator.value(item.path);
    }

    // For videos, add a time fragment to force a thumbnail frame
    if (isVid) {
      // Ensure we are using the full media URL for videos, not the thumbnail generator logic above if it leaked
      url = mediaUrlGenerator.value!(item.path) + '#t=0.001';
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

const handleImageError = (event: Event, item: ProcessedMediaItem) => {
  if (!mediaUrlGenerator.value) return;

  const imgElement = event.target as HTMLImageElement;
  const fullUrl = mediaUrlGenerator.value(item.path);

  // Prevent infinite loop if full URL also fails
  if (imgElement.src !== fullUrl) {
    imgElement.src = fullUrl;
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
