<template>
  <div class="video-player-container relative w-full h-full">
    <!-- Video Element -->
    <video
      ref="videoElement"
      class="w-full h-full object-contain rounded-xl"
      :src="effectiveSrc"
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
      class="video-progress-bar-container z-60 cursor-pointer transition-transform-opacity duration-300 ease-in-out will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
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

      <!-- Heatmap Canvas -->
      <canvas
        ref="heatmapCanvas"
        class="absolute inset-0 w-full h-full pointer-events-none opacity-90 mix-blend-screen"
      ></canvas>
    </div>

    <!-- Heatmap Loading Indicator -->
    <Transition name="fade">
      <div
        v-if="isHeatmapLoading"
        class="absolute top-6 right-6 z-100 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-xl pointer-events-none shadow-2xl flex items-center gap-2"
      >
        <div class="loader-spinner"></div>
        <span class="font-medium tracking-wide antialiased"
          >Analyzing Scene... {{ heatmapProgress }}%</span
        >
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, computed, nextTick } from 'vue';
import PlayIcon from './icons/PlayIcon.vue';
import { formatTime } from '../utils/timeUtils';
import Hls from 'hls.js';
import { api } from '../api';
import type { HeatmapData } from '../../core/types';

const props = defineProps<{
  src: string | null;
  isTranscodingMode: boolean;
  isControlsVisible: boolean;
  transcodedDuration: number;
  currentTranscodeStartTime: number;
  isTranscodingLoading: boolean;
  isBuffering: boolean;
  initialTime?: number;
  filePath?: string;
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
const heatmapCanvas = ref<HTMLCanvasElement | null>(null);
const heatmapData = ref<HeatmapData | null>(null);
const isHeatmapLoading = ref(false);
const heatmapProgress = ref(0);
const watchedSegments = ref<{ start: number; end: number }[]>([]);
let lastTrackedTime = -1;
let lastSegmentsUpdate = Date.now();
const UPDATE_INTERVAL_MS = 5000; // Persist every 5s
const SEEK_DETECTION_THRESHOLD_S = 5;
const HEATMAP_MOTION_SCALE = 4;
const AUDIO_NORMALIZE_OFFSET = 60;
const AUDIO_NORMALIZE_RANGE = 60;

const hls = ref<Hls | null>(null);

const effectiveSrc = computed(() => {
  // If Hls.js is supported and it's an m3u8, we return undefined
  // so the video element doesn't try to load it natively (except via Hls.js attachment)
  if (props.src?.includes('.m3u8') && Hls.isSupported()) {
    return undefined;
  }
  return props.src || undefined;
});

const initHls = () => {
  if (hls.value) {
    hls.value.destroy();
    hls.value = null;
  }

  if (!props.src || !videoElement.value) return;

  if (props.src.includes('.m3u8')) {
    if (Hls.isSupported()) {
      const hlsInstance = new Hls();
      hls.value = hlsInstance;
      hlsInstance.loadSource(props.src);
      hlsInstance.attachMedia(videoElement.value);
      hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('HLS Fatal Error:', data);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hlsInstance.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hlsInstance.recoverMediaError();
              break;
            default:
              hlsInstance.destroy();
              break;
          }
        }
      });
    } else if (
      videoElement.value.canPlayType('application/vnd.apple.mpegurl')
    ) {
      videoElement.value.src = props.src;
    }
  }
};

onUnmounted(() => {
  if (hls.value) {
    hls.value.destroy();
  }
});

watch(videoElement, (el) => {
  emit('update:video-element', el);
  if (el && props.initialTime && props.initialTime > 0) {
    el.currentTime = props.initialTime;
  }
  initHls();
});

