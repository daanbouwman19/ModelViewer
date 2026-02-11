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
vi.mock('@/composables/useLibraryStore');
vi.mock('@/composables/usePlayerStore');
vi.mock('@/composables/useUIStore');
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

  let mockLibraryState: any;
  let mockPlayerState: any;
  let mockUIState: any;

  beforeEach(() => {
    mockSetFilter = vi.fn();
    mockPrevMedia = vi.fn();
    mockNextMedia = vi.fn();
    mockToggleTimer = vi.fn();

    mockLibraryState = reactive({
      mediaDirectories: [{ path: '/test' }], // Not empty to avoid Welcome screen
      totalMediaInPool: 0,
      supportedExtensions: {
        images: ['.jpg', '.png', '.gif'],
        videos: ['.mp4', '.webm'],
      },
      imageExtensionsSet: new Set(['.jpg', '.png', '.gif']),
      videoExtensionsSet: new Set(['.mp4', '.webm']),
      mediaUrlGenerator: (p: string) => `http://localhost/media${p}`,
    });

    mockPlayerState = reactive({
      currentMediaItem: null,
      displayedMediaFiles: [],
      currentMediaIndex: -1,
      isSlideshowActive: false,
      isTimerRunning: false,
      timerDuration: 30,
      playFullVideo: false,
      pauseTimerOnPlay: false,
      mainVideoElement: null,
    });

    mockUIState = reactive({
      mediaFilter: 'All',
      isSidebarVisible: true,
      isControlsVisible: true,
      isSourcesModalVisible: false,
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
    expect(wrapper.text()).toContain('Select an album to start playback');
  });

  describe('VLC Integration', () => {
    it('should not show VLC button for images', async () => {
      mockPlayerState.currentMediaItem = {
        name: 'test.jpg',
        path: '/test.jpg',
      };
      const wrapper = mount(MediaDisplay);
      await wrapper.vm.$nextTick();

      const vlcButton = wrapper.find('.vlc-button');
      expect(vlcButton.exists()).toBe(false);
    });

    it('should show VLC button for videos', async () => {
      mockPlayerState.currentMediaItem = {
        name: 'test.mp4',
        path: '/test.mp4',
      };
      const wrapper = mount(MediaDisplay);
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      const vlcButton = wrapper.find('.vlc-button');
      expect(vlcButton.exists()).toBe(true);
    });

    it('should pause video and call openInVlc when button clicked', async () => {
      mockPlayerState.currentMediaItem = {
        name: 'test.mp4',
        path: '/test.mp4',
      };

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
      mockPlayerState.currentMediaItem = {
        name: 'test.mp4',
        path: '/test.mp4',
      };

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
