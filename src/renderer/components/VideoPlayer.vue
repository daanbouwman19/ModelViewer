<template>
  <div class="video-player-container relative w-full h-full">
    <!-- Video Element -->
    <video
      ref="videoElement"
      class="w-full h-full object-contain rounded-xl shadow-2xl"
      :src="src || undefined"
      autoplay
      @error="handleError"
      @ended="handleEnded"
      @play="handlePlay"
      @playing="handlePlaying"
      @pause="handlePause"
      @timeupdate="handleTimeUpdate"
      @loadedmetadata="handleLoadedMetadata"
      @waiting="handleWaiting"
      @canplay="handleCanPlay"
      @progress="handleProgress"
      @click="togglePlay"
    />

    <!-- Pause Overlay -->
    <div
      v-if="!isPlaying && !isTranscodingLoading && !isBuffering"
      class="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
    >
      <button
        type="button"
        class="bg-black/40 p-4 rounded-full backdrop-blur-sm pointer-events-auto hover:bg-(--accent-color)/80 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
        aria-label="Play video"
        @click="togglePlay"
      >
        <PlayIcon class="w-12 h-12 text-white" />
      </button>
    </div>

    <!-- Progress Bar (Controls) -->
    <div
      v-if="isControlsVisible"
      data-testid="video-progress-bar"
      class="video-progress-bar-container cursor-pointer transition-transform-opacity duration-300 ease-in-out will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      role="slider"
      tabindex="0"
      aria-label="Seek video"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="videoProgress"
      :aria-valuetext="`${formatTime(currentVideoTime)} of ${formatTime(currentVideoDuration)}`"
      @click="handleProgressBarClick"
      @keydown="handleProgressBarKeydown"
    >
      <!-- Buffered Ranges -->
      <div
        v-for="(range, index) in bufferedRanges"
        :key="index"
        class="absolute h-full bg-white/30 rounded-full pointer-events-none transition-all duration-300"
        :style="{
          left: `${range.start}%`,
          width: `${range.end - range.start}%`,
        }"
      ></div>
      <div
        class="video-progress-bar"
        :style="{ width: `${videoProgress}%` }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import PlayIcon from './icons/PlayIcon.vue';

const props = defineProps<{
  src: string | null;
  isTranscodingMode: boolean;
  isControlsVisible: boolean;
  transcodedDuration: number;
  currentTranscodeStartTime: number;
  isTranscodingLoading: boolean;
  isBuffering: boolean;
  initialTime?: number;
}>();

const emit = defineEmits<{
  (e: 'play'): void;
  (e: 'pause'): void;
  (e: 'ended'): void;
  (e: 'error', error: Event): void;
  (e: 'trigger-transcode', time: number): void;
  (e: 'buffering', isBuffering: boolean): void;
  (e: 'playing'): void;
  (e: 'update:video-element', el: HTMLVideoElement | null): void;
  (e: 'timeupdate', time: number): void;
}>();

const videoElement = ref<HTMLVideoElement | null>(null);
const isPlaying = ref(false);
const videoProgress = ref(0);
const currentVideoTime = ref(0);
const currentVideoDuration = ref(0);
const bufferedRanges = ref<{ start: number; end: number }[]>([]);

watch(videoElement, (el) => {
  emit('update:video-element', el);
  if (el && props.initialTime && props.initialTime > 0) {
    el.currentTime = props.initialTime;
  }
});

// Watch src to reset state if needed
watch(
  () => props.src,
  () => {
    videoProgress.value = 0;
    currentVideoTime.value = 0;
    currentVideoDuration.value = 0;
    bufferedRanges.value = [];
    // Reset play state if autoplay is expected, but usually autoplay attribute handles it
  },
);

const togglePlay = () => {
  if (videoElement.value) {
    if (videoElement.value.paused) {
      videoElement.value.play?.()?.catch((error) => {
        console.error('Error attempting to play video:', error);
      });
    } else {
      videoElement.value.pause?.();
    }
  }
};

const reset = () => {
  if (videoElement.value) {
    videoElement.value.pause();
    videoElement.value.removeAttribute('src');
    videoElement.value.load();
  }
};

