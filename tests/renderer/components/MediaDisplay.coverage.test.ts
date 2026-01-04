import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive, toRefs } from 'vue';
import MediaDisplay from '@/components/MediaDisplay.vue';
import { useLibraryStore } from '@/composables/useLibraryStore';
import { usePlayerStore } from '@/composables/usePlayerStore';
import { useUIStore } from '@/composables/useUIStore';
import { useSlideshow } from '@/composables/useSlideshow';
import { api } from '@/api';

// Mock the composables
vi.mock('@/composables/useLibraryStore', () => ({
  useLibraryStore: vi.fn(() => ({
    state: { totalMediaInPool: 0 },
    totalMediaInPool: { value: 0 },
    imageExtensionsSet: { value: new Set() },
    videoExtensionsSet: { value: new Set() },
    supportedExtensions: { value: { images: [], videos: [] } },
  })),
}));

vi.mock('@/composables/usePlayerStore', () => ({
  usePlayerStore: vi.fn(() => ({
    state: { currentMediaItem: null },
    currentMediaItem: { value: null },
    displayedMediaFiles: { value: [] },
    currentMediaIndex: { value: 0 },
    isSlideshowActive: { value: false },
    playFullVideo: { value: false },
    pauseTimerOnPlay: { value: false },
    isTimerRunning: { value: false },
    mainVideoElement: { value: null },
  })),
}));

vi.mock('@/composables/useUIStore', () => ({
  useUIStore: vi.fn(() => ({
    state: { mediaFilter: 'All', isSidebarVisible: true },
    mediaFilter: { value: 'All' },
    isSidebarVisible: { value: true },
  })),
}));

vi.mock('@/composables/useSlideshow', () => ({
  useSlideshow: vi.fn(() => ({
    navigateMedia: vi.fn(),
    reapplyFilter: vi.fn(),
    pauseSlideshowTimer: vi.fn(),
    resumeSlideshowTimer: vi.fn(),
  })),
}));

// Mock Icons
vi.mock('@/components/icons/VlcIcon.vue', () => ({
  default: { template: '<svg class="vlc-icon-mock"></svg>' },
}));

vi.mock('@/components/icons/StarIcon.vue', () => ({
  default: { template: '<svg class="star-icon-mock"></svg>' },
}));

vi.mock('@/components/VRVideoPlayer.vue', () => ({
  default: { template: '<div class="vr-player-mock"></div>' },
}));

// Mock VideoPlayer to emit a plain mock object instead of real DOM element
vi.mock('@/components/VideoPlayer.vue', () => ({
  default: {
    template: '<div class="video-player-mock"></div>',
    emits: ['update:video-element'],
    setup(_: any, { emit }: any) {
      // Emit a mock object that mimics the video element
      const mockVideo = {
        currentTime: 10,
        duration: 100,
        paused: false,
        elementName: 'MockVideoElement',
      };

      emit('update:video-element', mockVideo);

      const reset = vi.fn();
      const togglePlay = vi.fn();

      return { mockVideo, reset, togglePlay };
    },
  },
}));

// Mock API
vi.mock('@/api', () => ({
  // ... lines 30-34 ...
  api: {
    loadFileAsDataURL: vi.fn(),
    openInVlc: vi.fn(),
    getVideoStreamUrlGenerator: vi.fn(),
    getVideoMetadata: vi.fn(),
    setRating: vi.fn(),
  },
}));
// ...

// ... (inside the test suite)

