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

// Mock VlcIcon component
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
      imageExtensionsSet: ref(new Set(['.jpg', '.png', '.gif'])),
      videoExtensionsSet: ref(new Set(['.mp4', '.webm'])),
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

    // Default success mocks
    (api.loadFileAsDataURL as Mock).mockResolvedValue({
      type: 'http-url',
      url: 'http://localhost/test-media',
    });
    (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(
      (path: string) => `stream/${path}`,
    );
    (api.getVideoMetadata as Mock).mockResolvedValue({ duration: 100 });
    (api.openInVlc as Mock).mockResolvedValue({ success: true });
  });

  it('should render placeholder when no media', () => {
    const wrapper = mount(MediaDisplay);
    expect(wrapper.text()).toContain('Media will appear here');
  });

  describe('VLC Integration', () => {
    it('should not show VLC button for images', async () => {
      mockRefs.currentMediaItem.value = { name: 'test.jpg', path: '/test.jpg' };
      const wrapper = mount(MediaDisplay);
      await wrapper.vm.$nextTick();

      const vlcButton = wrapper.find('.vlc-button');
      expect(vlcButton.exists()).toBe(false);
    });

    it('should show VLC button for videos', async () => {
      mockRefs.currentMediaItem.value = { name: 'test.mp4', path: '/test.mp4' };
      const wrapper = mount(MediaDisplay);
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      const vlcButton = wrapper.find('.vlc-button');
      expect(vlcButton.exists()).toBe(true);
    });

    it('should pause video and call openInVlc when button clicked', async () => {
      mockRefs.currentMediaItem.value = { name: 'test.mp4', path: '/test.mp4' };

      const wrapper = mount(MediaDisplay, {
        attachTo: document.body,
      });
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      // Mock the video element pause method
      const videoEl = wrapper.find('video').element;
      videoEl.pause = vi.fn();

      const vlcButton = wrapper.find('.vlc-button');
      await vlcButton.trigger('click');

      expect(videoEl.pause).toHaveBeenCalled();
      expect(api.openInVlc).toHaveBeenCalledWith('/test.mp4');

      wrapper.unmount();
    });

    it('should display error if openInVlc fails', async () => {
      mockRefs.currentMediaItem.value = { name: 'test.mp4', path: '/test.mp4' };

      (api.openInVlc as Mock).mockResolvedValue({
        success: false,
        message: 'VLC error',
      });

      const wrapper = mount(MediaDisplay);
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      // Mock video element pause
      const video = wrapper.find('video');
      video.element.pause = vi.fn();

      const vlcButton = wrapper.find('.vlc-button');
      await vlcButton.trigger('click');
      await wrapper.vm.$nextTick();
      await flushPromises(); // Wait for async promise to resolve

      expect(wrapper.text()).toContain('VLC error'); // The error should be displayed in p.text-red-400
    });
  });
});
