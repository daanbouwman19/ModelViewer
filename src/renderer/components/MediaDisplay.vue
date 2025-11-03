<template>
  <div
    class="w-full md:w-2/3 bg-gray-800 shadow-lg rounded-lg p-4 flex flex-col panel"
  >
    <div class="flex justify-center items-center mb-2">
      <h2 class="text-xl font-semibold text-center model-title">
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
      />
    </div>

    <div class="text-center mb-3 media-info">
      <p class="text-sm text-gray-400">
        {{ currentMediaItem ? currentMediaItem.name : '\u00A0' }}
      </p>
      <p class="text-sm text-gray-300">
        {{ countInfo }}
      </p>
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
} = useAppState();

const { navigateMedia, reapplyFilter } = useSlideshow();

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
 * A computed property that determines if the current media item is an image.
 * @type {import('vue').ComputedRef<boolean>}
 */
const isImage = computed(() => {
  if (!currentMediaItem.value) return false;
  const imageExtensions = supportedExtensions.value.images;
  const ext = currentMediaItem.value.path.slice(currentMediaItem.value.path.lastIndexOf('.')).toLowerCase();
  return imageExtensions.includes(ext);
});

/**
 * A computed property for the title displayed above the media.
 * @type {import('vue').ComputedRef<string>}
 */
const displayTitle = computed(() => {
  return isSlideshowActive.value ? 'Slideshow' : 'Select models and start slideshow';
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
    const result = await window.electronAPI.loadFileAsDataURL(currentMediaItem.value.path);
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
watch(currentMediaItem, loadMediaUrl, { immediate: true });
</script>

<style scoped>
/* ... styles remain unchanged ... */
</style>