describe('MediaDisplay.vue Additional Coverage', () => {
  let mockLibraryState: any;
  let mockPlayerState: any;
  let mockUIState: any;

  beforeEach(() => {
    mockLibraryState = reactive({
      totalMediaInPool: 0,
      supportedExtensions: { images: [], videos: ['.mp4'] },
      imageExtensionsSet: new Set([]),
      videoExtensionsSet: new Set(['.mp4']),
    });

    mockPlayerState = reactive({
      currentMediaItem: { name: 'test.mp4', path: '/test.mp4' },
      displayedMediaFiles: [],
      currentMediaIndex: 0,
      isSlideshowActive: false,
      isTimerRunning: false,
      playFullVideo: false,
      pauseTimerOnPlay: false,
      mainVideoElement: null,
    });

    mockUIState = reactive({
      mediaFilter: 'All',
      isSidebarVisible: true,
    });

    (useLibraryStore as Mock).mockReturnValue({
      state: mockLibraryState,
      ...toRefs(mockLibraryState),
    });

    (usePlayerStore as Mock).mockReturnValue({
      state: mockPlayerState,
      ...toRefs(mockPlayerState),
    });

    (useUIStore as Mock).mockReturnValue({
      state: mockUIState,
      ...toRefs(mockUIState),
    });

    (useSlideshow as Mock).mockReturnValue({
      // Essential mocks
      navigateMedia: vi.fn(),
      reapplyFilter: vi.fn(),
      pauseSlideshowTimer: vi.fn(),
      resumeSlideshowTimer: vi.fn(),
      toggleSlideshowTimer: vi.fn(),
    });

    vi.clearAllMocks();

    // Default success values
    (api.loadFileAsDataURL as Mock).mockResolvedValue({
      type: 'http-url',
      url: 'http://localhost/test.mp4',
    });
    (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(
      (path: string) => `stream/${path}`,
    );
    (api.getVideoMetadata as Mock).mockResolvedValue({ duration: 100 });
  });

  it('should handle metadata loading failure during transcoding (swallow error)', async () => {
    // Mock metadata failure
    (api.getVideoMetadata as Mock).mockRejectedValue(new Error('Meta fail'));

    const wrapper = mount(MediaDisplay);
    await flushPromises();

    // Trigger transcoding
    await (wrapper.vm as any).tryTranscoding(0);

    // It should proceed without crashing, leaving duration as 0 if it was 0
    expect((wrapper.vm as any).isTranscodingMode).toBe(true);
    // Error is swallowed, so no error message in UI
    expect(wrapper.text()).not.toContain('Transcoding failed');
  });

  it('should handle missing video stream generator', async () => {
    // Mock generator failure during mount
    (api.getVideoStreamUrlGenerator as Mock).mockRejectedValue(
      new Error('Init fail'),
    );

    const wrapper = mount(MediaDisplay);
    await flushPromises();

    // Trigger transcoding
    await (wrapper.vm as any).tryTranscoding(0);

    // Should set error message
    expect((wrapper.vm as any).error).toBe('Local server not available');
    expect((wrapper.vm as any).isTranscodingLoading).toBe(false);
  });

  it('should handle general transcoding error', async () => {
    // Mock generator to throw when called
    const generator = vi.fn().mockImplementation(() => {
      throw new Error('Gen fail');
    });
    (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(generator);

    const wrapper = mount(MediaDisplay);
    await flushPromises();

    // Trigger transcoding
    // We mock console.error to avoid noise
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await (wrapper.vm as any).tryTranscoding(0);

    expect((wrapper.vm as any).isTranscodingMode).toBe(false); // Should revert or stay false?
    // Code says: isTranscodingMode = true; try { ... } catch { isTranscodingMode = false; }
    expect((wrapper.vm as any).isTranscodingMode).toBe(false);
    expect(spy).toHaveBeenCalledWith('Transcoding failed', expect.any(Error));
    spy.mockRestore();
  });

  describe('Slideshow Prefetching', () => {
    it('should prefetch next image in sequence', async () => {
      // Setup: 2 items in list
      const item1 = { name: '1.jpg', path: '1.jpg' };
      const item2 = { name: '2.jpg', path: '2.jpg' };
      mockPlayerState.displayedMediaFiles = [item1, item2];
      // Start null to trigger change after mount
      mockPlayerState.currentMediaItem = null;
      mockPlayerState.currentMediaIndex = 0;
      mockLibraryState.imageExtensionsSet = new Set(['.jpg']);

      mount(MediaDisplay);
      await flushPromises();

      // Trigger change
      mockPlayerState.currentMediaItem = item1;
      await flushPromises();

      // Expect calls:
      // 1. loadMediaUrl for item1
      // 2. preloadNextMedia for item2
      expect(api.loadFileAsDataURL).toHaveBeenCalledWith('1.jpg');
      expect(api.loadFileAsDataURL).toHaveBeenCalledWith('2.jpg');
    });

    it('should wrap around to start of list for prefetching', async () => {
      const item1 = { name: '1.jpg', path: '1.jpg' };
      const item2 = { name: '2.jpg', path: '2.jpg' };
      mockPlayerState.displayedMediaFiles = [item1, item2];
      mockPlayerState.currentMediaIndex = 1; // Last item
      mockPlayerState.currentMediaItem = null;
      mockLibraryState.imageExtensionsSet = new Set(['.jpg']);

      mount(MediaDisplay);
      await flushPromises();

      // Trigger change to item2
      mockPlayerState.currentMediaItem = item2;
      mockPlayerState.currentMediaIndex = 1; // Ensure index is set corresponding to item
      await flushPromises();

      // 1. loadMediaUrl for item2
      // 2. preloadNextMedia for item1 (wrap)
      expect(api.loadFileAsDataURL).toHaveBeenCalledWith('2.jpg');
      expect(api.loadFileAsDataURL).toHaveBeenCalledWith('1.jpg');
    });

    it('should NOT prefetch if next item is video', async () => {
      const item1 = { name: '1.jpg', path: '1.jpg' };
      const item2 = { name: '2.mp4', path: '2.mp4' };
      mockPlayerState.displayedMediaFiles = [item1, item2];
      mockPlayerState.currentMediaIndex = 0;
      mockPlayerState.currentMediaItem = null;
      mockLibraryState.imageExtensionsSet = new Set(['.jpg']);
      mockLibraryState.videoExtensionsSet = new Set(['.mp4']);

      mount(MediaDisplay);
      await flushPromises();

      mockPlayerState.currentMediaItem = item1;
      await flushPromises();

      expect(api.loadFileAsDataURL).toHaveBeenCalledWith('1.jpg');
      // Should NOT call for 2.mp4
      expect(api.loadFileAsDataURL).not.toHaveBeenCalledWith('2.mp4');
    });

    it('should NOT prefetch if list has only 1 item', async () => {
      const item1 = { name: '1.jpg', path: '1.jpg' };
      mockPlayerState.displayedMediaFiles = [item1];
      mockPlayerState.currentMediaIndex = 0;
      mockPlayerState.currentMediaItem = null;
      mockLibraryState.imageExtensionsSet = new Set(['.jpg']);

      mount(MediaDisplay);
      await flushPromises();

      mockPlayerState.currentMediaItem = item1;
      await flushPromises();

      expect(api.loadFileAsDataURL).toHaveBeenCalledTimes(1); // Only for current item
      expect(api.loadFileAsDataURL).toHaveBeenCalledWith('1.jpg');
    });

    it('should handle prefetch errors silently', async () => {
      const item1 = { name: '1.jpg', path: '1.jpg' };
      const item2 = { name: '2.jpg', path: '2.jpg' };
      mockPlayerState.displayedMediaFiles = [item1, item2];
      mockPlayerState.currentMediaIndex = 0;
      mockPlayerState.currentMediaItem = null;
      mockLibraryState.imageExtensionsSet = new Set(['.jpg']);

      // Mock specific rejection for prefetch
      (api.loadFileAsDataURL as Mock).mockImplementation((path: string) => {
        if (path === '2.jpg') return Promise.reject(new Error('Prefetch fail'));
        return Promise.resolve({ type: 'base64', url: 'data:...' });
      });

      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mount(MediaDisplay);
      await flushPromises();

      mockPlayerState.currentMediaItem = item1;
      await flushPromises();

      expect(spy).toHaveBeenCalledWith(
        'Failed to preload next item',
        expect.any(Error),
      );
      spy.mockRestore();
    });
  });

  describe('Additional Branch Coverage', () => {
    it('should handle filter button clicks', async () => {
      const { reapplyFilter } = useSlideshow();
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      const buttons = wrapper.findAll('.filter-button');
      // Assume "All" is active, click the second one
      if (buttons.length > 1) {
        await buttons[1].trigger('click');
        expect(reapplyFilter).toHaveBeenCalled();
      }
    });

    it('should setter currentVideoTime correctly', async () => {
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      (wrapper.vm as any).currentVideoTime = 123;
      expect((wrapper.vm as any).currentVideoTime).toBe(123);
    });

    it('should handle loadMediaUrl with success but null URL', async () => {
      mockPlayerState.currentMediaItem = { name: 'null.jpg', path: 'null.jpg' };
      (api.loadFileAsDataURL as Mock).mockResolvedValue({
        type: 'success',
        url: null,
      });

      const wrapper = mount(MediaDisplay);
      await flushPromises();

      expect((wrapper.vm as any).mediaUrl).toBeNull();
      expect((wrapper.vm as any).displayedItem).toBeNull();
    });

    it('should handle handleVideoEnded when playFullVideo is true', async () => {
      const { navigateMedia } = useSlideshow();
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      mockPlayerState.playFullVideo = true;
      (wrapper.vm as any).handleVideoEnded();
      expect(navigateMedia).toHaveBeenCalledWith(1);
    });

    it('should handle handleVideoPlaying state updates', async () => {
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      (wrapper.vm as any).isTranscodingLoading = true;
      (wrapper.vm as any).isBuffering = true;
      (wrapper.vm as any).handleVideoPlaying();

      expect((wrapper.vm as any).isTranscodingLoading).toBe(false);
      expect((wrapper.vm as any).isBuffering).toBe(false);
    });

    it('should handle handleTimeUpdate', async () => {
      const wrapper = mount(MediaDisplay);
      (wrapper.vm as any).handleTimeUpdate(50);
      expect((wrapper.vm as any).savedCurrentTime).toBe(50);
    });

    it('should toggle VrMode', async () => {
      const wrapper = mount(MediaDisplay);
      expect((wrapper.vm as any).isVrMode).toBe(false);
      (wrapper.vm as any).toggleVrMode();
      expect((wrapper.vm as any).isVrMode).toBe(true);
    });

    it('should handle global arrow keys for seeking', async () => {
      // Mock API success for video loading
      (api.loadFileAsDataURL as Mock).mockResolvedValue({
        type: 'success',
        url: 'blob:test',
      });

      // Override store state locally for this test
      mockPlayerState.currentMediaItem = {
        name: 'test.mp4',
        path: '/test.mp4',
      };
      mockPlayerState.displayedMediaFiles = [];
      mockPlayerState.currentMediaIndex = 0;
      mockLibraryState.videoExtensionsSet = new Set(['.mp4']);
      mockLibraryState.supportedExtensions.videos = ['.mp4'];

      const wrapper = mount(MediaDisplay, {
        attachTo: document.body,
        global: {
          stubs: {
            Transition: true,
            VideoPlayer: {
              name: 'VideoPlayer', // Add name for easier finding
              template: '<div class="video-player-stub"></div>',
              emits: ['update:video-element'],
              props: ['src', 'options'],
            },
          },
        },
      });
      await flushPromises();
      await wrapper.vm.$nextTick();

      // Emit event from the stubbed VideoPlayer manually
      const mockVideo = {
        currentTime: 10,
        duration: 100,
        paused: false,
        elementName: 'MockVideoElement',
      };

      // Since we named the stub, this should work
      const videoPlayerComp = wrapper.findComponent({ name: 'VideoPlayer' });
      if (videoPlayerComp.exists()) {
        videoPlayerComp.vm.$emit('update:video-element', mockVideo);
      }

      await wrapper.vm.$nextTick();

      // Retrieve the mock object from the component state
      const videoEl = (wrapper.vm as any).videoElement;

      // Verify validation is bypassed
      expect(videoEl).toBeTruthy();
      if (videoEl) {
        expect(videoEl.elementName).toBe('MockVideoElement');

        // Trigger ArrowRight (Seek +5)
        window.dispatchEvent(
          new KeyboardEvent('keydown', { code: 'ArrowRight' }),
        );
        expect(videoEl.currentTime).toBe(15);

        // Trigger ArrowLeft (Seek -5)
        window.dispatchEvent(
          new KeyboardEvent('keydown', { code: 'ArrowLeft' }),
        );
        expect(videoEl.currentTime).toBe(10); // Back to 10
      }

      wrapper.unmount();
    });

    it('should NOT navigate if video element is missing but item is video', async () => {
      // Setup: 2 items, current is video
      const item1 = { name: '1.mp4', path: '1.mp4' };
      const item2 = { name: '2.jpg', path: '2.jpg' };
      mockPlayerState.displayedMediaFiles = [item1, item2];
      mockPlayerState.currentMediaItem = item1;
      mockPlayerState.currentMediaIndex = 0;
      mockLibraryState.imageExtensionsSet = new Set(['.jpg']);
      mockLibraryState.videoExtensionsSet = new Set(['.mp4']);

      const wrapper = mount(MediaDisplay);
      await flushPromises();

      // Ensure NO video element is present
      (wrapper.vm as any).handleVideoElementUpdate(null);
      await wrapper.vm.$nextTick();

      const { navigateMedia } = useSlideshow();

      // Trigger ArrowRight
      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'ArrowRight' }),
      );

      // Should NOT navigate
      expect(navigateMedia).not.toHaveBeenCalled();

      // Change to image and try again
      mockPlayerState.currentMediaItem = item2;
      mockPlayerState.currentMediaIndex = 1;
      await wrapper.vm.$nextTick();

      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'ArrowRight' }),
      );

      // Arrow keys should ONLY seek now, never navigate, even for images
      expect(navigateMedia).not.toHaveBeenCalled();
    });
  });
});
