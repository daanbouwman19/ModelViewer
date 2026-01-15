<template>
  <button
    type="button"
    class="relative group grid-item cursor-pointer w-full h-full text-left bg-transparent border-0 p-0 block focus:outline-none focus:ring-2 focus:ring-pink-500 rounded overflow-hidden"
    :aria-label="`View ${displayName}`"
    :title="displayName"
    @click="$emit('click', item)"
  >
    <template v-if="isImage">
      <div
        v-if="hasFailed"
        class="h-full w-full flex items-center justify-center bg-gray-800 text-gray-600 rounded"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-12 w-12"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <img
        v-else
        :src="mediaUrl"
        alt=""
        class="h-full w-full object-cover rounded"
        loading="lazy"
        @error="handleImageError"
      />
    </template>
    <template v-else-if="isVideo">
      <video
        :src="mediaUrl"
        muted
        preload="metadata"
        :poster="posterUrl"
        class="h-full w-full object-cover rounded block"
      ></video>
      <div
        class="absolute top-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded flex items-center pointer-events-none"
      >
        {{ item.duration ? formatTime(item.duration) : 'VIDEO' }}
      </div>
    </template>
    <!-- Rating Overlay -->
    <div
      v-if="item.rating"
      class="absolute top-2 left-2 bg-black/60 text-yellow-400 text-xs px-1.5 py-0.5 rounded flex items-center pointer-events-none gap-1"
    >
      <span>★</span>
      {{ item.rating }}
    </div>
    <div
      class="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
    >
      <p class="text-white text-xs truncate">
        {{ displayName }}
      </p>
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MediaFile } from '../../core/types';
import {
  getDisplayName,
  isMediaFileImage,
  isMediaFileVideo,
} from '../utils/mediaUtils';
import { formatTime } from '../utils/timeUtils';

const props = defineProps<{
  item: MediaFile;
  imageExtensionsSet: Set<string>;
  videoExtensionsSet: Set<string>;
  mediaUrlGenerator: ((path: string) => string) | null;
  thumbnailUrlGenerator: ((path: string) => string) | null;
  failedImagePaths: Set<string>;
}>();

defineEmits<{
  (e: 'click', item: MediaFile): void;
  (e: 'image-error', item: MediaFile): void;
}>();

// We need to handle the case where props.imageExtensionsSet might be wrapped in a Ref/Object if passed incorrectly,
// OR simply ensure we access it correctly.
const isImage = computed(() => {
  // Defensive coding to handle potential non-unwrapped refs in tests/edge cases
  const set = props.imageExtensionsSet as unknown as { value?: Set<string> };
  let actualSet = props.imageExtensionsSet;
  if (
    set &&
    typeof (set as Set<string>).has !== 'function' &&
    set.value instanceof Set
  ) {
    actualSet = set.value;
  }
  return isMediaFileImage(props.item, actualSet);
});

const isVideo = computed(() => {
  const set = props.videoExtensionsSet as unknown as { value?: Set<string> };
  let actualSet = props.videoExtensionsSet;
  if (
    set &&
    typeof (set as Set<string>).has !== 'function' &&
    set.value instanceof Set
  ) {
    actualSet = set.value;
  }
  return isMediaFileVideo(props.item, actualSet);
});

const mediaUrl = computed(() => {
  if (!props.mediaUrlGenerator) return '';
  if (isVideo.value) {
    return props.mediaUrlGenerator(props.item.path) + '#t=0.001';
  } else if (isImage.value && props.thumbnailUrlGenerator) {
    return props.thumbnailUrlGenerator(props.item.path);
  }
  return props.mediaUrlGenerator(props.item.path);
});

const posterUrl = computed(() => {
  if (props.thumbnailUrlGenerator) {
    return props.thumbnailUrlGenerator(props.item.path);
  }
  return '';
});

const displayName = computed(() => getDisplayName(props.item));

const hasFailed = computed(() => props.failedImagePaths.has(props.item.path));

const handleImageError = (event: Event) => {
  if (!props.mediaUrlGenerator || hasFailed.value) return;

  const imgElement = event.target as HTMLImageElement;
  const rawFullUrl = props.mediaUrlGenerator(props.item.path);
  const fullUrlResolved = new URL(rawFullUrl, window.location.href).href;

  if (imgElement.src !== fullUrlResolved && mediaUrl.value !== rawFullUrl) {
    // Retry with full URL
    imgElement.src = rawFullUrl;
  } else {
    // Already tried full URL or it matches, so it's a real failure
    // We cannot mutate the prop, so we should rely on the parent updating the set
    props.failedImagePaths.add(props.item.path);
  }
};
</script>

<style scoped>
.grid-item {
  /* Enable GPU acceleration */
  will-change: border-color;
  transform: translateZ(0);

  /* Optimize rendering */
  backface-visibility: hidden;
  -webkit-font-smoothing: antialiased;
}

/* Simplified hover effect - no transitions */
.grid-item:hover {
  border-color: #ec4899;
}

/* Optimize image rendering */
.grid-item img,
.grid-item video {
  /* Force GPU acceleration */
  transform: translateZ(0);

  /* Optimize image rendering */
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
}
</style>
