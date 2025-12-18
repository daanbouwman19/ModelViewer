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

vi.mock('@/components/icons/StarIcon.vue', () => ({
  default: { template: '<svg class="star-icon-mock"></svg>' },
}));

// Mock API
vi.mock('@/api', () => ({
  api: {
    loadFileAsDataURL: vi.fn(),
    openInVlc: vi.fn(),
    getVideoStreamUrlGenerator: vi.fn(),
    getVideoMetadata: vi.fn(),
    setRating: vi.fn(), // Add setRating mock
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
    mockRefs.currentMediaItem.value = { name: 'test2.jpg', path: '/test2.jpg' };
    mockRefs.displayedMediaFiles.value = [
      { name: 'test1.jpg', path: '/test1.jpg' },
      { name: 'test2.jpg', path: '/test2.jpg' },
    ];
    mockRefs.currentMediaIndex.value = 1;
    mockRefs.totalMediaInPool.value = 10;

    const wrapper = mount(MediaDisplay);
    expect(wrapper.text()).toContain('2 / 10');
    expect(wrapper.text()).not.toContain('(viewed 2)');
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
    // Set transcoding mode to true to trigger error message instead of auto-transcode
    (wrapper.vm as any).isTranscodingMode = true;
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
    buttons.forEach((button: any) => {
      expect(button.attributes('disabled')).toBeDefined();
    });
  });

  it('should use totalMediaInPool fallback when not set', () => {
    mockRefs.isSlideshowActive.value = true;
    mockRefs.currentMediaItem.value = { name: 'test1.jpg', path: '/test1.jpg' };
    mockRefs.displayedMediaFiles.value = [
      { name: 'test1.jpg', path: '/test1.jpg' },
    ];
    mockRefs.currentMediaIndex.value = 0;
    mockRefs.totalMediaInPool.value = 0;

    const wrapper = mount(MediaDisplay);
    expect(wrapper.text()).toContain('1 / 1');
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

  describe('Transcoding Logic', () => {
    it('should start transcoding when tryTranscoding is called', async () => {
      mockRefs.currentMediaItem.value = { name: 'test.mp4', path: '/test.mp4' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      await (wrapper.vm as any).tryTranscoding(10);

      expect((wrapper.vm as any).mediaUrl).toBe(
        'stream//test.mp4?transcode=true',
      );
      expect((wrapper.vm as any).isTranscodingMode).toBe(true);
    });

    it('should handle video loaded metadata for unsupported formats', async () => {
      mockRefs.currentMediaItem.value = { name: 'test.mp4', path: '/test.mp4' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      // Simulate loadedmetadata with 0 width
      const video = { videoWidth: 0, videoHeight: 0 };
      (wrapper.vm as any).handleVideoLoadedMetadata({ target: video } as any);

      expect((wrapper.vm as any).isVideoSupported).toBe(false);
      // It triggers transcoding async
      await flushPromises();
      expect((wrapper.vm as any).isTranscodingMode).toBe(true);
    });

    it('should show unsupported format overlay and handle transcoding click', async () => {
      mockRefs.currentMediaItem.value = { name: 'test.mp4', path: '/test.mp4' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      // Simulate unsupported video
      (wrapper.vm as any).isVideoSupported = false;
      (wrapper.vm as any).isTranscodingMode = false;
      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toContain('Video Format Not Supported');
      expect(wrapper.text()).toContain('Try Transcoding');

      // Click try transcoding
      const transcodeBtn = wrapper
        .findAll('button')
        .filter((b: any) => b.text().includes('Try Transcoding'))[0];
      await transcodeBtn.trigger('click');

      expect((wrapper.vm as any).isTranscodingMode).toBe(true);
    });
  });

  describe('Video Controls', () => {
    it('should format time correctly', () => {
      const wrapper = mount(MediaDisplay);
      const vm = wrapper.vm as any;
      expect(vm.formatTime(65)).toBe('01:05');
      expect(vm.formatTime(3665)).toBe('1:01:05');
      expect(vm.formatTime(0)).toBe('00:00');
    });

    it('should handle progress bar click', async () => {
      mockRefs.currentMediaItem.value = { name: 'test.mp4', path: '/test.mp4' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      // Mock video element
      const videoElement = { duration: 100, currentTime: 0 };
      (wrapper.vm as any).videoElement = videoElement;

      // Simulate click event
      const event = {
        currentTarget: {
          getBoundingClientRect: () => ({ left: 0, width: 100 }),
        },
        clientX: 50,
      };

      (wrapper.vm as any).handleProgressBarClick(event);
      expect(videoElement.currentTime).toBe(50);
    });

    it('should handle progress bar click in transcoding mode', async () => {
      mockRefs.currentMediaItem.value = { name: 'test.mp4', path: '/test.mp4' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      (wrapper.vm as any).isTranscodingMode = true;
      (wrapper.vm as any).transcodedDuration = 100;

      const event = {
        currentTarget: {
          getBoundingClientRect: () => ({ left: 0, width: 100 }),
        },
        clientX: 50,
      };

      await (wrapper.vm as any).handleProgressBarClick(event);
      expect((wrapper.vm as any).currentTranscodeStartTime).toBe(50);
    });
  });

  describe('VLC Integration', () => {
    it('should pause video and open vlc', async () => {
      mockRefs.currentMediaItem.value = { name: 'test.mp4', path: '/test.mp4' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      const pause = vi.fn();
      (wrapper.vm as any).videoElement = { pause };

      await (wrapper.vm as any).openInVlc();

      expect(pause).toHaveBeenCalled();
      expect(pause).toHaveBeenCalled();
      expect(api.openInVlc).toHaveBeenCalledWith('/test.mp4');
    });
  });

  describe('Rating Logic', () => {
    it('should display rating stars', async () => {
      mockRefs.currentMediaItem.value = {
        name: 'test.jpg',
        path: '/test.jpg',
        rating: 3,
        viewCount: 10,
      };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      const stars = wrapper.findAll('.star-icon-mock');
      expect(stars.length).toBe(5);
    });

    it('should call setRating when star is clicked', async () => {
      mockRefs.currentMediaItem.value = {
        name: 'test.jpg',
        path: '/test.jpg',
        rating: 0,
      };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      const stars = wrapper.findAll('button');
      // Filter for rating buttons (5 stars)
      // The first star button should set rating to 1
      // Assuming buttons order: Filter buttons (3) + Star buttons (5) + Nav buttons...
      // Easier to find by looking for button containing star mock
      const starButtons = stars.filter((b) =>
        b.find('.star-icon-mock').exists(),
      );
      expect(starButtons.length).toBe(5);

      await starButtons[2].trigger('click'); // Click 3rd star
      expect(api.setRating).toHaveBeenCalledWith('/test.jpg', 3);
      expect(mockRefs.currentMediaItem.value.rating).toBe(3); // Optimistic update
    });

    it('should toggle rating to 0 if clicking same rating', async () => {
      mockRefs.currentMediaItem.value = {
        name: 'test.jpg',
        path: '/test.jpg',
        rating: 3,
      };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      const stars = wrapper.findAll('button');
      const starButtons = stars.filter((b) =>
        b.find('.star-icon-mock').exists(),
      );

      await starButtons[2].trigger('click'); // Click 3rd star again
      expect(api.setRating).toHaveBeenCalledWith('/test.jpg', 0);
      expect(mockRefs.currentMediaItem.value.rating).toBe(0);
    });
  });

  describe('Extended Video Interactions', () => {
    it('handles video progress buffering events', () => {
      const wrapper = mount(MediaDisplay);
      const video = {
        duration: 100,
        buffered: { length: 1, start: () => 0, end: () => 50 },
      };
      (wrapper.vm as any).handleVideoProgress({ target: video });
      expect((wrapper.vm as any).bufferedRanges).toEqual([
        { start: 0, end: 50 },
      ]);

      // No duration case
      const videoNoDur = { duration: 0, buffered: { length: 0 } };
      (wrapper.vm as any).handleVideoProgress({ target: videoNoDur });
      // Should return early
    });

    it('handles keyboard navigation on progress bar', async () => {
      const genMock = vi.fn().mockReturnValue('url');
      (api.getVideoStreamUrlGenerator as Mock).mockResolvedValueOnce(genMock);

      const wrapper = mount(MediaDisplay);
      mockRefs.currentMediaItem.value = { name: 't.mp4', path: '/t.mp4' };
      await flushPromises();

      // Transcoding Mode
      (wrapper.vm as any).isTranscodingMode = true;
      (wrapper.vm as any).transcodedDuration = 100;
      (wrapper.vm as any).currentVideoTime = 10;

      const event = { key: 'ArrowRight', preventDefault: vi.fn() };
      (wrapper.vm as any).handleProgressBarKeydown(event);

      await flushPromises();
      expect(genMock).toHaveBeenCalledWith(expect.anything(), 15);
      expect(event.preventDefault).toHaveBeenCalled();

      // Normal Mode
      (wrapper.vm as any).isTranscodingMode = false;
      const videoElement = { duration: 100, currentTime: 50 };
      (wrapper.vm as any).videoElement = videoElement;

      event.key = 'ArrowRight';
      (wrapper.vm as any).handleProgressBarKeydown(event);
      expect(videoElement.currentTime).toBe(55);
    });

    it('handles time update for normal video', () => {
      const wrapper = mount(MediaDisplay);
      (wrapper.vm as any).isTranscodingMode = false;
      const video = { duration: 100, currentTime: 25 };
      (wrapper.vm as any).handleVideoTimeUpdate({ target: video });

      expect((wrapper.vm as any).videoProgress).toBe(25);
      expect((wrapper.vm as any).currentVideoTime).toBe(25);
    });

    it('handles time update for transcoding video', () => {
      const wrapper = mount(MediaDisplay);
      (wrapper.vm as any).isTranscodingMode = true;
      (wrapper.vm as any).transcodedDuration = 200;
      (wrapper.vm as any).currentTranscodeStartTime = 50;
      const video = { duration: 100, currentTime: 10 }; // 10s into chunk starting at 50s
      (wrapper.vm as any).handleVideoTimeUpdate({ target: video });

      // Real time = 50 + 10 = 60. Progress = 60/200 = 30%
      expect((wrapper.vm as any).videoProgress).toBe(30);
      expect((wrapper.vm as any).currentVideoTime).toBe(60);
    });

    it('handles waiting and canplay events', () => {
      const wrapper = mount(MediaDisplay);
      (wrapper.vm as any).isTranscodingLoading = false;
      (wrapper.vm as any).handleVideoWaiting();
      expect((wrapper.vm as any).isBuffering).toBe(true);

      (wrapper.vm as any).handleVideoCanPlay();
      expect((wrapper.vm as any).isBuffering).toBe(false);
    });
  });
  describe('Additional Coverage', () => {
    it('should auto-transcode legacy formats', async () => {
      vi.useFakeTimers();
      mockRefs.currentMediaItem.value = { name: 'test.mkv', path: '/test.mkv' };
      (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(
        () => 'stream/url',
      );

      const wrapper = mount(MediaDisplay);

      // Allow onMounted to run and generator logic to retry
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await flushPromises();

      // Check if transcoding mode is active or url is set
      expect((wrapper.vm as any).isTranscodingMode).toBe(true);
      vi.useRealTimers();
    });

    it('should handle setRating errors', async () => {
      mockRefs.currentMediaItem.value = {
        name: 'test.jpg',
        path: '/test.jpg',
        rating: 0,
      };
      (api.setRating as Mock).mockRejectedValue(new Error('Fail'));
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const wrapper = mount(MediaDisplay);
      await (wrapper.vm as any).setRating(5);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to set rating',
        expect.anything(),
      );
      consoleSpy.mockRestore();
    });

    it('should try transcoding if video dimensions are 0 (HEVC check)', async () => {
      mockRefs.currentMediaItem.value = { name: 'test.mp4', path: '/test.mp4' };
      (api.loadFileAsDataURL as Mock).mockResolvedValue({
        type: 'video',
        url: 'blob:...',
      });

      // Ensure generator is present so tryTranscoding works
      (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(
        () => 'stream/url',
      );

      const wrapper = mount(MediaDisplay);
      await flushPromises(); // Loaded

      (wrapper.vm as any).isTranscodingMode = false;
      await wrapper.vm.$nextTick();

      const video = {
        target: {
          videoWidth: 0,
          videoHeight: 0,
        },
      };

      await (wrapper.vm as any).handleVideoLoadedMetadata(video);

      // isVideoSupported is reset to true by tryTranscoding
      expect((wrapper.vm as any).isTranscodingMode).toBe(true);
    });

    it('should handle transcoding options failure', async () => {
      mockRefs.currentMediaItem.value = { name: 'test.mp4', path: '/test.mp4' };

      // Re-mount with null generator simulation
      // We return null from the api mock
      (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(null);

      // Spy on console.error to suppress expected error
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const wrapper = mount(MediaDisplay);
      await flushPromises();

      await (wrapper.vm as any).tryTranscoding(0);

      expect((wrapper.vm as any).error).toBe('Local server not available');
      expect((wrapper.vm as any).isTranscodingLoading).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should try transcoding on media error if not already transcoding', async () => {
      const wrapper = mount(MediaDisplay);
      mockRefs.currentMediaItem.value = { name: 'test.mp4', path: '/test.mp4' };
      (wrapper.vm as any).isTranscodingMode = false;
      // Ensure generator exists so it succeeds setting mode
      (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(
        () => 'stream/url',
      );
      // Wait for mount to initialize generator
      await flushPromises();

      await (wrapper.vm as any).handleMediaError();
      expect((wrapper.vm as any).isTranscodingMode).toBe(true);
    });
  });

  describe('Regression Tests', () => {
    it('should NOT unmount video element when buffering (Fix for seeking restart)', async () => {
      mockRefs.currentMediaItem.value = { name: 'test.mp4', path: '/test.mp4' };
      (api.loadFileAsDataURL as Mock).mockResolvedValue({
        type: 'http-url',
        url: 'http://localhost/test.mp4',
      });

      const wrapper = mount(MediaDisplay);
      await flushPromises();

      // Ensure video is mounted
      expect(wrapper.find('video').exists()).toBe(true);

      // Trigger buffering
      await wrapper.find('video').trigger('waiting');

      // Check state
      expect((wrapper.vm as any).isBuffering).toBe(true);

      // Video should STILL be mounted
      expect(wrapper.find('video').exists()).toBe(true);

      // Overlay should be visible
      expect(wrapper.text()).toContain('Buffering...');
    });
  });
});
