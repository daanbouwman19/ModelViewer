import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive, toRefs } from 'vue';
import MediaDisplay from '@/components/MediaDisplay.vue';
import VideoPlayer from '@/components/VideoPlayer.vue';
import SourcesModal from '@/components/SourcesModal.vue';
import AlbumTree from '@/components/AlbumTree.vue';
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
  let mockLibraryState: any;
  let mockPlayerState: any;
  let mockUIState: any;

  beforeEach(() => {
    // Setup minimal state for MediaDisplay
    mockLibraryState = reactive({
      totalMediaInPool: 1,
      supportedExtensions: { images: ['.jpg'], videos: ['.mp4'] },
      imageExtensionsSet: new Set(['.jpg']),
      videoExtensionsSet: new Set(['.mp4']),
      mediaDirectories: [],
      allAlbums: [],
      albumsSelectedForSlideshow: {},
      globalMediaPoolForSelection: [],
    });

    mockPlayerState = reactive({
      currentMediaItem: { name: 'test.jpg', path: '/test.jpg' },
      displayedMediaFiles: [{ name: 'test.jpg', path: '/test.jpg' }],
      currentMediaIndex: 0,
      isSlideshowActive: true,
      playFullVideo: false,
      pauseTimerOnPlay: false,
      isTimerRunning: false,
      mainVideoElement: null,
      slideshowTimerId: null,
    });

    mockUIState = reactive({
      mediaFilter: 'All',
      isSourcesModalVisible: true,
    });

    (useLibraryStore as Mock).mockReturnValue({
      state: mockLibraryState,
      ...toRefs(mockLibraryState),
      // Functions usually returned by store?
      // Based on other tests, we just mock logic.
      // SourcesModal usually calls `libraryStore.addMediaDirectory` etc.
      // I should verify if tests call these.
      // Tests below check `remove-button` labels, but don't seem to trigger actions that require store methods
      // except `toggleAlbumSelection` which is from slideshow mock? No, likely from store in new design?
      // AlbumTree might use store actions.
      // But for now let's just use state as `useAppState` did.
    });

    (usePlayerStore as Mock).mockReturnValue({
      state: mockPlayerState,
      ...toRefs(mockPlayerState),
      resetState: vi.fn(),
    });

    (useUIStore as Mock).mockReturnValue({
      state: mockUIState,
      ...toRefs(mockUIState),
      initializeApp: vi.fn(),
    });

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
      stopSlideshow: vi.fn(),
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
      mockPlayerState.currentMediaItem = {
        name: 'video.mp4',
        path: '/video.mp4',
      };
      // supported exts are already set

      const wrapper = mount(MediaDisplay);
      await wrapper.vm.$nextTick(); // Wait for re-render

      const vlcBtn = wrapper.find('.vlc-button');
      expect(vlcBtn.exists()).toBe(true);
      expect(vlcBtn.attributes('aria-label')).toBe('Open in VLC');
    });

    it('video progress bar should be accessible', async () => {
      // Setup video media
      mockPlayerState.currentMediaItem = {
        name: 'video.mp4',
        path: '/video.mp4',
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
      mockPlayerState.currentMediaItem = {
        name: 'video.mp4',
        path: '/video.mp4',
      };
      const wrapper = mount(MediaDisplay);
      await wrapper.vm.$nextTick();

      // Mock video element
      const mockVideo = { currentTime: 10, duration: 100 };
      (wrapper.vm as any).videoElement = mockVideo;

      // Also inject into VideoPlayer component directly
      const videoPlayer = wrapper.findComponent(VideoPlayer);
      (videoPlayer.vm as any).videoElement = mockVideo;

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
      mockPlayerState.currentMediaItem = {
        name: 'video.mp4',
        path: '/video.mp4',
      };
      const wrapper = mount(MediaDisplay);
      await wrapper.vm.$nextTick();

      // Enable transcoding mode
      (wrapper.vm as any).isTranscodingMode = true;
      (wrapper.vm as any).transcodedDuration = 100;
      await wrapper.vm.$nextTick();

      let videoPlayer = wrapper.findComponent(VideoPlayer);
      // Force update the internal state
      (videoPlayer.vm as any).currentVideoTime = 10;
      // We might need to trick the component into thinking time updated if it's reactive
      (videoPlayer.vm as any).$emit('update:video-element', {
        currentTime: 10,
      } as any);
      await wrapper.vm.$nextTick();

      const progressBar = wrapper.find('[data-testid="video-progress-bar"]');

      // Right arrow - forward 5s from currentVideoTime=10 -> 15
      await progressBar.trigger('keydown', { key: 'ArrowRight' });
      await wrapper.vm.$nextTick();

      // Check state changes that `tryTranscoding` performs
      expect((wrapper.vm as any).isTranscodingLoading).toBe(true);
      expect((wrapper.vm as any).currentTranscodeStartTime).toBe(15);

      // Reset state for next assertion
      // Reset state for next assertion
      (wrapper.vm as any).isTranscodingLoading = false;
      videoPlayer = wrapper.findComponent(VideoPlayer);
      (videoPlayer.vm as any).currentVideoTime = 15;

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
      const closeBtn = wrapper.find('button[aria-label="Close"]');

      expect(closeBtn.exists()).toBe(true);
      expect(closeBtn.attributes('aria-label')).toBe('Close');
    });

    it('modal container should have accessible role and label', async () => {
      const wrapper = mount(SourcesModal);
      await wrapper.vm.$nextTick();
      const modalOverlay = wrapper.find('div[role="dialog"]');

      expect(modalOverlay.attributes('role')).toBe('dialog');
      expect(modalOverlay.attributes('aria-modal')).toBe('true');
      expect(modalOverlay.attributes('aria-labelledby')).toBe('modal-title');

      const title = wrapper.find('h2');
      expect(title.attributes('id')).toBe('modal-title');
    });

    it('remove buttons should have specific accessible labels', async () => {
      mockLibraryState.mediaDirectories = [
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
        id: 'root-id',
        name: 'Root Album',
        children: [
          {
            id: 'child-id',
            name: 'Child',
            textures: [],
            children: [],
          },
        ],
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
      expect(toggleBtn.text()).toBe('▼');
      expect(toggleBtn.find('span').classes()).toContain('-rotate-90');

      // Click to expand
      await toggleBtn.trigger('click');
      expect(toggleBtn.attributes('aria-label')).toBe('Collapse Root Album');
      expect(toggleBtn.attributes('aria-expanded')).toBe('true');
      expect(toggleBtn.text()).toBe('▼');
      expect(toggleBtn.find('span').classes()).toContain('rotate-0');
    });

    it('checkbox should have accessible role, label and state', () => {
      const album = {
        id: 'test-id',
        name: 'Test Album',
        children: [],
        textures: [],
      };
      const wrapper = mount(AlbumTree, {
        props: {
          album,
          selection: {},
        },
      });

      const checkbox = wrapper.find('[data-testid="album-checkbox"]');
      expect(checkbox.attributes('role')).toBe('checkbox');
      expect(checkbox.attributes('aria-label')).toBe('Select Test Album');
      expect(checkbox.attributes('aria-checked')).toBe('false');
    });

    it('action buttons should have accessible labels', async () => {
      const album = {
        id: 'test-id',
        name: 'Test Album',
        children: [],
        textures: [],
      };
      const wrapper = mount(AlbumTree, {
        props: {
          album,
          selection: {},
        },
      });

      // Need to hover to see them (opacity 0), but in DOM they exist.
      // We assume tests don't check opacity for existence unless verifying visibility.
      // But we just check attribute presence here.

      const playBtn = wrapper.find('button[title="Play Album"]');
      const gridBtn = wrapper.find('button[title="Open in Grid"]');

      expect(playBtn.exists()).toBe(true);
      expect(playBtn.attributes('aria-label')).toBe('Play Test Album');

      expect(gridBtn.exists()).toBe(true);
      expect(gridBtn.attributes('aria-label')).toBe('Open Test Album in Grid');
    });
  });

  describe('Rating System', () => {
    it('rating buttons should have accessible labels', async () => {
      // Setup media item with existing rating
      mockPlayerState.currentMediaItem = {
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
