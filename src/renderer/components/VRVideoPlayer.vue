<template>
  <div ref="container" class="vr-container relative w-full h-full bg-black">
    <!-- Overlay for when video is not playing/loading, if needed -->
    <div
      v-if="!isPlaying"
      class="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
    >
      <!-- Optional: Play icon or similar overlay -->
    </div>

    <!-- VR Controls Overlay -->
    <div class="absolute top-4 left-4 z-20 flex gap-2">
      <button
        class="bg-black/50 text-white px-3 py-1 rounded-full text-xs hover:bg-black/70 border border-white/20 backdrop-blur-sm"
        @click="toggleStereo"
      >
        {{ isStereo ? 'Mode: 3D (SBS)' : 'Mode: 2D (Mono)' }}
      </button>
      <button
        class="bg-black/50 text-white px-3 py-1 rounded-full text-xs hover:bg-black/70 border border-white/20 backdrop-blur-sm"
        @click="toggleFullscreen"
      >
        Fullscreen
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const STEREO_ASPECT_RATIO_THRESHOLD = 1.9;
const SPHERE_RADIUS = 500;
const SPHERE_WIDTH_SEGMENTS = 60;
const SPHERE_HEIGHT_SEGMENTS = 40;

const props = defineProps<{
  src: string;
  isPlaying: boolean;
  initialTime?: number;
}>();

const emit = defineEmits<{
  (e: 'timeupdate', time: number): void;
}>();

const container = ref<HTMLElement | null>(null);
const isStereo = ref(false);

// Three.js instances
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let controls: OrbitControls | null = null;
let video: HTMLVideoElement | null = null;
let videoTexture: THREE.VideoTexture | null = null;
let animationId: number | null = null;

const toggleStereo = () => {
  isStereo.value = !isStereo.value;
  updateTextureMapping();
};

const toggleFullscreen = () => {
  if (!container.value) return;

  if (!document.fullscreenElement) {
    container.value.requestFullscreen().catch((err) => {
      console.warn(`Error attempting to enable fullscreen: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
};

const updateTextureMapping = () => {
  if (!videoTexture) return;

  // Need to update the texture transform
  if (isStereo.value) {
    // Side-by-Side: Show left eye only (left half of texture)
    // Repeat X = 0.5 (show half width)
    // Offset X = 0 (start from left)
    videoTexture.repeat.set(0.5, 1);
    videoTexture.offset.set(0, 0);
  } else {
    // Mono: Full texture
    videoTexture.repeat.set(1, 1);
    videoTexture.offset.set(0, 0);
  }
};

const checkAspectRatioAndSetMode = () => {
  if (!video) return;
  const { videoWidth, videoHeight } = video;
  if (videoWidth && videoHeight) {
    const ar = videoWidth / videoHeight;
    // SBS 180 videos are typically 2:1 (e.g. 5760x2880) or similar.
    // Standard 16:9 is 1.77.
    // Let's use 1.9 as threshold.
    if (ar > STEREO_ASPECT_RATIO_THRESHOLD) {
      isStereo.value = true;
    } else {
      isStereo.value = false;
    }
    updateTextureMapping();
  }
};

const handleTimeUpdate = () => {
  if (video) emit('timeupdate', video.currentTime);
};

const handleLoadedMetadata = () => {
  checkAspectRatioAndSetMode();
};

const initThree = () => {
  if (!container.value) return;

  // Scene
  scene = new THREE.Scene();

  // Camera - Offset slightly for OrbitControls to work (non-zero radius)
  const width = container.value.clientWidth;
  const height = container.value.clientHeight;
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  // Reset camera position logic if needed, but 0,0,0.1 is fine for initial
  camera.position.set(0, 0, 0.1);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  container.value.appendChild(renderer.domElement);

  // Video Element (off-screen)
  video = document.createElement('video');
  video.src = props.src;
  video.loop = true;
  video.muted = false; // Muted by default or handle volume
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.setAttribute('webkit-playsinline', 'true'); // iOS support

  // Sync initial time
  if (props.initialTime) {
    video.currentTime = props.initialTime;
  }

  if (props.isPlaying) {
    video.play().catch((e) => console.warn('Autoplay prevented:', e));
  }

  // Listen for time updates
  video.addEventListener('timeupdate', handleTimeUpdate);

  // Detect metadata for AR
  video.addEventListener('loadedmetadata', handleLoadedMetadata);

  // Texture
  videoTexture = new THREE.VideoTexture(video);
  videoTexture.colorSpace = THREE.SRGBColorSpace;
  videoTexture.wrapS = THREE.ClampToEdgeWrapping; // Important for non-power-2 videos sometimes
  videoTexture.wrapT = THREE.ClampToEdgeWrapping;

  updateTextureMapping();

  // Geometry: Half sphere for 180 video
  // Radius 500, 60 width segments, 40 height segments
  // phiStart: 0, phiLength: Math.PI (180 degrees)
  const geometry = new THREE.SphereGeometry(
    SPHERE_RADIUS,
    SPHERE_WIDTH_SEGMENTS,
    SPHERE_HEIGHT_SEGMENTS,
    0,
    Math.PI,
    0,
    Math.PI,
  );
  // Invert geometry to view from inside
  geometry.scale(-1, 1, 1);

  const material = new THREE.MeshBasicMaterial({ map: videoTexture });
  const mesh = new THREE.Mesh(geometry, material);

  // Rotate mesh to align correctly (adjust as needed based on source format)
  // Usually 180 videos are centered at -Z, so we might need -90 rotation on Y if it starts at 0
  mesh.rotation.y = -Math.PI / 2;

  scene.add(mesh);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0); // Orbit around center
  controls.enableZoom = false; // Disable zoom
  controls.enablePan = false; // Disable pan
  controls.enableDamping = true; // Smooth movement
  controls.dampingFactor = 0.05;
  controls.rotateSpeed = -0.5; // Drag direction natural feel
  controls.update();

  // Resize listener
  window.addEventListener('resize', handleResize);

  // Start loop
  animate();
};

const handleResize = () => {
  if (!container.value || !camera || !renderer) return;
  const width = container.value.clientWidth;
  const height = container.value.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
};

const animate = () => {
  animationId = requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
};

onMounted(() => {
  // Wait for container lay out
  nextTick(() => {
    initThree();
  });
});

onBeforeUnmount(() => {
  if (animationId) cancelAnimationFrame(animationId);
  window.removeEventListener('resize', handleResize);

  if (renderer) {
    renderer.dispose();
  }
  if (video) {
    video.pause();
    video.src = '';
    video.load();
  }
  if (container.value && renderer) {
    container.value.removeChild(renderer.domElement);
  }
});

// Watch src changes
watch(
  () => props.src,
  (newSrc) => {
    if (video) {
      video.src = newSrc;
      video.load();
      if (props.isPlaying) video.play().catch(() => {});
    }
  },
);

// Watch playing state
watch(
  () => props.isPlaying,
  (newVal) => {
    if (!video) return;
    if (newVal) {
      video.play().catch((e) => console.warn('Play failed', e));
    } else {
      video.pause();
    }
  },
);

defineExpose({
  handleTimeUpdate,
  handleLoadedMetadata,
  initThree,
});
</script>

<style scoped>
.vr-container {
  overflow: hidden;
  cursor: grab;
}
.vr-container:active {
  cursor: grabbing;
}
</style>
