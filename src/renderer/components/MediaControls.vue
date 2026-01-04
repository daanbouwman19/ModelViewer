<template>
  <div
    class="floating-controls absolute bottom-4 md:bottom-8 left-1/2 transform -translate-x-1/2 flex flex-nowrap justify-center items-center gap-2 md:gap-4 z-20 transition-transform-opacity duration-500 ease-in-out will-change-transform w-auto max-w-[95%] bg-black/40 backdrop-blur-md rounded-2xl px-8 py-2 md:px-10 md:py-3 border border-white/10"
    :class="{ 'translate-y-48 opacity-0': !isControlsVisible }"
  >
    <!-- Previous Button -->
    <button
      :disabled="!canNavigate"
      class="nav-button p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white transition-all duration-200 hover:bg-[var(--accent-color)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-black/40 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none shrink-0"
      aria-label="Previous media"
      @click="$emit('previous')"
    >
      <ChevronLeftIcon class="w-6 h-6" />
    </button>

    <!-- Next Button -->
    <button
      :disabled="!canNavigate"
      class="nav-button p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white transition-all duration-200 hover:bg-[var(--accent-color)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-black/40 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none shrink-0"
      aria-label="Next media"
      @click="$emit('next')"
    >
      <ChevronRightIcon class="w-6 h-6" />
    </button>

    <!-- Separator -->
    <div
      v-if="!isImage && currentMediaItem"
      class="w-px h-8 bg-white/10 mx-1 md:mx-2 shrink-0"
    ></div>

    <!-- Rating -->
    <div v-if="currentMediaItem" class="flex gap-1 hidden md:flex">
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
        <StarIcon class="w-5 h-5" />
      </button>
    </div>

    <!-- Separator -->
    <div
      v-if="currentMediaItem"
      class="w-px h-8 bg-white/10 mx-1 md:mx-2 shrink-0 hidden md:block"
    ></div>

    <!-- Play/Pause -->
    <button
      v-if="!isImage && currentMediaItem"
      class="play-pause-button p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white transition-all duration-200 hover:bg-[var(--accent-color)] focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none shrink-0"
      :aria-label="isPlaying ? 'Pause video' : 'Play video'"
      @click="$emit('toggle-play')"
    >
      <PauseIcon v-if="isPlaying" class="w-6 h-6" />
      <PlayIcon v-else class="w-6 h-6" />
    </button>

    <!-- Separator -->
    <div
      v-if="!isImage && currentMediaItem"
      class="w-px h-8 bg-white/10 mx-1 md:mx-2 shrink-0"
    ></div>

    <!-- VR Mode -->
    <button
      v-if="!isImage && currentMediaItem"
      class="p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white transition-all duration-200 hover:bg-[var(--accent-color)] focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none shrink-0"
      :class="{ 'bg-[var(--accent-color)]': isVrMode }"
      title="Toggle VR Mode (180°)"
      aria-label="Toggle VR Mode"
      @click="$emit('toggle-vr')"
    >
      <VRIcon class="w-6 h-6" />
    </button>

    <!-- Separator -->
    <div
      v-if="!isImage && currentMediaItem"
      class="w-px h-8 bg-white/10 mx-1 md:mx-2 shrink-0 hidden md:block"
    ></div>

    <!-- VLC -->
    <button
      v-if="!isImage && currentMediaItem"
      class="vlc-button p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white transition-all duration-200 hover:bg-[var(--accent-color)] focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none shrink-0"
      title="Open in VLC"
      aria-label="Open in VLC"
      @click="$emit('open-in-vlc')"
    >
      <VlcIcon />
    </button>

    <!-- Separator -->
    <div
      v-if="!isImage && currentMediaItem"
      class="w-px h-8 bg-white/10 mx-1 md:mx-2 shrink-0 hidden md:block"
    ></div>

    <!-- Time Display -->
    <div
      v-if="!isImage && currentMediaItem"
      class="text-xs font-mono text-white/80 min-w-[80px] text-center hidden sm:block"
    >
      {{ formattedTime }}
    </div>

    <!-- Separator -->
    <div
      v-if="!isImage && currentMediaItem"
      class="w-px h-8 bg-white/10 mx-1 md:mx-2 shrink-0 hidden md:block"
    ></div>

    <!-- Fullscreen -->
    <button
      v-if="!isImage && currentMediaItem"
      class="p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white transition-all duration-200 hover:bg-[var(--accent-color)] focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none shrink-0"
      title="Toggle Fullscreen"
      aria-label="Toggle Fullscreen"
      @click="$emit('toggle-fullscreen')"
    >
      <ExpandIcon class="w-6 h-6" />
    </button>
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
import { computed } from 'vue';

const props = defineProps<{
  currentMediaItem: MediaFile | null;
  isPlaying: boolean;
  canNavigate: boolean;
  isControlsVisible: boolean;
  isImage: boolean;
  countInfo: string;
  isVrMode?: boolean;
  currentTime?: number;
  duration?: number;
}>();

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
  if (!seconds || isNaN(seconds)) return '00:00';
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

<style scoped>
/* Hide Media Info on small landscape screens to prevent clutter/overflow */
@media (max-height: 500px) and (orientation: landscape) {
  .landscape-mobile-hidden {
    display: none !important;
  }
}
</style>
