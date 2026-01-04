<template>
  <div
    class="absolute bottom-4 md:bottom-8 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none w-full"
  >
    <!-- Time Display Above Pill (Mobile Only or Sidebar Open) -->
    <div
      v-if="!isImage && currentMediaItem"
      class="text-[10px] font-mono text-white/90 px-3 py-1 bg-black/40 backdrop-blur-md rounded-full border border-white/10 pointer-events-auto transition-opacity duration-500 ease-in-out"
      :class="{
        'sm:hidden': !isNarrowView,
        'opacity-0 pointer-events-none': !isControlsVisible,
      }"
    >
      {{ formattedTime }}
    </div>

    <div
      class="controls-pill flex flex-nowrap justify-center items-center gap-1 md:gap-4 z-20 transition-transform-opacity duration-500 ease-in-out will-change-transform w-auto max-w-[98%] bg-black/40 backdrop-blur-md rounded-2xl px-3 py-1.5 md:px-10 md:py-3 border border-white/10 pointer-events-auto"
      :class="{ 'translate-y-48 opacity-0': !isControlsVisible }"
    >
      <!-- Previous Button -->
      <button
        :disabled="!canNavigate"
        class="nav-button group p-1.5 md:p-2 rounded-full text-white transition-all duration-200 hover:bg-[var(--accent-color)] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none shrink-0"
        aria-label="Previous media"
        @click="$emit('previous')"
      >
        <ChevronLeftIcon class="w-5 h-5 md:w-6 md:h-6" />
      </button>

      <!-- Next Button -->
      <button
        :disabled="!canNavigate"
        class="nav-button group p-1.5 md:p-2 rounded-full text-white transition-all duration-200 hover:bg-[var(--accent-color)] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none shrink-0"
        aria-label="Next media"
        @click="$emit('next')"
      >
        <ChevronRightIcon class="w-5 h-5 md:w-6 md:h-6" />
      </button>

      <!-- Separator -->
      <div
        v-if="!isImage && currentMediaItem && !isNarrowView"
        class="w-px h-6 md:h-8 bg-white/10 mx-0.5 md:mx-2 shrink-0"
      ></div>

      <!-- Rating -->
      <div v-if="currentMediaItem && !isSquishedView" class="flex gap-0.5">
        <button
          v-for="star in 5"
          :key="star"
          class="focus-visible:outline-none transition-colors duration-200"
          :class="
            (currentMediaItem?.rating || 0) >= star
              ? 'text-[var(--accent-color)]'
              : 'text-white/30 hover:text-white/70'
          "
          :aria-label="`Rate ${star} ${star === 1 ? 'star' : 'stars'}`"
          @click="$emit('set-rating', star)"
        >
          <StarIcon class="w-4 h-4 md:w-5 md:h-5" />
        </button>
      </div>

      <!-- Separator -->
      <div
        v-if="currentMediaItem && !isSquishedView"
        class="w-px h-6 md:h-8 bg-white/10 mx-0.5 md:mx-2 shrink-0 hidden sm:block"
      ></div>

      <!-- Play/Pause -->
      <button
        v-if="!isImage && currentMediaItem"
        class="play-pause-button p-1.5 md:p-2 rounded-full text-white transition-all duration-200 hover:bg-[var(--accent-color)] focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none shrink-0"
        :aria-label="isPlaying ? 'Pause video' : 'Play video'"
        @click="$emit('toggle-play')"
      >
        <PauseIcon v-if="isPlaying" class="w-5 h-5 md:w-6 md:h-6" />
        <PlayIcon v-else class="w-5 h-5 md:w-6 md:h-6" />
      </button>

      <!-- Separator -->
      <div
        v-if="!isImage && currentMediaItem && !isNarrowView"
        class="w-px h-6 md:h-8 bg-white/10 mx-0.5 md:mx-2 shrink-0"
      ></div>

      <!-- VR Mode -->
      <button
        v-if="!isImage && currentMediaItem"
        class="p-1.5 md:p-2 rounded-full text-white transition-all duration-200 hover:bg-[var(--accent-color)] focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none shrink-0"
        :class="{
          'bg-[var(--accent-color)]': isVrMode,
          'hidden sm:block': true,
        }"
        title="Toggle VR Mode (180°)"
        aria-label="Toggle VR Mode"
        @click="$emit('toggle-vr')"
      >
        <VRIcon class="w-5 h-5 md:w-6 md:h-6" />
      </button>

      <!-- Separator -->
      <div
        v-if="!isImage && currentMediaItem"
        class="w-px h-6 md:h-8 bg-white/10 mx-0.5 md:mx-2 shrink-0 hidden sm:block"
      ></div>

      <!-- VLC -->
      <button
        v-if="!isImage && currentMediaItem"
        class="vlc-button p-1.5 md:p-2 rounded-full text-white transition-all duration-200 hover:bg-[var(--accent-color)] focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none shrink-0 hidden sm:block"
        title="Open in VLC"
        aria-label="Open in VLC"
        @click="$emit('open-in-vlc')"
      >
        <VlcIcon class="w-5 h-5 md:w-6 md:h-6" />
      </button>

      <!-- Separator -->
      <div
        v-if="!isImage && currentMediaItem"
        class="w-px h-6 md:h-8 bg-white/10 mx-0.5 md:mx-2 shrink-0 hidden sm:block"
      ></div>

      <!-- Time Display In-Pill (Desktop/Tablet) -->
      <div
        v-if="!isImage && currentMediaItem && !isNarrowView"
        class="text-[10px] md:text-xs font-mono text-white/80 min-w-[60px] md:min-w-[80px] text-center hidden sm:block"
      >
        {{ formattedTime }}
      </div>

      <!-- Separator -->
      <div
        v-if="!isImage && currentMediaItem"
        class="w-px h-6 md:h-8 bg-white/10 mx-0.5 md:mx-2 shrink-0 hidden sm:block"
        :class="{ '!hidden': isNarrowView }"
      ></div>

      <!-- Fullscreen -->
      <button
        v-if="!isImage && currentMediaItem"
        class="p-1.5 md:p-2 rounded-full text-white transition-all duration-200 hover:bg-[var(--accent-color)] focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none shrink-0"
        title="Toggle Fullscreen"
        aria-label="Toggle Fullscreen"
        @click="$emit('toggle-fullscreen')"
      >
        <ExpandIcon class="w-5 h-5 md:w-6 md:h-6" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import VlcIcon from './icons/VlcIcon.vue';