const fetchHeatmap = async () => {
  let filePath: string | null = props.filePath || null;

  if (
    !filePath &&
    props.src &&
    !props.src.startsWith('blob:') &&
    props.src.includes('?file=')
  ) {
    try {
      const url = new URL(props.src, window.location.origin);
      filePath = url.searchParams.get('file');
    } catch (e) {
      console.warn('Failed to parse heatmap file path from URL', e);
    }
  }

  if (!filePath) return;

  try {
    console.log('[VideoPlayer] Fetching heatmap for:', filePath);
    // Start polling for progress
    const pollInterval = setInterval(async () => {
      if (!isHeatmapLoading.value || heatmapData.value) {
        clearInterval(pollInterval);
        return;
      }
      try {
        const progress = await api.getHeatmapProgress(filePath!);
        if (progress !== null) {
          heatmapProgress.value = progress;
        }
      } catch (err: unknown) {
        const error = err as Error;
        if (error?.message?.includes('429')) {
          console.warn(
            '[VideoPlayer] Rate limited during progress poll. Slowing down.',
          );
          // Don't clear interval, but maybe next poll will succeed.
        } else {
          console.warn('[VideoPlayer] Progress poll failed:', err);
        }
      }
    }, 2000); // Poll slower (every 2s) to reduce request pressure

    try {
      isHeatmapLoading.value = true;
      heatmapProgress.value = 0;
      const data = await api.getHeatmap(filePath, 200); // 200 points
      if (data && data.points) {
        heatmapData.value = data;
        nextTick(drawHeatmap);
      }
    } catch (innerErr) {
      console.error('[VideoPlayer] API call failed:', innerErr);
    } finally {
      clearInterval(pollInterval);
      isHeatmapLoading.value = false;
    }
  } catch (e) {
    console.warn('Failed to fetch heatmap', e);
  }
};

const loadWatchedSegments = async () => {
  if (!props.filePath) return;
  try {
    const metaMap = await api.getMetadata([props.filePath]);
    const meta = metaMap[props.filePath];
    if (meta?.watchedSegments) {
      const parsed = JSON.parse(meta.watchedSegments);
      if (Array.isArray(parsed)) {
        watchedSegments.value = parsed;
        nextTick(drawHeatmap);
      }
    }
  } catch (e) {
    console.error('[VideoPlayer] Failed to load watched segments:', e);
  }
};

const persistWatchedSegments = async () => {
  if (!props.filePath || watchedSegments.value.length === 0) return;
  try {
    await api.updateWatchedSegments(
      props.filePath,
      JSON.stringify(watchedSegments.value),
    );
  } catch (e) {
    console.error('[VideoPlayer] Failed to persist watched segments:', e);
  }
};

// Watch src to reset state if needed
watch(
  () => props.src,
  () => {
    videoProgress.value = 0;
    currentVideoTime.value = 0;
    currentVideoDuration.value = 0;
    bufferedRanges.value = [];
    heatmapData.value = null; // Reset heatmap
    watchedSegments.value = []; // Reset watched segments for new file
    lastTrackedTime = -1;
    initHls();
    fetchHeatmap();
    loadWatchedSegments();
  },
  { immediate: true },
);

onUnmounted(() => {
  persistWatchedSegments();
  if (hls.value) {
    hls.value.destroy();
  }
});

// Watch for canvas availability (e.g. when controls become visible)
watch(heatmapCanvas, (el) => {
  if (el && heatmapData.value) {
    // Canvas is ready and we have data
    requestAnimationFrame(drawHeatmap);
  }
});

