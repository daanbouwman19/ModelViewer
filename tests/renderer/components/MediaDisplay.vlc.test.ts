import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref, reactive, toRefs } from 'vue';
import MediaDisplay from '@/components/MediaDisplay.vue';
import { useLibraryStore } from '@/composables/useLibraryStore';
import { usePlayerStore } from '@/composables/usePlayerStore';
import { useUIStore } from '@/composables/useUIStore';
import { useSlideshow } from '@/composables/useSlideshow';
import { api } from '@/api';

// Mock child components to avoid rendering complexity
vi.mock('@/components/VideoPlayer.vue', () => ({
  default: {
    name: 'VideoPlayer',
    template: '<div></div>',
    expose: ['reset', 'togglePlay'],
    setup() {
      return { reset: vi.fn(), togglePlay: vi.fn() };
    },
  },
}));
vi.mock('@/components/MediaControls.vue', () => ({
  default: {
    name: 'MediaControls',
    template: '<div></div>',
    props: ['isOpeningVlc'], // Ensure prop is recognized
  },
}));
vi.mock('@/components/TranscodingStatus.vue', () => ({
  default: { template: '<div></div>' },
}));
vi.mock('@/components/VRVideoPlayer.vue', () => ({
  default: { template: '<div></div>' },
}));

// Mock API
vi.mock('@/api', () => ({
  api: {
    loadFileAsDataURL: vi.fn(),
    getVideoStreamUrlGenerator: vi.fn(),
    getHlsUrl: vi.fn(),
    openInVlc: vi.fn(),
    updateWatchedSegments: vi.fn(),
  },
}));

// Mock composables
vi.mock('@/composables/useLibraryStore');
vi.mock('@/composables/usePlayerStore');
vi.mock('@/composables/useUIStore');
vi.mock('@/composables/useSlideshow');

describe('MediaDisplay.vue - VLC Integration', () => {
  let mockPlayerState: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPlayerState = reactive({
      currentMediaItem: { name: 'test.mp4', path: '/test.mp4' },
      displayedMediaFiles: [],
      currentMediaIndex: 0,
      playFullVideo: false,
      pauseTimerOnPlay: false,
      isTimerRunning: false,
      mainVideoElement: null,
    });

    (useLibraryStore as Mock).mockReturnValue({
      state: {},
      imageExtensionsSet: ref(new Set(['.jpg'])),
      mediaDirectories: ref([{ path: '/test' }]),
    });

    (usePlayerStore as Mock).mockReturnValue({
      state: mockPlayerState,
      ...toRefs(mockPlayerState),
    });

    (useUIStore as Mock).mockReturnValue({
      state: {},
      isControlsVisible: ref(true),
      isSourcesModalVisible: ref(false),
    });

    (useSlideshow as Mock).mockReturnValue({
      navigateMedia: vi.fn(),
      pauseSlideshowTimer: vi.fn(),
      resumeSlideshowTimer: vi.fn(),
      toggleSlideshowTimer: vi.fn(),
    });

    (api.loadFileAsDataURL as Mock).mockResolvedValue({
      type: 'success',
      url: 'test-url',
    });
    (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(
      () => 'stream-url',
    );
  });

  it('sets isOpeningVlc state correctly during successful open', async () => {
    const wrapper = mount(MediaDisplay);
    await flushPromises();

    // Mock successful VLC open
    let resolveOpen: (val: any) => void;
    const openPromise = new Promise((resolve) => {
      resolveOpen = resolve;
    });
    (api.openInVlc as Mock).mockReturnValue(openPromise);

    // Initial state
    const vm = wrapper.vm as any;
    expect(vm.isOpeningVlc).toBe(false);

    // Trigger open
    const actionPromise = vm.openInVlc();

    // State should be true while pending
    expect(vm.isOpeningVlc).toBe(true);
    expect(api.openInVlc).toHaveBeenCalledWith('/test.mp4');

    // Resolve promise
    resolveOpen!({ success: true });
    await actionPromise;

    // State should be false after completion
    expect(vm.isOpeningVlc).toBe(false);
    expect(vm.error).toBeNull();
  });

  it('pauses video player when opening VLC', async () => {
    const wrapper = mount(MediaDisplay);
    await flushPromises();

    const mockVideo = { pause: vi.fn() };
    (wrapper.vm as any).videoElement = mockVideo;

    (api.openInVlc as Mock).mockResolvedValue({ success: true });

    await (wrapper.vm as any).openInVlc();

    expect(mockVideo.pause).toHaveBeenCalled();
  });

  it('prevents multiple calls while opening (idempotency)', async () => {
    const wrapper = mount(MediaDisplay);
    await flushPromises();

    // Mock slow API
    (api.openInVlc as Mock).mockReturnValue(new Promise(() => {}));

    const vm = wrapper.vm as any;

    // First call
    vm.openInVlc();
    expect(api.openInVlc).toHaveBeenCalledTimes(1);
    expect(vm.isOpeningVlc).toBe(true);

    // Second call
    vm.openInVlc();
    expect(api.openInVlc).toHaveBeenCalledTimes(1); // Still 1
  });

  it('resets isOpeningVlc to false even if API fails', async () => {
    const wrapper = mount(MediaDisplay);
    await flushPromises();

    (api.openInVlc as Mock).mockRejectedValue(new Error('Network error'));

    const vm = wrapper.vm as any;

    try {
      await vm.openInVlc();
    } catch {
      // Expected
    }

    expect(vm.isOpeningVlc).toBe(false);
    // Note: The catch block in implementation doesn't set error on throw,
    // it sets error on result.success=false.
    // If api.openInVlc throws, it bubbles up or is uncaught in this test context?
    // Looking at implementation:
    // try { const result = ... } finally { isOpeningVlc = false }
    // It doesn't catch exceptions!
    // Wait, the implementation looks like:
    /*
      try {
        const result = await api.openInVlc(currentMediaItem.value.path);
        if (!result.success) {
          error.value = result.message || 'Failed to open in VLC.';
        }
      } finally {
        isOpeningVlc.value = false;
      }
    */
    // So if api.openInVlc throws (which it might if IPC fails), it will bubble up.
    // Ideally we should catch it or the API wrapper handles it.
    // Assuming API wrapper handles IPC errors and returns result object?
    // If not, the unhandled rejection might be an issue.
    // But for this test coverage, ensuring finally block runs is key.
  });

  it('handles result.success = false', async () => {
    const wrapper = mount(MediaDisplay);
    await flushPromises();

    (api.openInVlc as Mock).mockResolvedValue({
      success: false,
      message: 'Failed',
    });

    const vm = wrapper.vm as any;
    await vm.openInVlc();

    expect(vm.isOpeningVlc).toBe(false);
    expect(vm.error).toBe('Failed');
  });

  it('does nothing if currentMediaItem is null', async () => {
    const wrapper = mount(MediaDisplay);
    await flushPromises();

    mockPlayerState.currentMediaItem = null;

    const vm = wrapper.vm as any;
    await vm.openInVlc();

    expect(api.openInVlc).not.toHaveBeenCalled();
    expect(vm.isOpeningVlc).toBe(false);
  });
});
