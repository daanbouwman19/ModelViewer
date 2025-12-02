import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import AlbumsList from '@/components/AlbumsList.vue';
import MediaDisplay from '@/components/MediaDisplay.vue';
import { useAppState } from '@/composables/useAppState';

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
global.window.electronAPI = {
  loadFileAsDataURL: vi.fn(),
};

describe('Progress Bars', () => {
  beforeEach(() => {
    // Reset any previous mock implementations from other tests
    vi.clearAllMocks();
    window.electronAPI.loadFileAsDataURL.mockResolvedValue({
      type: 'success',
      url: '',
    });
  });

  it('should display the slideshow progress bar in AlbumsList when the timer is running', async () => {
    // Arrange
    const isTimerRunning = ref(false);
    useAppState.mockReturnValue({
      allAlbums: ref([]),
      albumsSelectedForSlideshow: ref({}),
      timerDuration: ref(5),
      isTimerRunning,
      isSourcesModalVisible: ref(false),
      timerProgress: ref(50),
    });

    const wrapper = mount(AlbumsList);

    // Act
    isTimerRunning.value = true;
    await nextTick();

    // Assert
    const progressBar = wrapper.find('[data-testid="slideshow-progress-bar"]');
    expect(progressBar.exists()).toBe(true);
    const innerBar = progressBar.find('.progress-bar');
    expect(innerBar.attributes('style')).toContain('width: 50%');
  });

  it('should display and update the video progress bar in MediaDisplay', async () => {
    // Arrange
    window.electronAPI.loadFileAsDataURL.mockResolvedValue({
      type: 'success',
      url: 'fake-video-url.mp4',
    });

    useAppState.mockReturnValue({
      currentMediaItem: ref({ path: 'video.mp4', name: 'video.mp4' }),
      displayedMediaFiles: ref([]),
      currentMediaIndex: ref(-1),
      isSlideshowActive: ref(true),
      mediaFilter: ref('All'),
      totalMediaInPool: ref(0),
      supportedExtensions: ref({ images: ['.jpg'], videos: ['.mp4'] }),
      playFullVideo: ref(false),
      pauseTimerOnPlay: ref(false),
      isTimerRunning: ref(false),
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
