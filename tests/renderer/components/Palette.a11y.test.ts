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

    it('should handle keyboard navigation on progress bar', async () => {
      // Setup video media with a specific duration
      mockRefs.currentMediaItem.value = {
        name: 'video.mp4',
        path: '/video.mp4',
      };
      const wrapper = mount(MediaDisplay);
      await wrapper.vm.$nextTick();

      // Mock video element
      const mockVideo = { currentTime: 10, duration: 100 };
      (wrapper.vm as any).videoElement = mockVideo;

      const progressBar = wrapper.find('[data-testid="video-progress-bar"]');

      // Right arrow - forward 5s
      await progressBar.trigger('keydown', { key: 'ArrowRight' });
      expect(mockVideo.currentTime).toBe(15);

      // Left arrow - backward 5s
      await progressBar.trigger('keydown', { key: 'ArrowLeft' });
      expect(mockVideo.currentTime).toBe(10); // Back to 10

      // Boundary check - min
      mockVideo.currentTime = 2;
      await progressBar.trigger('keydown', { key: 'ArrowLeft' });
      expect(mockVideo.currentTime).toBe(0); // Clamped to 0

      // Boundary check - max
      mockVideo.currentTime = 98;
      await progressBar.trigger('keydown', { key: 'ArrowRight' });
      expect(mockVideo.currentTime).toBe(100); // Clamped to 100
    });

    it('should handle keyboard navigation on progress bar in transcoding mode', async () => {
      // Setup video media
      mockRefs.currentMediaItem.value = {
        name: 'video.mp4',
        path: '/video.mp4',
      };
      const wrapper = mount(MediaDisplay);
      await wrapper.vm.$nextTick();

      // Enable transcoding mode
      (wrapper.vm as any).isTranscodingMode = true;
      (wrapper.vm as any).transcodedDuration = 100;
      (wrapper.vm as any).currentVideoTime = 10;

      // Mock tryTranscoding function
      // We need to attach the spy to the instance before it's used
      // But since we can't easily replace a method on an already mounted component vm for internal calls
      // without some hacking, we will verify the side effect (api call or state change)
      // OR we can mock the method if we can access the underlying component definition or setup return.
      // However, simplified approach: check if tryTranscoding implementation logic is triggered.

      // Better approach for this test environment:
      // The component calls `tryTranscoding` internally.
      // We can mock `tryTranscoding` by overwriting it on the vm instance
      // BUT internal template calls might use the hoisted version from setup().
      // Let's rely on the side effect: `mediaUrl` changes or `api.getVideoStreamUrlGenerator` usage.

      // Actually, standard `vi.spyOn(wrapper.vm, ...)` often works for Options API but for Composition API
      // setup() returns functions that are bound.
      // Let's retry by checking if we can just assert on the state change it produces.

      // Direct mock doesn't work well with Composition API setup() bound functions.
      // Instead, we will observe the side-effects.
      // When tryTranscoding(15) is called, it should set isTranscodingMode=true,
      // isTranscodingLoading=true, and currentTranscodeStartTime=15.

      const progressBar = wrapper.find('[data-testid="video-progress-bar"]');

      // Right arrow - forward 5s from currentVideoTime=10 -> 15
      await progressBar.trigger('keydown', { key: 'ArrowRight' });
      await wrapper.vm.$nextTick();

      // Check state changes that `tryTranscoding` performs
      expect((wrapper.vm as any).isTranscodingLoading).toBe(true);
      expect((wrapper.vm as any).currentTranscodeStartTime).toBe(15);

      // Reset state for next assertion
      (wrapper.vm as any).isTranscodingLoading = false;
      (wrapper.vm as any).currentVideoTime = 15;

      // Left arrow - backward 5s from 15 -> 10
      await progressBar.trigger('keydown', { key: 'ArrowLeft' });
      await wrapper.vm.$nextTick();

      expect((wrapper.vm as any).isTranscodingLoading).toBe(true);
      expect((wrapper.vm as any).currentTranscodeStartTime).toBe(10);
    });
  });

  describe('SourcesModal.vue', () => {
    it('close button should have accessible label', () => {
      const wrapper = mount(SourcesModal);
      const closeBtn = wrapper.find('.close-button');

      expect(closeBtn.exists()).toBe(true);
      expect(closeBtn.attributes('aria-label')).toBe('Close');
    });

    it('modal container should have accessible role and label', () => {
      const wrapper = mount(SourcesModal);
      const modalOverlay = wrapper.find('.modal-overlay');

      expect(modalOverlay.attributes('role')).toBe('dialog');
      expect(modalOverlay.attributes('aria-modal')).toBe('true');
      expect(modalOverlay.attributes('aria-labelledby')).toBe('modal-title');

      const title = wrapper.find('h2');
      expect(title.attributes('id')).toBe('modal-title');
    });

    it('remove buttons should have specific accessible labels', async () => {
      mockRefs.mediaDirectories.value = [
        { path: '/home/user/media', isActive: true },
        { path: '/mnt/data/photos', isActive: false },
      ];

      const wrapper = mount(SourcesModal);
      await wrapper.vm.$nextTick();

      const removeButtons = wrapper.findAll('.remove-button');

      expect(removeButtons.length).toBe(2);
      expect(removeButtons[0].attributes('aria-label')).toBe(
        'Remove /home/user/media',
      );
      expect(removeButtons[1].attributes('aria-label')).toBe(
        'Remove /mnt/data/photos',
      );
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

  describe('Rating System', () => {
    it('rating buttons should have accessible labels', async () => {
      // Setup media item with existing rating
      mockRefs.currentMediaItem.value = {
        name: 'photo.jpg',
        path: '/photo.jpg',
        rating: 3,
      };

      const wrapper = mount(MediaDisplay);
      await wrapper.vm.$nextTick();

      // The star buttons are inside a div in .media-info
      const starsContainer = wrapper.find(
        '.media-info .flex.justify-center.gap-1',
      );
      expect(starsContainer.exists()).toBe(true);

      const stars = starsContainer.findAll('button');
      expect(stars.length).toBe(5);

      // Check labels
      expect(stars[0].attributes('aria-label')).toBe('Rate 1 star');
      expect(stars[1].attributes('aria-label')).toBe('Rate 2 stars');
      expect(stars[4].attributes('aria-label')).toBe('Rate 5 stars');
    });
  });
});
