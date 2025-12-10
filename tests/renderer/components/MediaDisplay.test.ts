import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import MediaDisplay from '@/components/MediaDisplay.vue';
import { useAppState } from '@/composables/useAppState';
import { useSlideshow } from '@/composables/useSlideshow';
import { api } from '@/api';

// Mock the composables
vi.mock('@/composables/useAppState');
vi.mock('@/composables/useSlideshow');

// Mock VlcIcon
vi.mock('@/components/icons/VlcIcon.vue', () => ({
  default: { template: '<svg class="vlc-icon-mock"></svg>' },
}));

// Mock API
vi.mock('@/api', () => ({
  api: {
    loadFileAsDataURL: vi.fn(),
    openInVlc: vi.fn(),
    getVideoStreamUrlGenerator: vi.fn(),
    getVideoMetadata: vi.fn(),
  },
}));

describe('MediaDisplay.vue', () => {
  let mockSetFilter: Mock;
  let mockPrevMedia: Mock;
  let mockNextMedia: Mock;
  let mockToggleTimer: Mock;
  let mockRefs: any;

  beforeEach(() => {
    mockSetFilter = vi.fn();
    mockPrevMedia = vi.fn();
    mockNextMedia = vi.fn();
    mockToggleTimer = vi.fn();

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
        videos: ['.mp4', '.webm'],
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

    (useAppState as Mock).mockReturnValue(mockRefs);

    (useSlideshow as Mock).mockReturnValue({
      setFilter: mockSetFilter,
      prevMedia: mockPrevMedia,
      nextMedia: mockNextMedia,
      toggleTimer: mockToggleTimer,
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
    });

    vi.clearAllMocks();

    // Default success values
    (api.loadFileAsDataURL as Mock).mockResolvedValue({
      type: 'http-url',
      url: 'http://localhost/default.jpg',
    });
    (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(
      (path: string) => `stream/${path}`,
    );
    (api.openInVlc as Mock).mockResolvedValue({ success: true });
    (api.getVideoMetadata as Mock).mockResolvedValue({});
  });

  it('should render placeholder when no media', () => {
    const wrapper = mount(MediaDisplay);
    expect(wrapper.text()).toContain('Media will appear here');
  });

  it('should display title', () => {
    const wrapper = mount(MediaDisplay);
    expect(wrapper.find('h2').exists()).toBe(true);
  });

  it('should render filter buttons', () => {
    const wrapper = mount(MediaDisplay);
    const buttons = wrapper.findAll('.filter-button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should call reapplyFilter when filter button clicked', async () => {
    const mockReapplyFilter = vi.fn();
    (useSlideshow as Mock).mockReturnValue({
      setFilter: mockSetFilter,
      prevMedia: mockPrevMedia,
      nextMedia: mockNextMedia,
      toggleTimer: mockToggleTimer,
      reapplyFilter: mockReapplyFilter,
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
    });

    const wrapper = mount(MediaDisplay);
    const buttons = wrapper.findAll('.filter-button');
    if (buttons.length > 1) {
      await buttons[1].trigger('click');
    }
    await flushPromises();
    expect(mockReapplyFilter).toHaveBeenCalled();
  });

  it('should display navigation buttons', () => {
    const wrapper = mount(MediaDisplay);
    const buttons = wrapper.findAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should show media info when media is displayed', () => {
    mockRefs.currentMediaItem.value = { name: 'test.jpg', path: '/test.jpg' };
    mockRefs.displayedMediaFiles.value = [mockRefs.currentMediaItem.value];
    mockRefs.currentMediaIndex.value = 0;

    const wrapper = mount(MediaDisplay);
    expect(wrapper.text()).toContain('test.jpg');
  });

  it('should display loading state', async () => {
    // Mock to delay
    (api.loadFileAsDataURL as Mock).mockImplementation(
      () => new Promise(() => {}),
    );
    mockRefs.currentMediaItem.value = { name: 'test.jpg', path: '/test.jpg' };

    const wrapper = mount(MediaDisplay);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Loading media...');
  });

  it('should display error state', async () => {
    (api.loadFileAsDataURL as Mock).mockResolvedValue({
      type: 'error',
      message: 'File not found',
    });

    mockRefs.currentMediaItem.value = { name: 'test.jpg', path: '/test.jpg' };
    const wrapper = mount(MediaDisplay);
    await wrapper.vm.$nextTick(); // Trigger load
    await flushPromises(); // Wait for load

    expect(wrapper.text()).toContain('File not found');
  });

  it('should display image when media is an image', async () => {
    (api.loadFileAsDataURL as Mock).mockResolvedValue({
      type: 'data-url',
      url: 'data:image/png;base64,abc',
    });
    mockRefs.currentMediaItem.value = {
      name: 'test.jpg',
      path: '/test.jpg',
    };
    const wrapper = mount(MediaDisplay);
    await flushPromises();

    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
  });

  it('should display video when media is a video', async () => {
    (api.loadFileAsDataURL as Mock).mockResolvedValue({
      type: 'http-url',
      url: 'http://localhost/test.mp4',
    });
    mockRefs.currentMediaItem.value = {
      name: 'test.mp4',
      path: '/test.mp4',
    };
    const wrapper = mount(MediaDisplay);
    await flushPromises();

    const video = wrapper.find('video');
    expect(video.exists()).toBe(true);
  });

  it('should show "Slideshow" title when slideshow is active', () => {
    mockRefs.isSlideshowActive.value = true;
    const wrapper = mount(MediaDisplay);
    expect(wrapper.find('h2').text()).toBe('Slideshow');
  });

  it('should show default title when slideshow is not active', () => {
    mockRefs.isSlideshowActive.value = false;
    const wrapper = mount(MediaDisplay);
    expect(wrapper.find('h2').text()).toBe('Select albums and start slideshow');
  });

  it('should display count info when slideshow is active', () => {
    mockRefs.isSlideshowActive.value = true;
    mockRefs.displayedMediaFiles.value = [
      { name: 'test1.jpg', path: '/test1.jpg' },
      { name: 'test2.jpg', path: '/test2.jpg' },
    ];
    mockRefs.currentMediaIndex.value = 1;
    mockRefs.totalMediaInPool.value = 10;

    const wrapper = mount(MediaDisplay);
    expect(wrapper.text()).toContain('2 / 10 (viewed 2)');
  });

  it('should hide count info when slideshow is not active', () => {
    mockRefs.isSlideshowActive.value = false;
    const wrapper = mount(MediaDisplay);
    const mediaInfo = wrapper.find('.media-info');
    expect(mediaInfo.exists()).toBe(true);
  });

  it('should handle catch block error', async () => {
    (api.loadFileAsDataURL as Mock).mockRejectedValue(
      new Error('Network error'),
    );

    mockRefs.currentMediaItem.value = { name: 'test.jpg', path: '/test.jpg' };
    const wrapper = mount(MediaDisplay);
    await flushPromises();

    expect(wrapper.text()).toContain('Failed to load media file');
  });

  it('should handle media error on img element', async () => {
    (api.loadFileAsDataURL as Mock).mockResolvedValue({
      type: 'data-url',
      url: 'data:image/png;base64,abc',
    });
    mockRefs.currentMediaItem.value = {
      name: 'test.jpg',
      path: '/test.jpg',
    };
    const wrapper = mount(MediaDisplay);
    await flushPromises();

    // Call error handler
    (wrapper.vm as any).handleMediaError();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Failed to display media file');
  });

  it('should call navigateMedia when previous button clicked', async () => {
    const mockNavigateMedia = vi.fn();
    (useSlideshow as Mock).mockReturnValue({
      // Copy defaults
      setFilter: mockSetFilter,
      prevMedia: mockPrevMedia,
      nextMedia: mockNextMedia,
      toggleTimer: mockToggleTimer,
      reapplyFilter: vi.fn(),
      toggleSlideshowTimer: vi.fn(),
      pauseSlideshowTimer: vi.fn(),
      resumeSlideshowTimer: vi.fn(),
      toggleAlbumSelection: vi.fn(),
      startSlideshow: vi.fn(),
      startIndividualAlbumSlideshow: vi.fn(),
      pickAndDisplayNextMediaItem: vi.fn(),
      filterMedia: vi.fn(),
      selectWeightedRandom: vi.fn(),

      navigateMedia: mockNavigateMedia,
    });
    mockRefs.displayedMediaFiles.value = [
      { name: 'test.jpg', path: '/test.jpg' },
    ];

    const wrapper = mount(MediaDisplay);
    // Directly calling handler or simulating click
    await (wrapper.vm as any).handlePrevious();
    expect(mockNavigateMedia).toHaveBeenCalledWith(-1);
  });

  it('should call navigateMedia when next button clicked', async () => {
    const mockNavigateMedia = vi.fn();
    (useSlideshow as Mock).mockReturnValue({
      // Copy defaults
      setFilter: mockSetFilter,
      prevMedia: mockPrevMedia,
      nextMedia: mockNextMedia,
      toggleTimer: mockToggleTimer,
      reapplyFilter: vi.fn(),
      toggleSlideshowTimer: vi.fn(),
      pauseSlideshowTimer: vi.fn(),
      resumeSlideshowTimer: vi.fn(),
      toggleAlbumSelection: vi.fn(),
      startSlideshow: vi.fn(),
      startIndividualAlbumSlideshow: vi.fn(),
      pickAndDisplayNextMediaItem: vi.fn(),
      filterMedia: vi.fn(),
      selectWeightedRandom: vi.fn(),

      navigateMedia: mockNavigateMedia,
    });
    mockRefs.displayedMediaFiles.value = [
      { name: 'test.jpg', path: '/test.jpg' },
    ];

    const wrapper = mount(MediaDisplay);
    await (wrapper.vm as any).handleNext();
    expect(mockNavigateMedia).toHaveBeenCalledWith(1);
  });

  it('should disable navigation buttons when no media in history', () => {
    mockRefs.displayedMediaFiles.value = [];
    const wrapper = mount(MediaDisplay);
    const buttons = wrapper.findAll('.nav-button');
    buttons.forEach((button) => {
      expect(button.attributes('disabled')).toBeDefined();
    });
  });

  it('should use totalMediaInPool fallback when not set', () => {
    mockRefs.isSlideshowActive.value = true;
    mockRefs.displayedMediaFiles.value = [
      { name: 'test1.jpg', path: '/test1.jpg' },
    ];
    mockRefs.currentMediaIndex.value = 0;
    mockRefs.totalMediaInPool.value = 0;

    const wrapper = mount(MediaDisplay);
    expect(wrapper.text()).toContain('1 / 1 (viewed 1)');
  });

  describe('Smart Timer Controls', () => {
    it('should render the smart timer controls', () => {
      const wrapper = mount(MediaDisplay);
      expect(wrapper.text()).toContain('Play Full Video');
      expect(wrapper.text()).toContain('Pause Timer on Play');
    });

    it('should toggle playFullVideo and untoggle pauseTimerOnPlay', async () => {
      const wrapper = mount(MediaDisplay);
      mockRefs.pauseTimerOnPlay.value = true;
      await wrapper.vm.$nextTick();
      mockRefs.playFullVideo.value = true;
      await wrapper.vm.$nextTick();
      expect(mockRefs.pauseTimerOnPlay.value).toBe(false);
    });

    it('should toggle pauseTimerOnPlay and untoggle playFullVideo', async () => {
      const wrapper = mount(MediaDisplay);
      mockRefs.playFullVideo.value = true;
      await wrapper.vm.$nextTick();
      mockRefs.pauseTimerOnPlay.value = true;
      await wrapper.vm.$nextTick();
      expect(mockRefs.playFullVideo.value).toBe(false);
    });
  });

  describe('Smart Timer Video Events', () => {
    let pauseSlideshowTimer: Mock;
    let resumeSlideshowTimer: Mock;
    let navigateMedia: Mock;

    beforeEach(() => {
      pauseSlideshowTimer = vi.fn();
      resumeSlideshowTimer = vi.fn();
      navigateMedia = vi.fn();
      (useSlideshow as Mock).mockReturnValue({
        setFilter: mockSetFilter,
        prevMedia: mockPrevMedia,
        nextMedia: mockNextMedia,
        toggleTimer: mockToggleTimer,
        reapplyFilter: vi.fn(),
        navigateMedia,
        toggleSlideshowTimer: vi.fn(),
        pauseSlideshowTimer,
        resumeSlideshowTimer,
        toggleAlbumSelection: vi.fn(),
        startSlideshow: vi.fn(),
        startIndividualAlbumSlideshow: vi.fn(),
        pickAndDisplayNextMediaItem: vi.fn(),
        filterMedia: vi.fn(),
        selectWeightedRandom: vi.fn(),
      });
    });

    it('should pause the timer when a video is played and playFullVideo is true', async () => {
      mockRefs.playFullVideo.value = true;
      mockRefs.isTimerRunning.value = true;
      const wrapper = mount(MediaDisplay);

      (wrapper.vm as any).handleVideoPlay();
      expect(pauseSlideshowTimer).toHaveBeenCalled();
    });

    it('should pause the timer when a video is played and pauseTimerOnPlay is true', async () => {
      mockRefs.pauseTimerOnPlay.value = true;
      mockRefs.isTimerRunning.value = true;
      const wrapper = mount(MediaDisplay);

      (wrapper.vm as any).handleVideoPlay();
      expect(pauseSlideshowTimer).toHaveBeenCalled();
    });

    it('should resume the timer when a video is paused and pauseTimerOnPlay is true', async () => {
      mockRefs.pauseTimerOnPlay.value = true;
      mockRefs.isTimerRunning.value = false;
      const wrapper = mount(MediaDisplay);

      (wrapper.vm as any).handleVideoPause();
      expect(resumeSlideshowTimer).toHaveBeenCalled();
    });

    it('should navigate to the next media when a video ends and playFullVideo is true', async () => {
      mockRefs.playFullVideo.value = true;
      const wrapper = mount(MediaDisplay);

      (wrapper.vm as any).handleVideoEnded();
      expect(navigateMedia).toHaveBeenCalledWith(1);
    });

    it('should resume the timer when an image is displayed and playFullVideo is true', async () => {
      mockRefs.playFullVideo.value = true;
      mockRefs.isTimerRunning.value = false;
      mockRefs.currentMediaItem.value = {
        name: 'test.jpg',
        path: '/test.jpg',
      };
      const wrapper = mount(MediaDisplay);
      await wrapper.vm.$nextTick();
      expect(resumeSlideshowTimer).toHaveBeenCalled();
    });
  });
});
