<template>
  <div class="app-container text-white min-h-screen flex flex-col relative">
    <AmbientBackground />

    <!-- Main Content Layer -->
    <main
      class="relative z-10 grow flex flex-col md:flex-row p-4 md:p-6 gap-4 md:gap-6 overflow-hidden h-screen transition-all duration-300 ease-in-out"
    >
      <!-- Sidebar (Collapsible/Floating) -->
      <!-- Mobile: Fixed Overlay, Desktop: Static Sidebar with Width Transition -->
      <transition name="slide-fade">
        <AlbumsList
          v-if="showSidebar"
          class="fixed inset-0 z-50 md:static md:shrink-0 w-full md:w-80 h-full bg-transparent p-0"
          @close="showSidebar = false"
        />
      </transition>

      <!-- Main Media Area -->
      <div class="grow flex flex-col h-full relative w-full min-w-0">
        <!-- Top Bar (Toggle Sidebar & Title) -->
        <div
          class="flex justify-between items-center mb-4 glass-panel rounded-lg p-3 shrink-0"
        >
          <button
            class="icon-button p-2 rounded-full hover:bg-white/10 transition-colors"
            :aria-label="showSidebar ? 'Hide Albums' : 'Show Albums'"
            @click="showSidebar = !showSidebar"
          >
            <CloseIcon v-if="showSidebar" />
            <MenuIcon v-else />
          </button>
          <h1
            class="text-xl font-bold tracking-wider text-accent drop-shadow-md font-header truncate ml-2"
          >
            MediaPlayer
          </h1>
          <div class="w-10 md:w-20"></div>
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
    <SmartPlaylistModal
      :playlist-to-edit="playlistToEdit"
      @close="playlistToEdit = null"
    />
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
import SmartPlaylistModal from './components/SmartPlaylistModal.vue';
import LoadingMask from './components/LoadingMask.vue';
import MenuIcon from './components/icons/MenuIcon.vue';
import CloseIcon from './components/icons/CloseIcon.vue';
import { useLibraryStore } from './composables/useLibraryStore';
import { useUIStore } from './composables/useUIStore';
import { useSlideshow } from './composables/useSlideshow';

const libraryStore = useLibraryStore();
const uiStore = useUIStore();
const { isScanning } = libraryStore;
const { viewMode, playlistToEdit } = uiStore;
const initializeApp = libraryStore.loadInitialData;
const { navigateMedia, toggleSlideshowTimer } = useSlideshow();

const showSidebar = ref(true);

/**
 * Handles global keydown events for slideshow control.
 * @param event - The keyboard event object.
 */
const handleKeydown = (event: KeyboardEvent) => {
  if (
    (event.target as HTMLElement).tagName === 'INPUT' ||
    (event.target as HTMLElement).tagName === 'TEXTAREA'
  ) {
    return;
  }

  // Handle navigation (Z = Previous, X = Next)
  // We allow this globally as Z/X are unlikely to conflict with standard typing unless focused on input (handled above)
  switch (event.key.toLowerCase()) {
    case 'z':
      event.preventDefault();
      navigateMedia(-1); // Navigate to the previous media item
      break;
    case 'x':
      event.preventDefault();
      navigateMedia(1); // Navigate to the next media item
      break;
    case ' ':
      // Keep spacebar logic for now, but ensure it doesn't conflict if MediaDisplay handles it too.
      // Actually, if we are in player mode (viewMode !== 'grid'), MediaDisplay handles spacebar.
      // So we should let App.vue handle it ONLY if NOT in player mode?
      // Or just keep the safe check:
      if (viewMode.value === 'grid') {
        event.preventDefault();
        toggleSlideshowTimer();
      }
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

@media (min-width: 768px) {
  .slide-fade-enter-active,
  .slide-fade-leave-active {
    /* Explicitly animate width and margin for smooth resize */
    transition:
      width 0.3s ease-out,
      margin-right 0.3s ease-out,
      opacity 0.2s ease-out,
      transform 0.3s ease-out;
    width: 20rem; /* w-80 */
    margin-right: 1.5rem; /* mr-6 */
    overflow: hidden; /* Prevent content spill during resize */
  }

  .slide-fade-enter-from,
  .slide-fade-leave-to {
    width: 0;
    margin-right: 0;
    opacity: 0;
    transform: translateX(-30px);
  }
}
</style>