import VRIcon from './icons/VRIcon.vue';
import ChevronLeftIcon from './icons/ChevronLeftIcon.vue';
import ChevronRightIcon from './icons/ChevronRightIcon.vue';
import PlayIcon from './icons/PlayIcon.vue';
import PauseIcon from './icons/PauseIcon.vue';
import ExpandIcon from './icons/ExpandIcon.vue';
import StarIcon from './icons/StarIcon.vue';
import type { MediaFile } from '../../core/types';
import { useUIStore } from '../composables/useUIStore';
import { computed, ref, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  currentMediaItem: MediaFile | null;
  isPlaying: boolean;
  canNavigate: boolean;
  isControlsVisible: boolean;
  isImage: boolean;
  isVrMode?: boolean;
  currentTime?: number;
  duration?: number;
}>();

const { isSidebarVisible } = useUIStore();

// Detect "Desktop" (medium screen) vs "Mobile" (small screen)
const isDesktop = ref(
  typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
);

const handleResize = () => {
  isDesktop.value = window.innerWidth >= 768;
};

onMounted(() => {
  window.addEventListener('resize', handleResize);
  handleResize(); // Initial check
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});

// Move time to bubble if we are on mobile OR the sidebar is open
const isNarrowView = computed(() => !isDesktop.value || isSidebarVisible.value);

// Hide stars if we are on desktop AND the sidebar is open (squished landscape)
// User specifically said "this doesn't need to happen with the portrait layout"
const isSquishedView = computed(
  () => isDesktop.value && isSidebarVisible.value,
);

defineEmits<{
  (e: 'previous'): void;
  (e: 'next'): void;
  (e: 'toggle-play'): void;
  (e: 'open-in-vlc'): void;
  (e: 'set-rating', star: number): void;
  (e: 'toggle-vr'): void;
  (e: 'toggle-fullscreen'): void;
}>();

const formatTime = (seconds: number) => {
  if (typeof seconds !== 'number' || !isFinite(seconds) || seconds <= 0)
    return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const formattedTime = computed(() => {
  const current = formatTime(props.currentTime || 0);
  const total = formatTime(props.duration || 0);
  return `${current} / ${total}`;
});
</script>

<style scoped></style>
