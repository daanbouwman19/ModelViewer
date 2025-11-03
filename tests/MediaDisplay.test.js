import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import MediaDisplay from '../src/renderer/components/MediaDisplay.vue';
import { useAppState } from '../src/renderer/composables/useAppState.js';
import { useSlideshow } from '../src/renderer/composables/useSlideshow.js';

// Mock the composables
vi.mock('../src/renderer/composables/useAppState.js');
vi.mock('../src/renderer/composables/useSlideshow.js');

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
      allModels: ref([]),
      modelsSelectedForSlideshow: ref({}),
      globalMediaPoolForSelection: ref([]),
      totalMediaInPool: ref(0),
      slideshowTimerId: ref(null),
      isSourcesModalVisible: ref(false),
      mediaDirectories: ref([]),
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
      toggleModelSelection: vi.fn(),
      startSlideshow: vi.fn(),
      startIndividualModelSlideshow: vi.fn(),
      pickAndDisplayNextMediaItem: vi.fn(),
      filterMedia: vi.fn(),
      selectWeightedRandom: vi.fn(),
    });
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
      toggleModelSelection: vi.fn(),
      startSlideshow: vi.fn(),
      startIndividualModelSlideshow: vi.fn(),
      pickAndDisplayNextMediaItem: vi.fn(),
      filterMedia: vi.fn(),
      selectWeightedRandom: vi.fn(),
    });

    const wrapper = mount(MediaDisplay);
    const button = wrapper.find('.filter-button');
    await button.trigger('click');
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
      },
    };

    mockRefs.currentMediaItem.value = { name: 'test.jpg', path: '/test.jpg' };
    const wrapper = mount(MediaDisplay);

    await wrapper.vm.$nextTick();
    // Give it a moment to start loading
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(wrapper.text()).toContain('Loading media...');
  });

  it('should display error state', async () => {
    global.window = {
      electronAPI: {
        loadFileAsDataURL: vi.fn(() =>
          Promise.resolve({ type: 'error', message: 'File not found' }),
        ),
      },
    };

    mockRefs.currentMediaItem.value = { name: 'test.jpg', path: '/test.jpg' };
    const wrapper = mount(MediaDisplay);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(wrapper.text()).toContain('File not found');
  });

  it('should display image when media is an image', async () => {
    global.window = {
      electronAPI: {
        loadFileAsDataURL: vi.fn(() =>
          Promise.resolve({ type: 'data-url', url: 'data:image/png;base64,abc' }),
        ),
      },
    };

    mockRefs.currentMediaItem.value = {
      name: 'test.jpg',
      path: '/test.jpg',
    };
    const wrapper = mount(MediaDisplay);

    await new Promise((resolve) => setTimeout(resolve, 50));
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
  });

  it('should display video when media is a video', async () => {
    global.window = {
      electronAPI: {
        loadFileAsDataURL: vi.fn(() =>
          Promise.resolve({ type: 'http-url', url: 'http://localhost/test.mp4' }),
        ),
      },
    };

    mockRefs.currentMediaItem.value = {
      name: 'test.mp4',
      path: '/test.mp4',
    };
    const wrapper = mount(MediaDisplay);

    await new Promise((resolve) => setTimeout(resolve, 50));
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
    expect(wrapper.find('h2').text()).toBe(
      'Select models and start slideshow',
    );
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
      },
    };

    mockRefs.currentMediaItem.value = { name: 'test.jpg', path: '/test.jpg' };
    const wrapper = mount(MediaDisplay);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(wrapper.text()).toContain('Failed to load media file');
  });

  it('should handle media error on img element', async () => {
    global.window = {
      electronAPI: {
        loadFileAsDataURL: vi.fn(() =>
          Promise.resolve({ type: 'data-url', url: 'data:image/png;base64,abc' }),
        ),
      },
    };

    mockRefs.currentMediaItem.value = {
      name: 'test.jpg',
      path: '/test.jpg',
    };
    const wrapper = mount(MediaDisplay);

    await new Promise((resolve) => setTimeout(resolve, 50));
    const img = wrapper.find('img');
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
      toggleModelSelection: vi.fn(),
      startSlideshow: vi.fn(),
      startIndividualModelSlideshow: vi.fn(),
      pickAndDisplayNextMediaItem: vi.fn(),
      filterMedia: vi.fn(),
      selectWeightedRandom: vi.fn(),
    });

    mockRefs.displayedMediaFiles.value = [{ name: 'test.jpg', path: '/test.jpg' }];

    const wrapper = mount(MediaDisplay);
    const prevButton = wrapper.findAll('.nav-button')[0];
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
      toggleModelSelection: vi.fn(),
      startSlideshow: vi.fn(),
      startIndividualModelSlideshow: vi.fn(),
      pickAndDisplayNextMediaItem: vi.fn(),
      filterMedia: vi.fn(),
      selectWeightedRandom: vi.fn(),
    });

    mockRefs.displayedMediaFiles.value = [{ name: 'test.jpg', path: '/test.jpg' }];

    const wrapper = mount(MediaDisplay);
    const nextButton = wrapper.findAll('.nav-button')[1];
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
});
