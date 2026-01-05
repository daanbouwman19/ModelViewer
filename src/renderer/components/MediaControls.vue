<template>
  <div
    class="absolute bottom-0 left-0 w-full flex flex-col items-center pointer-events-none z-50"
  >
    <div
      ref="controlsBarRef"
      class="controls-bar w-full flex flex-nowrap justify-center items-center transition-transform-opacity duration-500 ease-in-out will-change-transform bg-linear-to-t from-black/80 to-transparent pt-12 pb-6 pointer-events-auto"
      :class="[gapClass, { 'translate-y-full opacity-0': !isControlsVisible }]"
      :style="containerPaddingStyle"
    >
      <!-- Previous Button -->
      <button
        :disabled="!canNavigate"
        class="group transition-all duration-200 hover:bg-(--accent-color) disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none shrink-0"
        :class="navButtonClass"
        aria-label="Previous media"
        @click="$emit('previous')"
      >
        <ChevronLeftIcon class="w-5 h-5 md:w-6 md:h-6" />
      </button>

      <!-- Next Button -->
      <button
        :disabled="!canNavigate"
        class="group transition-all duration-200 hover:bg-(--accent-color) disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none shrink-0"
        :class="navButtonClass"
        aria-label="Next media"
        @click="$emit('next')"
      >
        <ChevronRightIcon class="w-5 h-5 md:w-6 md:h-6" />
      </button>

      <!-- Separator for Rating -->
      <div
        v-if="!isImage && currentMediaItem && showStars"
        class="w-px h-6 md:h-8 bg-white/10 mx-0.5 md:mx-2 shrink-0"
      ></div>

      <!-- Rating -->
      <div v-if="currentMediaItem && showStars" class="flex gap-0.5">
        <button
          v-for="star in 5"
          :key="star"
          class="focus-visible:outline-none transition-colors duration-200"
          :class="
            (currentMediaItem?.rating || 0) >= star
              ? 'text-(--accent-color)'
              : 'text-white/30 hover:text-white/70'
          "
          :aria-label="`Rate ${star} ${star === 1 ? 'star' : 'stars'}`"
          @click="$emit('set-rating', star)"
        >
          <StarIcon class="w-4 h-4 md:w-5 md:h-5" />
        </button>
      </div>

      <!-- Separator for Controls -->
      <div
        v-if="currentMediaItem && showStars"
        class="w-px h-6 md:h-8 bg-white/10 mx-0.5 md:mx-2 shrink-0 hidden sm:block"
      ></div>

      <!-- Play/Pause -->
      <button
        v-if="!isImage && currentMediaItem"
        class="play-pause-button p-1.5 md:p-2 rounded-full text-white transition-all duration-200 hover:bg-(--accent-color) focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none shrink-0"
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
        class="p-1.5 md:p-2 rounded-full text-white transition-all duration-200 hover:bg-(--accent-color) focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none shrink-0 hidden sm:block"
        :class="{
          'bg-(--accent-color)': isVrMode,
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
        class="vlc-button p-1.5 md:p-2 rounded-full text-white transition-all duration-200 hover:bg-(--accent-color) focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none shrink-0 hidden sm:block"
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
        v-if="!isImage && currentMediaItem && showTime"
        class="text-[10px] md:text-xs font-mono text-white/80 min-w-[60px] md:min-w-[80px] text-center"
      >
        {{ formattedTime }}
      </div>

      <!-- Separator -->
      <div
        v-if="!isImage && currentMediaItem"
        class="w-px h-6 md:h-8 bg-white/10 mx-0.5 md:mx-2 shrink-0 hidden sm:block"
        :class="{ 'hidden!': isNarrowView }"
      ></div>

      <!-- Fullscreen -->
      <button
        v-if="!isImage && currentMediaItem"
        class="p-1.5 md:p-2 rounded-full text-white transition-all duration-200 hover:bg-(--accent-color) focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none shrink-0"
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

const MD_BREAKPOINT = 768;

