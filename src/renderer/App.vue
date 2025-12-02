<template>
  <div class="app-container text-white min-h-screen flex flex-col relative">
    <AmbientBackground />

    <!-- Main Content Layer -->
    <main
      class="relative z-10 grow flex flex-col md:flex-row p-6 gap-6 overflow-hidden h-screen transition-all duration-300 ease-in-out"
    >
      <!-- Sidebar (Collapsible/Floating) -->
      <transition name="slide-fade">
        <AlbumsList v-if="showSidebar" class="shrink-0 w-full md:w-80 h-full" />
      </transition>

      <!-- Main Media Area -->
      <div class="grow flex flex-col h-full relative">
        <!-- Top Bar (Toggle Sidebar & Title) -->
        <div
          class="flex justify-between items-center mb-4 glass-panel rounded-lg p-3"
        >
          <button class="icon-button" @click="showSidebar = !showSidebar">
            <span v-if="showSidebar">← Hide Albums</span>
            <span v-else>→ Show Albums</span>
          </button>
          <h1
            class="text-xl font-bold tracking-wider text-accent drop-shadow-md font-header"
          >
            Media Slideshow
          </h1>
          <div class="w-20"></div>
          <!-- Spacer for balance -->
        </div>

        <!-- Media Display -->
        <MediaGrid
          v-if="viewMode === 'grid'"
          class="grow glass-panel rounded-xl overflow-hidden"
        />
        <MediaDisplay v-else class="grow rounded-xl overflow-hidden" />
      </div>
    </main>

    <SourcesModal />
    <LoadingMask v-if="isScanning" />
  </div>
</template>

<script setup lang="ts">
/**
 * @file The main Vue component for the application.
 * It sets up the overall layout, initializes the application state,
 * and handles global keyboard shortcuts for media navigation.
 */
import { onMounted, onBeforeUnmount, ref } from 'vue';
import AmbientBackground from './components/AmbientBackground.vue';
import AlbumsList from './components/AlbumsList.vue';
import MediaDisplay from './components/MediaDisplay.vue';
import MediaGrid from './components/MediaGrid.vue';
import SourcesModal from './components/SourcesModal.vue';
import LoadingMask from './components/LoadingMask.vue';
import { useAppState } from './composables/useAppState';
import { useSlideshow } from './composables/useSlideshow';

const { initializeApp, isScanning, viewMode } = useAppState();
const { navigateMedia, toggleSlideshowTimer } = useSlideshow();

console.log(`[App.vue] Setup executed at ${new Date().toISOString()}`);

const showSidebar = ref(true);

/**
 * Handles global keydown events for slideshow control.
 * @param event - The keyboard event object.
 */
const handleKeydown = (event: KeyboardEvent) => {
  // Ignore keyboard events if an input field is focused
  if (
    (event.target as HTMLElement).tagName === 'INPUT' ||
    (event.target as HTMLElement).tagName === 'TEXTAREA'
  ) {
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
  console.log(`[App.vue] onMounted started at ${new Date().toISOString()}`);
  await initializeApp();
  console.log(
    `[App.vue] initializeApp completed at ${new Date().toISOString()}`,
  );
  document.addEventListener('keydown', handleKeydown);
});

// Before unmounting, clean up by removing the event listener
onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped>
.app-container {
  /* Background handled by AmbientBackground */
  background-color: transparent;
}

.text-accent {
  color: var(--accent-color);
}

.font-header {
  font-family: var(--header-font);
}

.icon-button {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-weight: 600;
  transition: color 0.2s;
}

.icon-button:hover {
  color: var(--accent-color);
}

/* Transitions */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease-out;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(-20px);
  opacity: 0;
}
</style>