const handlePlay = () => {
  isPlaying.value = true;
  emit('play');
};

const handlePause = () => {
  isPlaying.value = false;
  emit('pause');
};

const handleEnded = () => {
  emit('ended');
};

const handleError = (e: Event) => {
  emit('error', e);
};

const handlePlaying = () => {
  emit('playing');
};

const handleWaiting = () => {
  emit('buffering', true);
};

const handleCanPlay = () => {
  emit('buffering', false);
};

const handleLoadedMetadata = (event: Event) => {
  const video = event.target as HTMLVideoElement;
  if (
    (video.videoWidth === 0 || video.videoHeight === 0) &&
    !props.isTranscodingMode
  ) {
    emit('trigger-transcode', 0);
  }
};

const handleTimeUpdate = (event: Event) => {
  const target = event.target as HTMLVideoElement;
  const { currentTime, duration } = target;

  if (props.isTranscodingMode && props.transcodedDuration > 0) {
    const realCurrentTime = props.currentTranscodeStartTime + currentTime;
    videoProgress.value = (realCurrentTime / props.transcodedDuration) * 100;
    currentVideoTime.value = realCurrentTime;
    currentVideoDuration.value = props.transcodedDuration;
    emit('timeupdate', realCurrentTime);
  } else if (duration > 0 && duration !== Infinity) {
    videoProgress.value = (currentTime / duration) * 100;
    currentVideoTime.value = currentTime;
    currentVideoDuration.value = duration;
    emit('timeupdate', currentTime);
  } else {
    videoProgress.value = 0;
    currentVideoTime.value = 0;
    currentVideoDuration.value = 0;
    emit('timeupdate', 0);
  }
};

const handleProgress = (event: Event) => {
  const video = event.target as HTMLVideoElement;
  if (!video.duration) return;

  const ranges = [];
  for (let i = 0; i < video.buffered.length; i++) {
    const start = (video.buffered.start(i) / video.duration) * 100;
    const end = (video.buffered.end(i) / video.duration) * 100;
    ranges.push({ start, end });
  }
  bufferedRanges.value = ranges;
};

const handleProgressBarClick = (event: MouseEvent) => {
  const container = event.currentTarget as HTMLElement;
  const rect = container.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const percentage = clickX / rect.width;

  if (props.isTranscodingMode) {
    if (props.transcodedDuration > 0) {
      const seekTime = percentage * props.transcodedDuration;
      emit('trigger-transcode', seekTime);
    }
  } else if (videoElement.value && videoElement.value.duration) {
    videoElement.value.currentTime = percentage * videoElement.value.duration;
  }
};

const handleProgressBarKeydown = (event: KeyboardEvent) => {
  const step = 5; // 5 seconds
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;

    if (props.isTranscodingMode) {
      if (props.transcodedDuration > 0) {
        const newTime = currentVideoTime.value + step * direction;
        const seekTime = Math.max(
          0,
          Math.min(newTime, props.transcodedDuration),
        );
        emit('trigger-transcode', seekTime);
      }
    } else if (videoElement.value && videoElement.value.duration) {
      const newTime = videoElement.value.currentTime + step * direction;
      videoElement.value.currentTime = Math.max(
        0,
        Math.min(newTime, videoElement.value.duration),
      );
    }
  }
};

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

defineExpose({
  togglePlay,
  reset,
  videoElement,
  videoProgress,
  currentVideoTime,
  currentVideoDuration,
  bufferedRanges,
  isPlaying,
  handleProgressBarClick,
  handleProgressBarKeydown,
  handleTimeUpdate,
  handleLoadedMetadata,
  formatTime,
});
</script>

<style scoped>
.video-progress-bar-container {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 8px;
  background-color: rgba(0, 0, 0, 0.3);
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
  overflow: hidden;
}

.video-progress-bar {
  height: 100%;
  background-color: var(--accent-color);
  transition: width 0.1s linear;
}

.transition-transform-opacity {
  transition-property: transform, opacity;
}

.will-change-transform {
  will-change: transform, opacity;
}
</style>
