import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import MediaDisplay from '@/components/MediaDisplay.vue';
import { useAppState } from '@/composables/useAppState';
import { useSlideshow } from '@/composables/useSlideshow';

// Mock the composables
vi.mock('@/composables/useAppState');
vi.mock('@/composables/useSlideshow');

import type { ElectronAPI, LoadResult } from '@/preload/preload';

describe('MediaDisplay.vue', () => {
  let mockSetFilter;
  let mockPrevMedia;
  let mockNextMedia;
  let mockToggleTimer;
  let mockRefs;

  beforeEach(() => {
    mockSetFilter = vi.fn();
    mockPrevMedia = vi.fn();
    mockNextMedia = vi.fn();
    mockToggleTimer = vi.fn();

    // useAppState returns ...toRefs(state), so each property is a ref
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
      state: {}, // Also include state for compatibility
      initializeApp: vi.fn(),
      resetState: vi.fn(),
      stopSlideshow: vi.fn(),
    };

    useAppState.mockReturnValue(mockRefs);

    useSlideshow.mockReturnValue({
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

    // Mock window.electronAPI
    global.window = {
      electronAPI: {
        loadFileAsDataURL: vi
          .fn()
          .mockResolvedValue({ type: 'data-url', url: '' } as LoadResult),
        getServerPort: vi.fn().mockResolvedValue(0),
        openInVlc: vi.fn().mockResolvedValue({ success: true }),
      } as unknown as ElectronAPI,
    } as unknown as Window & typeof globalThis;
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
    useSlideshow.mockReturnValue({
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
      // Click the second button ('Images')
      // Use native click as trigger('click') was failing
      (buttons[1].element as HTMLElement).click();
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
    // Set values on the refs
    mockRefs.currentMediaItem.value = { name: 'test.jpg', path: '/test.jpg' };
    mockRefs.displayedMediaFiles.value = [mockRefs.currentMediaItem.value];
    mockRefs.currentMediaIndex.value = 0;

    const wrapper = mount(MediaDisplay);
    expect(wrapper.text()).toContain('test.jpg');
  });

  it('should display loading state', async () => {
    // Mock electronAPI to delay response
    global.window = {
      electronAPI: {
        loadFileAsDataURL: vi.fn(() => new Promise(() => {})), // Never resolves
        getServerPort: vi.fn().mockResolvedValue(0),
        openInVlc: vi.fn().mockResolvedValue({ success: true }),
      },
    };

    mockRefs.currentMediaItem.value = { name: 'test.jpg', path: '/test.jpg' };
    const wrapper = mount(MediaDisplay);

    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Loading media...');
  });

  it('should display error state', async () => {
    global.window = {
      electronAPI: {
        loadFileAsDataURL: vi.fn(() =>
          Promise.resolve({
            type: 'error',
            message: 'File not found',
          } as LoadResult),
        ),
        getServerPort: vi.fn().mockResolvedValue(0),
        openInVlc: vi.fn().mockResolvedValue({ success: true }),
      } as unknown as ElectronAPI,
    } as unknown as Window & typeof globalThis;

    mockRefs.currentMediaItem.value = { name: 'test.jpg', path: '/test.jpg' };
    const wrapper = mount(MediaDisplay);

    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('File not found');
  });

  it('should display image when media is an image', async () => {
    global.window = {
      electronAPI: {
        loadFileAsDataURL: vi.fn(() =>
          Promise.resolve({
            type: 'data-url',
            url: 'data:image/png;base64,abc',
          }),
        ),
      },
    };

    mockRefs.currentMediaItem.value = {
      name: 'test.jpg',
      path: '/test.jpg',
    };
    const wrapper = mount(MediaDisplay);

    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
  });

  it('should display video when media is a video', async () => {
    global.window = {
      electronAPI: {
        loadFileAsDataURL: vi.fn(() =>
          Promise.resolve({
            type: 'http-url',
            url: 'http://localhost/test.mp4',
          } as LoadResult),
        ),
        getServerPort: vi.fn().mockResolvedValue(0),
        openInVlc: vi.fn().mockResolvedValue({ success: true }),
      } as unknown as ElectronAPI,
    } as unknown as Window & typeof globalThis;

    mockRefs.currentMediaItem.value = {
      name: 'test.mp4',
      path: '/test.mp4',
    };
    const wrapper = mount(MediaDisplay);

    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
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
    // Count info should be hidden (showing non-breaking space or empty)
    expect(mediaInfo.exists()).toBe(true);
  });

  it('should handle catch block error', async () => {
    global.window = {
      electronAPI: {
        loadFileAsDataURL: vi.fn(() =>
          Promise.reject(new Error('Network error')),
        ),
        getServerPort: vi.fn().mockResolvedValue(0),
        openInVlc: vi.fn().mockResolvedValue({ success: true }),
      },
    };

    mockRefs.currentMediaItem.value = { name: 'test.jpg', path: '/test.jpg' };
    const wrapper = mount(MediaDisplay);

    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Failed to load media file');
  });

  it('should handle media error on img element', async () => {
    global.window = {
      electronAPI: {
        loadFileAsDataURL: vi.fn(() =>
          Promise.resolve({
            type: 'data-url',
            url: 'data:image/png;base64,abc',
          } as LoadResult),
        ),
      } as unknown as ElectronAPI,
    } as unknown as Window & typeof globalThis;

    mockRefs.currentMediaItem.value = {
      name: 'test.jpg',
      path: '/test.jpg',
    };
    const wrapper = mount(MediaDisplay);

    await new Promise((resolve) => setTimeout(resolve, 50));
    // Manually call the error handler
    wrapper.vm.handleMediaError();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Failed to display media file');
  });

  it('should call navigateMedia when previous button clicked', async () => {
    const mockNavigateMedia = vi.fn();
    useSlideshow.mockReturnValue({
      navigateMedia: mockNavigateMedia,
      reapplyFilter: vi.fn(),
      setFilter: vi.fn(),
      prevMedia: vi.fn(),
      nextMedia: vi.fn(),
      toggleTimer: vi.fn(),
      toggleSlideshowTimer: vi.fn(),
      toggleAlbumSelection: vi.fn(),
      startSlideshow: vi.fn(),
      startIndividualAlbumSlideshow: vi.fn(),
      pickAndDisplayNextMediaItem: vi.fn(),
      filterMedia: vi.fn(),
      selectWeightedRandom: vi.fn(),
    });

    mockRefs.displayedMediaFiles.value = [
      { name: 'test.jpg', path: '/test.jpg' },
    ];

    const wrapper = mount(MediaDisplay);
    // Call the handler directly
    wrapper.vm.handlePrevious();
    expect(mockNavigateMedia).toHaveBeenCalledWith(-1);
  });

  it('should call navigateMedia when next button clicked', async () => {
    const mockNavigateMedia = vi.fn();
    useSlideshow.mockReturnValue({
      navigateMedia: mockNavigateMedia,
      reapplyFilter: vi.fn(),
      setFilter: vi.fn(),
      prevMedia: vi.fn(),
      nextMedia: vi.fn(),
      toggleTimer: vi.fn(),
      toggleSlideshowTimer: vi.fn(),
      toggleAlbumSelection: vi.fn(),
      startSlideshow: vi.fn(),
      startIndividualAlbumSlideshow: vi.fn(),
      pickAndDisplayNextMediaItem: vi.fn(),
      filterMedia: vi.fn(),
      selectWeightedRandom: vi.fn(),
    });

    mockRefs.displayedMediaFiles.value = [
      { name: 'test.jpg', path: '/test.jpg' },
    ];

    const wrapper = mount(MediaDisplay);
    // Call the handler directly
    wrapper.vm.handleNext();
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
    mockRefs.totalMediaInPool.value = 0; // Falsy value

    const wrapper = mount(MediaDisplay);
    // Should fallback to historyLength (1)
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
    let pauseSlideshowTimer;
    let resumeSlideshowTimer;
    let navigateMedia;

    beforeEach(() => {
      pauseSlideshowTimer = vi.fn();
      resumeSlideshowTimer = vi.fn();
      navigateMedia = vi.fn();
      useSlideshow.mockReturnValue({
        ...useSlideshow(),
        pauseSlideshowTimer,
        resumeSlideshowTimer,
        navigateMedia,
      });
    });

    it('should pause the timer when a video is played and playFullVideo is true', async () => {
      mockRefs.playFullVideo.value = true;
      mockRefs.isTimerRunning.value = true;
      const wrapper = mount(MediaDisplay);
      wrapper.vm.handleVideoPlay();
      expect(pauseSlideshowTimer).toHaveBeenCalled();
    });

    it('should pause the timer when a video is played and pauseTimerOnPlay is true', async () => {
      mockRefs.pauseTimerOnPlay.value = true;
      mockRefs.isTimerRunning.value = true;
      const wrapper = mount(MediaDisplay);
      wrapper.vm.handleVideoPlay();
      expect(pauseSlideshowTimer).toHaveBeenCalled();
    });

    it('should resume the timer when a video is paused and pauseTimerOnPlay is true', async () => {
      mockRefs.pauseTimerOnPlay.value = true;
      mockRefs.isTimerRunning.value = false;
      const wrapper = mount(MediaDisplay);
      wrapper.vm.handleVideoPause();
      expect(resumeSlideshowTimer).toHaveBeenCalled();
    });

    it('should navigate to the next media when a video ends and playFullVideo is true', async () => {
      mockRefs.playFullVideo.value = true;
      const wrapper = mount(MediaDisplay);
      wrapper.vm.handleVideoEnded();
      expect(navigateMedia).toHaveBeenCalledWith(1);
    });

    it('should resume the timer when an image is displayed and playFullVideo is true', async () => {
      mockRefs.playFullVideo.value = true;
      mockRefs.isTimerRunning.value = false;
      mockRefs.currentMediaItem.value = {
        name: 'test.jpg',
        path: '/test.jpg', // Ensure path is included
      };
      const wrapper = mount(MediaDisplay);
      await wrapper.vm.$nextTick();
      expect(resumeSlideshowTimer).toHaveBeenCalled();
    });
  });
});
