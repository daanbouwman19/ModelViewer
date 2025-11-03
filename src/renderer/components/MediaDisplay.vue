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
        {{ currentMediaItem ? currentMediaItem.name : '&nbsp;' }}
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
import { ref, computed, watch } from 'vue';
import { useAppState } from '../composables/useAppState';
import { useSlideshow } from '../composables/useSlideshow';

const {
  currentMediaItem,
  displayedMediaFiles,
  currentMediaIndex,
  isGlobalSlideshowActive,
  currentSelectedModelForIndividualView,
  mediaFilter,
} = useAppState();

const { navigateMedia, reapplyFilter } = useSlideshow();

const filters = ['All', 'Images', 'Videos'];
const mediaUrl = ref(null);
const isLoading = ref(false);
const error = ref(null);

const isImage = computed(() => {
  if (!currentMediaItem.value) return false;
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  const ext = currentMediaItem.value.path
    .toLowerCase()
    .slice(currentMediaItem.value.path.lastIndexOf('.'));
  return imageExtensions.includes(ext);
});

const displayTitle = computed(() => {
  if (isGlobalSlideshowActive.value) {
    return 'Global Slideshow';
  }
  if (currentSelectedModelForIndividualView.value) {
    return currentSelectedModelForIndividualView.value.name;
  }
  return 'Select a model or start Global Slideshow';
});

const countInfo = computed(() => {
  if (displayedMediaFiles.value.length === 0) return '&nbsp;';
  const current = currentMediaIndex.value + 1;
  const total = displayedMediaFiles.value.length;
  return `${current} / ${total}`;
});

const canNavigate = computed(() => {
  return displayedMediaFiles.value.length > 0;
});

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
    } else if (result.type === 'data-url' || result.type === 'http-url') {
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

const handleMediaError = () => {
  error.value = 'Failed to display media file.';
};

const handlePrevious = () => {
  navigateMedia(-1);
};

const handleNext = () => {
  navigateMedia(1);
};

const setFilter = async (filter) => {
  mediaFilter.value = filter;
  // Reapply the filter to update the displayed files
  await reapplyFilter();
};

// Watch for changes to currentMediaItem and load the media URL
watch(
  currentMediaItem,
  () => {
    loadMediaUrl();
  },
  { immediate: true },
);
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
</style>
