import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import MediaDisplay from '@/components/MediaDisplay.vue';
import SourcesModal from '@/components/SourcesModal.vue';
import AlbumTree from '@/components/AlbumTree.vue';
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

    it('video progress bar should be accessible', async () => {
      // Setup video media
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

      const progressBar = wrapper.find('[data-testid="video-progress-bar"]');
      expect(progressBar.exists()).toBe(true);

      // Check ARIA attributes
      expect(progressBar.attributes('role')).toBe('slider');
      expect(progressBar.attributes('tabindex')).toBe('0');
      expect(progressBar.attributes('aria-label')).toBe('Seek video');
      expect(progressBar.attributes('aria-valuemin')).toBe('0');
      expect(progressBar.attributes('aria-valuemax')).toBe('100');
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

  describe('AlbumTree.vue', () => {
    it('toggle button should have accessible label and aria-expanded', async () => {
      const album = {
        name: 'Root Album',
        children: [{ name: 'Child', textures: [], children: [] }],
        textures: [],
      };
      const wrapper = mount(AlbumTree, {
        props: {
          album,
          selection: {},
        },
      });

      const toggleBtn = wrapper.find('.toggle-button');
      expect(toggleBtn.exists()).toBe(true);

      // Initial state (collapsed)
      expect(toggleBtn.attributes('aria-label')).toBe('Expand Root Album');
      expect(toggleBtn.attributes('aria-expanded')).toBe('false');
      expect(toggleBtn.text()).toBe('▶');

      // Click to expand
      await toggleBtn.trigger('click');
      expect(toggleBtn.attributes('aria-label')).toBe('Collapse Root Album');
      expect(toggleBtn.attributes('aria-expanded')).toBe('true');
      expect(toggleBtn.text()).toBe('▼');
    });

    it('checkbox should have accessible label', () => {
      const album = { name: 'Test Album', children: [], textures: [] };
      const wrapper = mount(AlbumTree, {
        props: {
          album,
          selection: {},
        },
      });

      const checkbox = wrapper.find('input[type="checkbox"]');
      expect(checkbox.attributes('aria-label')).toBe('Select Test Album');
    });
  });
});
