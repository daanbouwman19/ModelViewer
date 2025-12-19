import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import AlbumsList from '@/components/AlbumsList.vue';
import MediaDisplay from '@/components/MediaDisplay.vue';
import { useAppState } from '@/composables/useAppState';
import { createMockElectronAPI } from '../mocks/electronAPI';
import type { LoadResult } from '../../../src/preload/preload';

// Mock the composables
vi.mock('@/composables/useAppState', () => ({
  useAppState: vi.fn(),
}));

vi.mock('@/composables/useSlideshow', () => ({
  useSlideshow: () => ({
    navigateMedia: vi.fn(),
    reapplyFilter: vi.fn(),
    pauseSlideshowTimer: vi.fn(),
    resumeSlideshowTimer: vi.fn(),
    toggleSlideshowTimer: vi.fn(),
    startSlideshow: vi.fn(),
  }),
}));

// Mock window.electronAPI
global.window.electronAPI = createMockElectronAPI();

describe('Progress Bars', () => {
  beforeEach(() => {
    // Reset any previous mock implementations from other tests
    vi.clearAllMocks();
    (window.electronAPI.loadFileAsDataURL as Mock).mockResolvedValue({
      type: 'data-url',
      url: '',
    } as LoadResult);
  });

  it('should display the slideshow progress bar in AlbumsList when the timer is running', async () => {
    // Arrange
    const isTimerRunning = ref(false);
    (useAppState as Mock).mockReturnValue({
      allAlbums: ref([]),
      albumsSelectedForSlideshow: ref({}),
      timerDuration: ref(5),
      isTimerRunning,
      isSourcesModalVisible: ref(false),
      timerProgress: ref(50),
      smartPlaylists: ref([]),
      gridMediaFiles: ref([]),
      viewMode: ref('player'),
    });

    const wrapper = mount(AlbumsList);

    // Act
    isTimerRunning.value = true;
    await nextTick();

    // Assert
    const progressBar = wrapper.find('[data-testid="slideshow-progress"]');
    expect(progressBar.exists()).toBe(true);
    const innerBar = progressBar.find('div.bg-indigo-500');
    expect(innerBar.attributes('style')).toContain('width: 50%');
  });

  it('should display and update the video progress bar in MediaDisplay', async () => {
    // Arrange
    (window.electronAPI.loadFileAsDataURL as Mock).mockResolvedValue({
      type: 'http-url',
      url: 'fake-video-url.mp4',
    } as LoadResult);

    (useAppState as Mock).mockReturnValue({
      currentMediaItem: ref({ path: 'video.mp4', name: 'video.mp4' }),
      displayedMediaFiles: ref([]),
      currentMediaIndex: ref(-1),
      isSlideshowActive: ref(true),
      mediaFilter: ref('All'),
      totalMediaInPool: ref(0),
      supportedExtensions: ref({ images: ['.jpg'], videos: ['.mp4'] }),
      imageExtensionsSet: ref(new Set(['.jpg'])),
      videoExtensionsSet: ref(new Set(['.mp4'])),
      playFullVideo: ref(false),
      pauseTimerOnPlay: ref(false),

      isTimerRunning: ref(false),
      mainVideoElement: ref(null),
    });

    const wrapper = mount(MediaDisplay);

    // Wait for the async watcher to call loadMediaUrl and for Vue to re-render
    await nextTick();
    await nextTick();

    // Now the video element should exist because mediaUrl is set
    const videoElement = wrapper.find('video');
    expect(videoElement.exists()).toBe(true);

    // Assert initial state
    const progressBar = wrapper.find('[data-testid="video-progress-bar"]');
    expect(progressBar.exists()).toBe(true);
    const innerBar = progressBar.find('.video-progress-bar');
    expect(innerBar.attributes('style')).toContain('width: 0%');

    // Act
    Object.defineProperty(videoElement.element, 'duration', {
      value: 200,
      writable: true,
    });
    Object.defineProperty(videoElement.element, 'currentTime', {
      value: 50,
      writable: true,
    });
    await videoElement.trigger('timeupdate');
    await nextTick();

    // Assert updated state
    expect(innerBar.attributes('style')).toContain('width: 25%');
  });
});