// Detect "Desktop" (medium screen) vs "Mobile" (small screen)
const isDesktop = ref(window.innerWidth >= MD_BREAKPOINT);
const isLandscape = ref(window.innerWidth > window.innerHeight);

const handleResize = () => {
  isDesktop.value = window.innerWidth >= MD_BREAKPOINT;
  isLandscape.value = window.innerWidth > window.innerHeight;
};

onMounted(() => {
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});

// Move time to bubble if we are on mobile OR the sidebar is open
const isNarrowView = computed(() => !isDesktop.value || isSidebarVisible.value);

// Computed class for navigation buttons to handle 3 states:
// 1. Desktop: Large Pill (Matches original nav-button feel)
// 2. Mobile Portrait: Medium Pill (Smaller than desktop to avoid edge touching, but easy to tap)
// 3. Mobile Landscape: Compact Circle (To save space)
const navButtonClass = computed(() => {
  // Desktop - Large Pill
  // Only use if we have enough space (container > 640px)
  // This handles case where "Desktop-like" screen (e.g. 915px) has sidebar open (500px available)
  if (isDesktop.value && containerWidth.value > 640) {
    // Note: 'nav-button' usually adds padding, but we define specifics here for safety
    return 'px-5 py-2 rounded-lg text-white font-bold uppercase tracking-wider text-sm shadow-md';
  }

  if (!isLandscape.value) {
    // Mobile Portrait - Medium Pill
    // Slightly more compact than desktop, but still pill-shaped
    return 'px-4 py-1.5 rounded-lg text-white font-bold uppercase tracking-wide text-xs shadow-sm';
  }

  // Mobile Landscape - Compact Circle
  return 'p-1.5 rounded-full text-white';
});

// Dynamic Gap for controls container
const gapClass = computed(() => {
  if (isDesktop.value && containerWidth.value > 640) {
    return 'gap-4'; // Standard desktop gap
  }
  if (!isLandscape.value) {
    return 'gap-6'; // Portrait Mobile: Wide gap to fill space
  }
  return 'gap-3'; // Landscape Mobile: Compact but slightly spaced for touch
});

// Container Padding Style based on Orientation + Safe Area
const containerPaddingStyle = computed(() => {
  // Landscape -> 3rem (48px) base padding for ample room
  // Portrait -> 1.5rem (24px) base padding for space efficiency
  const basePadding = isLandscape.value ? '3rem' : '1.5rem';
  return {
    paddingLeft: `max(${basePadding}, env(safe-area-inset-left))`,
    paddingRight: `max(${basePadding}, env(safe-area-inset-right))`,
  };
});

// Dynamic Responsiveness
const controlsBarRef = ref<HTMLElement | null>(null);
const containerWidth = ref(0);

// Thresholds
const SHOW_STARS_THRESHOLD = 650; // Stars disappear below this
const SHOW_TIME_THRESHOLD = 450; // Time disappears below this

onMounted(() => {
  if (controlsBarRef.value) {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width;
      }
    });
    observer.observe(controlsBarRef.value);

    // Initial set
    containerWidth.value = controlsBarRef.value.getBoundingClientRect().width;

    // Cleanup
    onUnmounted(() => {
      observer.disconnect();
    });
  }
});

const showStars = computed(() => {
  // Always show on "desktop" unless very constrained
  // If user is on mobile (< 768), stars are typically hidden by CSS or design choice,
  // but here we strictly follow available width.
  // The user asked for "shorter controls should stay for mobile", implying hidden stars on mobile.
  if (!isDesktop.value) return false;

  return containerWidth.value > SHOW_STARS_THRESHOLD;
});

const showTime = computed(() => {
  return containerWidth.value > SHOW_TIME_THRESHOLD;
});

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

defineEmits<{
  (e: 'previous'): void;
  (e: 'next'): void;
  (e: 'toggle-play'): void;
  (e: 'open-in-vlc'): void;
  (e: 'set-rating', star: number): void;
  (e: 'toggle-vr'): void;
  (e: 'toggle-fullscreen'): void;
}>();
</script>

<style scoped></style>
