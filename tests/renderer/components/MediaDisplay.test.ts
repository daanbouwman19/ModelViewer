import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import MediaDisplay from '@/components/MediaDisplay.vue';
import { useAppState } from '@/composables/useAppState';
import { useSlideshow } from '@/composables/useSlideshow';
import { api } from '@/api';

// Mock dependencies
vi.mock('@/composables/useAppState');
vi.mock('@/composables/useSlideshow');

// Mock Components
vi.mock('@/components/icons/VlcIcon.vue', () => ({
  default: { template: '<div data-testid="vlc-icon"></div>' },
}));
vi.mock('@/components/icons/StarIcon.vue', () => ({
  default: { template: '<div data-testid="star-icon"></div>' },
}));

// Mock API
vi.mock('@/api', () => ({
  api: {
    loadFileAsDataURL: vi.fn(),
    openInVlc: vi.fn(),
    getVideoStreamUrlGenerator: vi.fn(),
    getVideoMetadata: vi.fn(),
    setRating: vi.fn(),
  },
}));

describe('MediaDisplay.vue', () => {
  let mockRefs: any;
  let mockSlideshow: any;
  let loadMediaReject: ((err: any) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRefs = {
      mediaFilter: ref('All'),
      currentMediaItem: ref(null),
      displayedMediaFiles: ref([]),
      currentMediaIndex: ref(-1),
      isSlideshowActive: ref(false),
      isTimerRunning: ref(false),
      timerDuration: ref(30),
      supportedExtensions: ref({
        images: ['.jpg', '.png', '.gif'],
        videos: ['.mp4', '.webm', '.mkv', '.avi'],
        all: ['.jpg', '.png', '.mp4', '.mkv', '.avi'],
      }),
      allAlbums: ref([]),
      albumsSelectedForSlideshow: ref({}),
      globalMediaPoolForSelection: ref([]),
      totalMediaInPool: ref(0),
      slideshowTimerId: ref(null),
      isSourcesModalVisible: ref(false),
      mediaDirectories: ref([]),
      playFullVideo: ref(false),
      pauseTimerOnPlay: ref(false),
      mainVideoElement: ref(null),
      state: {},
      initializeApp: vi.fn(),
      resetState: vi.fn(),
      stopSlideshow: vi.fn(),
    };

    mockSlideshow = {
      setFilter: vi.fn(),
      prevMedia: vi.fn(),
      nextMedia: vi.fn(),
      toggleTimer: vi.fn(),
      reapplyFilter: vi.fn(),
      navigateMedia: vi.fn(),
      toggleSlideshowTimer: vi.fn(),
      pauseSlideshowTimer: vi.fn(),
      resumeSlideshowTimer: vi.fn(),
      toggleAlbumSelection: vi.fn(),
      startSlideshow: vi.fn(),
      startIndividualAlbumSlideshow: vi.fn(),
      pickAndDisplayNextMediaItem: vi.fn(),
      filterMedia: vi.fn(),
      selectWeightedRandom: vi.fn(),
    };

    (useAppState as Mock).mockReturnValue(mockRefs);
    (useSlideshow as Mock).mockReturnValue(mockSlideshow);

    // Default API mocks
    (api.loadFileAsDataURL as Mock).mockResolvedValue({
      type: 'http-url',
      url: 'http://localhost/default.jpg',
    });
    (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(
      (path: string) => `stream/${encodeURIComponent(path)}`,
    );
    (api.openInVlc as Mock).mockResolvedValue({ success: true });
    (api.getVideoMetadata as Mock).mockResolvedValue({ duration: 100 });
  });

  const mountComponent = () =>
    mount(MediaDisplay, {
      global: {
        stubs: {
          teleport: true,
        },
      },
      attachTo: document.body, // Needed for trigger click/focus events sometimes
    });

  describe('Rendering & State', () => {
    it('renders placeholder when no media', () => {
      const wrapper = mountComponent();
      expect(wrapper.text()).toContain('Media will appear here');
    });

    it('displays title based on slideshow state', async () => {
      const wrapper = mountComponent();
      expect(wrapper.find('h2').text()).toBe(
        'Select albums and start slideshow',
      );

      mockRefs.isSlideshowActive.value = true;
      await wrapper.vm.$nextTick();
      expect(wrapper.find('h2').text()).toBe('Slideshow');
    });

    it('renders navigation buttons', () => {
      const wrapper = mountComponent();
      expect(wrapper.findAll('button').length).toBeGreaterThan(0);
    });

    it('shows loading state', async () => {
      // Create a pending promise to simulate loading
      (api.loadFileAsDataURL as Mock).mockImplementation(
        () => new Promise(() => {}),
      );

      const wrapper = mountComponent();
      mockRefs.currentMediaItem.value = { name: 'test.jpg', path: '/test.jpg' };
      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toContain('Loading media...');
    });

    it('shows error state', async () => {
      (api.loadFileAsDataURL as Mock).mockResolvedValue({
        type: 'error',
        message: 'Fail',
      });

      const wrapper = mountComponent();
      mockRefs.currentMediaItem.value = { name: 'test.jpg', path: '/test.jpg' };
      await flushPromises();

      expect(wrapper.text()).toContain('Failed to load media file');
    });
  });

  describe('Media Loading', () => {
    it('displays image when loaded', async () => {
      (api.loadFileAsDataURL as Mock).mockResolvedValue({
        type: 'data-url',
        url: 'data:image/png;base64,abc',
      });
      mockRefs.currentMediaItem.value = { name: 'test.jpg', path: '/test.jpg' };

      const wrapper = mountComponent();
      await flushPromises();

      expect(wrapper.find('img').exists()).toBe(true);
      expect(wrapper.find('video').exists()).toBe(false);
    });

    it('displays video when loaded', async () => {
      (api.loadFileAsDataURL as Mock).mockResolvedValue({
        type: 'http-url',
        url: 'http://localhost/vid.mp4',
      });
      mockRefs.currentMediaItem.value = { name: 'vid.mp4', path: '/vid.mp4' };

      const wrapper = mountComponent();
      await flushPromises();

      expect(wrapper.find('video').exists()).toBe(true);
    });

    it('handles race conditions (new item loading while old fails)', async () => {
      // Setup controllable promise
      (api.loadFileAsDataURL as Mock).mockImplementation(() => {
        return new Promise((_resolve, reject) => {
          loadMediaReject = reject;
        });
      });

      const wrapper = mountComponent();
      const vm = wrapper.vm as any; // Still using vm to check internal state if needed, or check UI

      // 1. Load Item A
      mockRefs.currentMediaItem.value = { name: 'A.jpg', path: '/A.jpg' };
      await wrapper.vm.$nextTick();
      const rejectA = loadMediaReject;

      // 2. Load Item B immediately
      mockRefs.currentMediaItem.value = { name: 'B.jpg', path: '/B.jpg' };
      await wrapper.vm.$nextTick();

      // 3. Fail Item A
      if (rejectA) rejectA(new Error('Old failure'));
      await flushPromises();

      // Should still be loading B, no error shown for A
      expect(vm.isLoading).toBe(true);
      expect(wrapper.text()).toContain('Loading media...');
      // And error message should NOT be present
      expect(wrapper.text()).not.toContain('Failed to load media file');
    });
  });

  describe('Transcoding', () => {
    it('auto-transcodes legacy formats (mkv)', async () => {
      mockRefs.currentMediaItem.value = { name: 'test.mkv', path: '/test.mkv' };
      const wrapper = mountComponent();
      await flushPromises();
      // It triggers transcoding async. We can check if "Transcoding" text appears or specialized UI.
      // But initially it sets loading.
      // We can check internal state via any cast if we really need to, or rely on side effects.
      // Here we trust the previous test logic:
      expect((wrapper.vm as any).isTranscodingMode).toBe(true);
    });

    it('handles transcoding error', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      // Mock generator to fail
      const generator = vi.fn().mockImplementation(() => {
        throw new Error('Gen fail');
      });
      (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(generator);

      // Trigger transcoding by setting a legacy item
      mockRefs.currentMediaItem.value = { name: 'test.mkv', path: '/test.mkv' };
      mountComponent();
      await flushPromises();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Transcoding failed',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });

    it('updates UI during transcoding loading', async () => {
      mockRefs.currentMediaItem.value = { name: 'test.mkv', path: '/test.mkv' };
      const wrapper = mountComponent();
      await flushPromises();

      expect(wrapper.text()).toContain('Transcoding');
    });
  });

  describe('Video Controls & Interaction', () => {
    it('handles video playback controls (Play/Pause timer)', async () => {
      mockRefs.currentMediaItem.value = { name: 'vid.mp4', path: '/vid.mp4' };
      mockRefs.isTimerRunning.value = true;
      mockRefs.pauseTimerOnPlay.value = true;
      const wrapper = mountComponent();
      await flushPromises();

      const video = wrapper.find('video');
      expect(video.exists()).toBe(true);

      // Play logic: should pause timer
      await video.trigger('play');
      expect(mockSlideshow.pauseSlideshowTimer).toHaveBeenCalled();

      // Pause logic: should resume timer if configured
      await video.trigger('pause');
      expect(mockSlideshow.resumeSlideshowTimer).toHaveBeenCalled();
    });

    it('handles video ended event', async () => {
      mockRefs.currentMediaItem.value = { name: 'vid.mp4', path: '/vid.mp4' };
      mockRefs.playFullVideo.value = true;
      const wrapper = mountComponent();
      await flushPromises();

      const video = wrapper.find('video');
      await video.trigger('ended');

      expect(mockSlideshow.navigateMedia).toHaveBeenCalledWith(1);
    });

    it('updates time on timeupdate event', async () => {
      mockRefs.currentMediaItem.value = { name: 'vid.mp4', path: '/vid.mp4' };
      const wrapper = mountComponent();
      await flushPromises();

      const video = wrapper.find('video');
      const videoEl = video.element as HTMLVideoElement;

      // Manually set properties on the DOM element
      Object.defineProperty(videoEl, 'currentTime', {
        writable: true,
        value: 10,
      });
      Object.defineProperty(videoEl, 'duration', {
        writable: true,
        value: 100,
      });

      await video.trigger('timeupdate');

      // Check if progress bar exists and implicitly validates state
      const progressBar = wrapper.find('.video-progress-bar-container');
      expect(progressBar.exists()).toBe(true);
      expect(progressBar.attributes('aria-valuenow')).toBe('10');
    });

    it('handles video error event', async () => {
      mockRefs.currentMediaItem.value = { name: 'vid.mp4', path: '/vid.mp4' };
      const wrapper = mountComponent();
      await flushPromises();

      const video = wrapper.find('video');

      // Simulate error
      await video.trigger('error');
      // If error happens, it might try to transcode or show error.
      // In default non-transcode mode, it calls tryTranscoding(0).
      // We can check if isTranscodingMode becomes true.
      expect((wrapper.vm as any).isTranscodingMode).toBe(true);
    });

    it('handles progress bar interaction', async () => {
      mockRefs.currentMediaItem.value = { name: 'vid.mp4', path: '/vid.mp4' };
      const wrapper = mountComponent();
      await flushPromises();

      const progressBar = wrapper.find('[data-testid="video-progress-bar"]');
      expect(progressBar.exists()).toBe(true);

      const videoEl = wrapper.find('video').element as HTMLVideoElement;
      Object.defineProperty(videoEl, 'duration', {
        writable: true,
        value: 100,
      });

      // Mock getBoundingClientRect
      vi.spyOn(progressBar.element, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        width: 100,
        top: 0,
        bottom: 0,
        right: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Click at 50px (50% of 100px width)
      await progressBar.trigger('click', { clientX: 50 });

      expect(videoEl.currentTime).toBe(50);
    });
  });

  describe('VLC & Rating', () => {
    it('opens in VLC', async () => {
      mockRefs.currentMediaItem.value = { name: 'vid.mp4', path: '/vid.mp4' };
      const wrapper = mountComponent();
      await flushPromises();

      // Find VLC button
      const vlcBtn = wrapper.find('button[aria-label="Open in VLC"]');
      expect(vlcBtn.exists()).toBe(true);

      // Pause is called on video when VLC opens
      const video = wrapper.find('video');
      const pauseSpy = vi.spyOn(video.element as HTMLVideoElement, 'pause');

      await vlcBtn.trigger('click');

      expect(api.openInVlc).toHaveBeenCalledWith('/vid.mp4');
      expect(pauseSpy).toHaveBeenCalled();
    });

    it('sets rating', async () => {
      mockRefs.currentMediaItem.value = {
        name: 'img.jpg',
        path: '/img.jpg',
        rating: 0,
      };
      const wrapper = mountComponent();
      await flushPromises();

      // Find rating stars
      const starBtns = wrapper.findAll('.media-info button');
      // Assuming 5 stars, click the 5th one (index 4)
      expect(starBtns.length).toBe(5);

      await starBtns[4].trigger('click');

      expect(api.setRating).toHaveBeenCalledWith('/img.jpg', 5);
      expect(mockRefs.currentMediaItem.value.rating).toBe(5);
    });
  });

  describe('Navigation', () => {
    it('navigates previous via button', async () => {
      mockRefs.displayedMediaFiles.value = [{}, {}]; // Ensure canNavigate is true
      const wrapper = mountComponent();

      const prevBtn = wrapper.find('button[aria-label="Previous media"]');
      await prevBtn.trigger('click');

      expect(mockSlideshow.navigateMedia).toHaveBeenCalledWith(-1);
    });

    it('navigates next via button', async () => {
      mockRefs.displayedMediaFiles.value = [{}, {}];
      const wrapper = mountComponent();

      const nextBtn = wrapper.find('button[aria-label="Next media"]');
      await nextBtn.trigger('click');

      expect(mockSlideshow.navigateMedia).toHaveBeenCalledWith(1);
    });
  });
});
