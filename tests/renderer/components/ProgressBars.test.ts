import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, reactive, toRefs } from 'vue';
import AlbumsList from '@/components/AlbumsList.vue';
import MediaDisplay from '@/components/MediaDisplay.vue';
import { useLibraryStore } from '@/composables/useLibraryStore';
import { usePlayerStore } from '@/composables/usePlayerStore';
import { useUIStore } from '@/composables/useUIStore';
import { createMockElectronAPI } from '../mocks/electronAPI';
import type { LoadResult } from '../../../src/preload/preload';

// Mock the composables
vi.mock('@/composables/useLibraryStore');
vi.mock('@/composables/usePlayerStore');
vi.mock('@/composables/useUIStore');

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
  let mockLibraryState: any;
  let mockPlayerState: any;
  let mockUIState: any;

  beforeEach(() => {
    // Reset any previous mock implementations from other tests
    vi.clearAllMocks();
    (window.electronAPI.loadFileAsDataURL as Mock).mockResolvedValue({
      type: 'data-url',
      url: '',
    } as LoadResult);

    mockLibraryState = reactive({
      allAlbums: [],
      albumsSelectedForSlideshow: {},
      smartPlaylists: [],
      totalMediaInPool: 0,
      supportedExtensions: { images: ['.jpg'], videos: ['.mp4'] },
      imageExtensionsSet: new Set(['.jpg']),
      videoExtensionsSet: new Set(['.mp4']),
    });

    mockPlayerState = reactive({
      timerDuration: 5,
      isTimerRunning: false,
      timerProgress: 50,
      currentMediaItem: { path: 'video.mp4', name: 'video.mp4' },
      displayedMediaFiles: [],
      currentMediaIndex: -1,
      isSlideshowActive: true,
      playFullVideo: false,
      pauseTimerOnPlay: false,
      mainVideoElement: null,
    });

    mockUIState = reactive({
      isSourcesModalVisible: false,
      gridMediaFiles: [],
      viewMode: 'player',
      mediaFilter: 'All',
      isControlsVisible: true,
      isSidebarVisible: true,
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
  });

  it('should display the slideshow progress bar in AlbumsList when the timer is running', async () => {
    // Arrange
    mockPlayerState.isTimerRunning = false;
    mockPlayerState.timerProgress = 50;

    const wrapper = mount(AlbumsList);

    // Act
    mockPlayerState.isTimerRunning = true;
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

    mockPlayerState.currentMediaItem = { path: 'video.mp4', name: 'video.mp4' };
    mockPlayerState.isTimerRunning = false;

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
