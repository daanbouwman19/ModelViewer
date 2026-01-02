<template>
  <div
    class="floating-controls absolute bottom-4 md:bottom-8 left-1/2 transform -translate-x-1/2 flex justify-between items-center gap-4 md:gap-6 z-20 transition-transform-opacity duration-500 ease-in-out will-change-transform w-[90%] md:w-[600px]"
    :class="{ 'translate-y-48 opacity-0': !isControlsVisible }"
  >
    <button
      :disabled="!canNavigate"
      class="nav-button p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white transition-all duration-200 hover:bg-[var(--accent-color)]"
      aria-label="Previous media"
      @click="$emit('previous')"
    >
      <ChevronLeftIcon class="w-6 h-6" />
    </button>

    <div class="media-info text-center flex-1 min-w-0 px-4">
      <p
        class="text-lg font-bold drop-shadow-md text-white truncate"
        :title="currentMediaItem ? currentMediaItem.name : ''"
      >
        {{ currentMediaItem ? currentMediaItem.name : 'Select an album' }}
      </p>

      <!-- Rating Controls -->
      <div v-if="currentMediaItem" class="flex justify-center gap-1 my-1">
        <button
          v-for="star in 5"
          :key="star"
          class="focus:outline-none transition-transform hover:scale-110"
          :aria-label="'Rate ' + star + ' star' + (star > 1 ? 's' : '')"
          @click="$emit('set-rating', star)"
        >
          <StarIcon
            :class="[
              'w-5 h-5 transition-colors',
              (currentMediaItem?.rating ?? 0) >= star
                ? 'text-yellow-400 fill-yellow-400'
                : 'text-gray-400 hover:text-yellow-300',
            ]"
          />
        </button>
      </div>

      <p
        v-if="currentMediaItem"
        class="text-xs text-gray-400 mb-1 drop-shadow-md"
      >
        Views: {{ currentMediaItem.viewCount || 0 }}
        <span v-if="currentMediaItem.lastViewed">
          • Last:
          {{ new Date(currentMediaItem.lastViewed).toLocaleDateString() }}
        </span>
      </p>

      <p v-if="currentMediaItem" class="text-xs text-gray-300 drop-shadow-md">
        {{ countInfo }}
      </p>
    </div>

    <button
      :disabled="!canNavigate"
      class="nav-button p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white transition-all duration-200 hover:bg-[var(--accent-color)]"
      aria-label="Next media"
      @click="$emit('next')"
    >
      <ChevronRightIcon class="w-6 h-6" />
    </button>

    <div
      v-if="!isImage && currentMediaItem"
      class="w-px h-8 bg-white/10 mx-2"
    ></div>

    <button
      v-if="!isImage && currentMediaItem"
      class="play-pause-button p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white transition-all duration-200 hover:bg-[var(--accent-color)]"
      :aria-label="isPlaying ? 'Pause video' : 'Play video'"
      @click="$emit('toggle-play')"
    >
      <PauseIcon v-if="isPlaying" class="w-6 h-6" />
      <PlayIcon v-else class="w-6 h-6" />
    </button>

    <div
      v-if="!isImage && currentMediaItem"
      class="w-px h-8 bg-white/10 mx-2"
    ></div>

    <button
      v-if="!isImage && currentMediaItem"
      class="p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white transition-all duration-200 hover:bg-[var(--accent-color)]"
      :class="{ 'bg-[var(--accent-color)]': isVrMode }"
      title="Toggle VR Mode (180°)"
      aria-label="Toggle VR Mode"
      @click="$emit('toggle-vr')"
    >
      <VRIcon class="w-6 h-6" />
    </button>

    <div
      v-if="!isImage && currentMediaItem"
      class="w-px h-8 bg-white/10 mx-2"
    ></div>

    <button
      v-if="!isImage && currentMediaItem"
      class="vlc-button p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white transition-all duration-200 hover:bg-[var(--accent-color)]"
      title="Open in VLC"
      aria-label="Open in VLC"
      @click="$emit('open-in-vlc')"
    >
      <VlcIcon />
    </button>
  </div>
</template>

<script setup lang="ts">
import VlcIcon from './icons/VlcIcon.vue';
import VRIcon from './icons/VRIcon.vue';
import StarIcon from './icons/StarIcon.vue';
import ChevronLeftIcon from './icons/ChevronLeftIcon.vue';
import ChevronRightIcon from './icons/ChevronRightIcon.vue';
import PlayIcon from './icons/PlayIcon.vue';
import PauseIcon from './icons/PauseIcon.vue';
import type { MediaFile } from '../../core/types';

defineProps<{
  currentMediaItem: MediaFile | null;
  isPlaying: boolean;
  canNavigate: boolean;
  isControlsVisible: boolean;
  isImage: boolean;
  countInfo: string;
  isVrMode?: boolean;
}>();

defineEmits<{
  (e: 'previous'): void;
  (e: 'next'): void;
  (e: 'toggle-play'): void;
  (e: 'open-in-vlc'): void;
  (e: 'set-rating', star: number): void;
  (e: 'toggle-vr'): void;
}>();
</script>
