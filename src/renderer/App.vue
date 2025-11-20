<template>
  <div class="bg-gray-900 text-white min-h-screen flex flex-col">
    <header class="bg-gray-800 shadow-md p-4">
      <h1 class="text-2xl font-semibold text-center">Media Slideshow Viewer</h1>
    </header>

    <main class="grow flex flex-col md:flex-row p-4 gap-4 overflow-hidden">
      <AlbumsList />
      <MediaGrid v-if="viewMode === 'grid'" class="grow" />
      <MediaDisplay v-else class="grow" />
    </main>

    <footer class="bg-gray-800 text-center p-3 text-sm text-gray-500">
      Album Slideshow App | Use ← → for navigation, Space to Play/Pause timer.
    </footer>

    <SourcesModal />
    <LoadingMask v-if="isScanning" />
  </div>
</template>

<script setup>
/**
 * @file The main Vue component for the application.
 * It sets up the overall layout, initializes the application state,
 * and handles global keyboard shortcuts for media navigation.
 */
import { onMounted, onBeforeUnmount } from 'vue';
import AlbumsList from './components/AlbumsList.vue';
import MediaDisplay from './components/MediaDisplay.vue';
import MediaGrid from './components/MediaGrid.vue';
import SourcesModal from './components/SourcesModal.vue';
import LoadingMask from './components/LoadingMask.vue';
import { useAppState } from './composables/useAppState';
import { useSlideshow } from './composables/useSlideshow';

const { initializeApp, isScanning, viewMode } = useAppState();
const { navigateMedia, toggleSlideshowTimer } = useSlideshow();

/**
 * Handles global keydown events for slideshow control.
 * @param {KeyboardEvent} event - The keyboard event object.
 */
const handleKeydown = (event) => {
  // Ignore keyboard events if an input field is focused
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
    return;
  }

  switch (event.key) {
    case 'ArrowLeft':
      event.preventDefault();
      navigateMedia(-1); // Navigate to the previous media item
      break;
    case 'ArrowRight':
      event.preventDefault();
      navigateMedia(1); // Navigate to the next media item
      break;
    case ' ':
      event.preventDefault();
      toggleSlideshowTimer(); // Play or pause the slideshow timer
      break;
  }
};

// On component mount, initialize the app and add the keyboard event listener
onMounted(async () => {
  await initializeApp();
  document.addEventListener('keydown', handleKeydown);
});

// Before unmounting, clean up by removing the event listener
onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<style></style>
