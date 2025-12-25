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
            <template v-for="i in columnCount" :key="row.startIndex + i">
              <!-- Check if item exists -->
              <MediaGridItem
                v-if="allMediaFiles[row.startIndex + i - 1]"
                :item="allMediaFiles[row.startIndex + i - 1]"
                :image-extensions-set="imageExtensionsSet"
                :video-extensions-set="videoExtensionsSet"
                :media-url-generator="mediaUrlGenerator"
                :thumbnail-url-generator="thumbnailUrlGenerator"
                :failed-image-paths="failedImagePaths"
                @click="handleItemClick"
              />
            </template>
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
import { ref, onMounted, onUnmounted, computed, watch, reactive } from 'vue';
import { useAppState } from '../composables/useAppState';
import type { MediaFile } from '../../core/types';
import { api } from '../api';
import MediaGridItem from './MediaGridItem.vue';

const { state, imageExtensionsSet, videoExtensionsSet } = useAppState();

// Reactive reference to the full list from state
const allMediaFiles = computed(() => state.gridMediaFiles);

interface GridRow {
  id: string;
  startIndex: number;
}

const scrollerContainer = ref<HTMLElement | null>(null);
const containerWidth = ref(1024); // Default fallback
const MIN_CONTAINER_WIDTH = 320;

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

const mediaUrlGenerator = ref<((path: string) => string) | null>(null);
const thumbnailUrlGenerator = ref<((path: string) => string) | null>(null);

const failedImagePaths = reactive(new Set<string>());

// Chunk items into rows for the scroller
const chunkedItems = computed<GridRow[]>(() => {
  // Ensure we re-chunk if generators or extensions change,
  // to force re-render of slots with new RenderProps
  void mediaUrlGenerator.value;
  void thumbnailUrlGenerator.value;
  void imageExtensionsSet.value;
  void videoExtensionsSet.value;

  const total = allMediaFiles.value.length;
  const cols = columnCount.value;
  const rows: GridRow[] = [];

  const rowCount = Math.ceil(total / cols);

  for (let i = 0; i < rowCount; i++) {
    rows.push({
      id: `row-${i * cols}`,
      startIndex: i * cols,
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
          containerWidth.value = Math.max(
            MIN_CONTAINER_WIDTH,
            entry.contentRect.width,
          );
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
  state.currentMediaItem = item;
  state.viewMode = 'player';
  state.isSlideshowActive = true;
  state.isTimerRunning = false;
};

const closeGrid = () => {
  state.viewMode = 'player';
};
</script>
