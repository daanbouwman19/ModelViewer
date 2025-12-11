import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import MediaDisplay from '@/components/MediaDisplay.vue';
import SourcesModal from '@/components/SourcesModal.vue';
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
    addMediaDirectory: vi.fn(),
    removeMediaDirectory: vi.fn(),
    setDirectoryActiveState: vi.fn(),
    getMediaDirectories: vi.fn(),
    reindexMediaLibrary: vi.fn(),
  },
}));

describe('Palette Accessibility Improvements', () => {
  let mockRefs: any;

  beforeEach(() => {
    // Setup minimal state for MediaDisplay
    mockRefs = {
      // MediaDisplay needs:
      currentMediaItem: ref({ name: 'test.jpg', path: '/test.jpg' }),
      displayedMediaFiles: ref([{ name: 'test.jpg', path: '/test.jpg' }]),
      currentMediaIndex: ref(0),
      isSlideshowActive: ref(true),
      mediaFilter: ref('All'),
      totalMediaInPool: ref(1),
      supportedExtensions: ref({ images: ['.jpg'], videos: ['.mp4'] }),
      playFullVideo: ref(false),
      pauseTimerOnPlay: ref(false),
      isTimerRunning: ref(false),
      mainVideoElement: ref(null),

      // SourcesModal needs:
      isSourcesModalVisible: ref(true),
      mediaDirectories: ref([]),
      state: {
        allAlbums: [],
        albumsSelectedForSlideshow: {},
      },
      allAlbums: ref([]),
      albumsSelectedForSlideshow: ref({}),
      globalMediaPoolForSelection: ref([]),
      slideshowTimerId: ref(null),

      // Functions
      initializeApp: vi.fn(),
      resetState: vi.fn(),
      stopSlideshow: vi.fn(),
    };

    (useAppState as Mock).mockReturnValue(mockRefs);

    (useSlideshow as Mock).mockReturnValue({
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
    });

    vi.clearAllMocks();

    (api.loadFileAsDataURL as Mock).mockResolvedValue({
      type: 'http-url',
      url: 'http://localhost/test.jpg',
    });
    (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(() => '');
  });

  describe('MediaDisplay.vue', () => {
    it('navigation buttons should have accessible labels', () => {
      const wrapper = mount(MediaDisplay);

      const prevBtn = wrapper.findAll('.nav-button')[0];
      const nextBtn = wrapper.findAll('.nav-button')[1];

      expect(prevBtn.attributes('aria-label')).toBe('Previous media');
      expect(nextBtn.attributes('aria-label')).toBe('Next media');
    });

    it('VLC button should have accessible label', async () => {
      // Need a video to show VLC button
      mockRefs.currentMediaItem.value = {
        name: 'video.mp4',
        path: '/video.mp4',
      };
      mockRefs.supportedExtensions.value = {
        images: ['.jpg'],
        videos: ['.mp4'],
      };

      const wrapper = mount(MediaDisplay);
      await wrapper.vm.$nextTick(); // Wait for re-render

      const vlcBtn = wrapper.find('.vlc-button');
      expect(vlcBtn.exists()).toBe(true);
      expect(vlcBtn.attributes('aria-label')).toBe('Open in VLC');
    });
  });

  describe('SourcesModal.vue', () => {
    it('close button should have accessible label', () => {
      const wrapper = mount(SourcesModal);
      const closeBtn = wrapper.find('.close-button');

      expect(closeBtn.exists()).toBe(true);
      expect(closeBtn.attributes('aria-label')).toBe('Close');
    });
  });
});
