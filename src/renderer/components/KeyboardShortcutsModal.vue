<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      @click.self="close"
    >
      <div
        class="relative w-full max-w-md bg-gray-900/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl ring-1 ring-white/5 overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
      >
        <!-- Decorative top gradient -->
        <div
          class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 z-10"
        ></div>

        <!-- Header -->
        <div
          class="flex shrink-0 justify-between items-center p-4 border-b border-white/5"
        >
          <div>
            <h2 id="shortcuts-title" class="text-lg font-bold text-white">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            class="text-gray-500 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/50"
            aria-label="Close"
            @click="close"
          >
            <CloseIcon class="w-5 h-5" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-4 space-y-4">
          <!-- Navigation -->
          <div class="space-y-2">
            <h3
              class="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-2"
            >
              Navigation
            </h3>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-300">Previous Media</span>
              <kbd
                class="px-2 py-1 bg-white/10 rounded border border-white/20 font-mono text-xs text-white min-w-[28px] text-center"
                >Z</kbd
              >
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-300">Next Media</span>
              <kbd
                class="px-2 py-1 bg-white/10 rounded border border-white/20 font-mono text-xs text-white min-w-[28px] text-center"
                >X</kbd
              >
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-300">Toggle Shortcuts</span>
              <kbd
                class="px-2 py-1 bg-white/10 rounded border border-white/20 font-mono text-xs text-white min-w-[28px] text-center"
                >?</kbd
              >
            </div>
          </div>

          <!-- Playback -->
          <div class="space-y-2">
            <h3
              class="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-2"
            >
              Playback
            </h3>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-300">Play / Pause (Video)</span>
              <kbd
                class="px-2 py-1 bg-white/10 rounded border border-white/20 font-mono text-xs text-white"
                >Space</kbd
              >
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-300">Toggle Slideshow (Image)</span>
              <kbd
                class="px-2 py-1 bg-white/10 rounded border border-white/20 font-mono text-xs text-white"
                >Space</kbd
              >
            </div>
          </div>

          <!-- Seeking -->
          <div class="space-y-2">
            <h3
              class="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-2"
            >
              Seeking (Video)
            </h3>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-300">Seek Backward 5s</span>
              <kbd
                class="px-2 py-1 bg-white/10 rounded border border-white/20 font-mono text-xs text-white min-w-[28px] text-center"
                >←</kbd
              >
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-300">Seek Forward 5s</span>
              <kbd
                class="px-2 py-1 bg-white/10 rounded border border-white/20 font-mono text-xs text-white min-w-[28px] text-center"
                >→</kbd
              >
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-4 bg-white/5 border-t border-white/5 text-center">
          <button
            class="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm"
            @click="close"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import CloseIcon from './icons/CloseIcon.vue';
import { onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const close = () => {
  emit('close');
};

const handleKeydown = (e: KeyboardEvent) => {
  if (props.isOpen && e.key === 'Escape') {
    close();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>