const drawHeatmap = () => {
  const canvas = heatmapCanvas.value;
  const data = heatmapData.value;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas.getBoundingClientRect();
  if (width === 0 || height === 0) return;

  canvas.width = width;
  canvas.height = height;

  ctx.clearRect(0, 0, width, height);

  // 1. Draw Watched Segments (Deep Cyan Background)
  const duration = props.isTranscodingMode
    ? props.transcodedDuration
    : videoElement.value?.duration || 0;
  if (duration > 0) {
    ctx.fillStyle = 'rgba(6, 182, 212, 0.25)';
    watchedSegments.value.forEach((seg) => {
      const xStart = (seg.start / duration) * width;
      const xEnd = (seg.end / duration) * width;
      ctx.fillRect(xStart, 0, xEnd - xStart, height);
    });
  }

  if (!data) return;

  const barWidth = width / data.points;

  // 2. Draw Motion (Vivid Fuchsia/Violet Gradient) - High intensity
  // Create a gradient for a more "liquid" feel
  const motionGrad = ctx.createLinearGradient(0, height, 0, 0);
  motionGrad.addColorStop(0, 'rgba(139, 92, 246, 0.4)'); // Violet-500
  motionGrad.addColorStop(1, 'rgba(236, 72, 153, 0.8)'); // Pink-500

  data.motion.forEach((val, i) => {
    const heightPx = Math.min(val * HEATMAP_MOTION_SCALE, height);
    ctx.fillStyle = motionGrad;
    ctx.fillRect(i * barWidth, height - heightPx, barWidth, heightPx);
  });

  // 3. Draw Audio (Cyber Cyan) - Overlay
  const audioGrad = ctx.createLinearGradient(0, height, 0, 0);
  audioGrad.addColorStop(0, 'rgba(6, 182, 212, 0.0)'); // Transparent
  audioGrad.addColorStop(1, 'rgba(34, 211, 238, 0.6)'); // Cyan-400

  data.audio.forEach((val, i) => {
    const norm = Math.max(
      0,
      (val + AUDIO_NORMALIZE_OFFSET) / AUDIO_NORMALIZE_RANGE,
    );
    const heightPx = norm * height;
    ctx.fillStyle = audioGrad;
    ctx.fillRect(i * barWidth, height - heightPx, barWidth, heightPx);
  });
};

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

  let realCurrentTime = currentTime;
  let realDuration = duration;

  if (props.isTranscodingMode && props.transcodedDuration > 0) {
    realCurrentTime = props.currentTranscodeStartTime + currentTime;
    realDuration = props.transcodedDuration;
  }

  // Update progress variables
  if (realDuration > 0 && realDuration !== Infinity) {
    videoProgress.value = (realCurrentTime / realDuration) * 100;
    currentVideoTime.value = realCurrentTime;
    currentVideoDuration.value = realDuration;
    emit('timeupdate', realCurrentTime);

    // Watch Tracking Logic: Add current segment to watchedSegments
    if (isPlaying.value) {
      if (lastTrackedTime === -1) {
        lastTrackedTime = realCurrentTime;
      } else {
        const delta = Math.abs(realCurrentTime - lastTrackedTime);
        // Only track if change is small (prevent jumps from marking everything as watched)
        if (delta > 0 && delta < SEEK_DETECTION_THRESHOLD_S) {
          addWatchedSegment(
            Math.min(lastTrackedTime, realCurrentTime),
            Math.max(lastTrackedTime, realCurrentTime),
          );
        }
        lastTrackedTime = realCurrentTime;
      }
    }

    // Periodic Persist
    if (Date.now() - lastSegmentsUpdate > UPDATE_INTERVAL_MS) {
      persistWatchedSegments();
      lastSegmentsUpdate = Date.now();
    }
  } else {
    videoProgress.value = 0;
    currentVideoTime.value = 0;
    currentVideoDuration.value = 0;
    emit('timeupdate', 0);
  }
};

/**
 * Merges a newly watched segment into the watchedSegments list.
 */
const addWatchedSegment = (start: number, end: number) => {
  const segments = [...watchedSegments.value];
  segments.push({ start, end });

  // Merge overlapping segments
  segments.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  if (segments.length > 0) {
    let current = segments[0];
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].start <= current.end + 0.5) {
        // Small gap tolerance
        current.end = Math.max(current.end, segments[i].end);
      } else {
        merged.push(current);
        current = segments[i];
      }
    }
    merged.push(current);
  }

  watchedSegments.value = merged;
  // Redraw heatmap to show updated watched segments
  requestAnimationFrame(drawHeatmap);
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
  height: 20px;
  background-color: rgba(0, 0, 0, 0.4);
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
}

.video-progress-bar {
  height: 100%;
  background-color: var(--accent-color);
  transition: width 0.1s linear;
  z-index: 50;
  box-shadow: 0 0 15px var(--accent-color);
}

.z-60 {
  z-index: 60;
}

.z-100 {
  z-index: 100;
}

.transition-transform-opacity {
  transition-property: transform, opacity;
}

.will-change-transform {
  will-change: transform, opacity;
}

.loader-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
