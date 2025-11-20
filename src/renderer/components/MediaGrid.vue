<template>
  <div class="media-grid-container p-4 h-full overflow-y-auto">
    <div
      v-if="gridMediaFiles.length === 0"
      class="flex items-center justify-center h-full text-gray-500"
    >
      No media files found in this album.
    </div>
    <div
      v-else
      class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
    >
      <div
        v-for="(item, index) in gridMediaFiles"
        :key="item.path + index"
        class="relative group cursor-pointer aspect-square bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-accent transition-all duration-200"
        @click="handleItemClick(item)"
        @mouseenter="handleMouseEnter(index)"
        @mouseleave="handleMouseLeave(index)"
      >
        <!-- Image Thumbnail -->
        <img
          v-if="isImage(item)"
          :src="getMediaUrl(item)"
          loading="lazy"
          class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          alt="Media Item"
        />

        <!-- Video Preview -->
        <div v-else-if="isVideo(item)" class="w-full h-full">
          <video
            :ref="(el) => setVideoRef(el, index)"
            :src="getMediaUrl(item)"
            class="w-full h-full object-cover"
            muted
            loop
            playsinline
            preload="metadata"
            :poster="getPosterUrl(item)"
          ></video>
          <div
            class="absolute top-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded flex items-center pointer-events-none"
          >
            VIDEO
          </div>
        </div>

        <!-- Overlay Info (Optional) -->
        <div
          class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        >
          <p class="text-white text-xs truncate">
            {{ getFileName(item.path) }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * @file Displays a grid of media items (images and videos).
 * Supports hover-to-preview for videos and click-to-play functionality.
 */
import { ref, onMounted } from 'vue';
import { useAppState } from '../composables/useAppState';

const { state } = useAppState();
const { gridMediaFiles } = state;

/**
 * Checks if the file is an image based on extension.
 * @param {object} item - The media item.
 * @returns {boolean}
 */
const isImage = (item) => {
  const ext = item.path.split('.').pop().toLowerCase();
  return state.supportedExtensions.images.includes(`.${ext}`);
};

/**
 * Checks if the file is a video based on extension.
 * @param {object} item - The media item.
 * @returns {boolean}
 */
const isVideo = (item) => {
  const ext = item.path.split('.').pop().toLowerCase();
  return state.supportedExtensions.videos.includes(`.${ext}`);
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

const getMediaUrl = (item) => {
  if (serverPort.value > 0) {
    let pathForUrl = item.path.replace(/\\/g, '/');
    // Encode the path to handle spaces and special characters
    pathForUrl = encodeURI(pathForUrl).replace(/#/g, '%23');

    let url = `http://localhost:${serverPort.value}/${pathForUrl}`;

    // For videos, add a time fragment to force a thumbnail frame
    if (isVideo(item)) {
        url += '#t=0.001';
    }

    return url;
  }
  return ''; // Placeholder until port is loaded
};

const getPosterUrl = (item) => {
  // For videos, we might not have a thumbnail.
  // Just return null/empty to show black or first frame (if preload metadata).
  return '';
};

const getFileName = (path) => {
  return path.replace(/^.*[\\/]/, '');
};

/**
 * Handlers for interactions
 */
const videoMap = new Map();
const setVideoRef = (el, index) => {
  if (el) videoMap.set(index, el);
  else videoMap.delete(index);
};

const playVideo = async (index) => {
  const videoEl = videoMap.get(index);
  if (videoEl) {
    try {
      await videoEl.play();
    } catch (e) {
      console.log('Play failed', e);
    }
  }
};

const pauseVideo = (index) => {
  const videoEl = videoMap.get(index);
  if (videoEl) {
    videoEl.pause();
    videoEl.currentTime = 0;
  }
};

const handleMouseEnter = (index) => {
    playVideo(index);
};

const handleMouseLeave = (index) => {
    pauseVideo(index);
};

const handleItemClick = async (item) => {
  state.displayedMediaFiles = [...gridMediaFiles];
  const index = state.displayedMediaFiles.findIndex(
    (f) => f.path === item.path,
  );
  state.currentMediaIndex = index;
  state.currentMediaItem = item;
  state.viewMode = 'player';
  state.isSlideshowActive = true;
  state.isTimerRunning = false;
};
</script>

<style scoped>
/* Custom scrollbar for the grid container if needed */
.media-grid-container::-webkit-scrollbar {
  width: 8px;
}
.media-grid-container::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
}
.media-grid-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}
.media-grid-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
