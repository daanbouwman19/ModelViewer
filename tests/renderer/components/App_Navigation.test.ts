import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, nextTick } from 'vue';
import App from '@/App.vue';
import { useAppState } from '@/composables/useAppState';
import { useSlideshow } from '@/composables/useSlideshow';
import { api } from '@/api';

// Mock the composables
vi.mock('@/composables/useAppState.js');
vi.mock('@/composables/useSlideshow.js');
vi.mock('@/api');

// Mock child components for App test
vi.mock('@/components/AlbumsList.vue', () => ({
  default: { template: '<div>AlbumsList</div>' },
}));
// For testing App, we mock MediaDisplay so we don't need to mount the real one
vi.mock('@/components/MediaDisplay.vue', () => ({
  default: { template: '<div>MediaDisplay</div>' },
}));
vi.mock('@/components/MediaGrid.vue', () => ({
  default: { template: '<div>MediaGrid</div>' },
}));
vi.mock('@/components/SourcesModal.vue', () => ({
  default: { template: '<div>SourcesModal</div>' },
}));
vi.mock('@/components/LoadingMask.vue', () => ({
  default: { template: '<div>LoadingMask</div>' },
}));
vi.mock('@/components/AmbientBackground.vue', () => ({
  default: { template: '<div>AmbientBackground</div>' },
}));
// Mock VlcIcon
vi.mock('@/components/icons/VlcIcon.vue', () => ({
  default: { template: '<svg class="vlc-icon-mock"></svg>' },
}));

describe('App.vue Navigation Rules', () => {
  let mockRefs: any;
  let navigateMedia: Mock;
  let initializeApp: Mock;

  beforeEach(() => {
    initializeApp = vi.fn().mockResolvedValue(undefined);
    navigateMedia = vi.fn();

    mockRefs = {
      allAlbums: ref([]),
      albumsSelectedForSlideshow: ref({}),
      mediaFilter: ref('All'),
      currentMediaItem: ref(null),
      displayedMediaFiles: ref([]),
      currentMediaIndex: ref(-1),
      isSlideshowActive: ref(false),
      isTimerRunning: ref(false),
      timerDuration: ref(30),
      playFullVideo: ref(false),
      pauseTimerOnPlay: ref(false),
      supportedExtensions: ref({
        images: ['.jpg', '.png'],
        videos: ['.mp4', '.mkv'],
      }),
      // Computed sets mocked as refs
      imageExtensionsSet: ref(new Set(['.jpg', '.png'])),
      videoExtensionsSet: ref(new Set(['.mp4', '.mkv'])),
      globalMediaPoolForSelection: ref([]),
      totalMediaInPool: ref(0),
      slideshowTimerId: ref(null),
      isSourcesModalVisible: ref(false),
      mediaDirectories: ref([]),
      isScanning: ref(false),
      viewMode: ref('player'),
      mainVideoElement: ref(null),
      // Adding new ref for isCurrentItemVideo
      isCurrentItemVideo: ref(false),
      state: {},
      initializeApp,
      resetState: vi.fn(),
      stopSlideshow: vi.fn(),
    };

    (useAppState as Mock).mockReturnValue(mockRefs);

    (useSlideshow as Mock).mockReturnValue({
      navigateMedia,
      toggleSlideshowTimer: vi.fn(),
      reapplyFilter: vi.fn(),
      pauseSlideshowTimer: vi.fn(),
      resumeSlideshowTimer: vi.fn(),
      // Add missing mocks that MediaDisplay needs
      setFilter: vi.fn(),
      prevMedia: vi.fn(),
      nextMedia: vi.fn(),
      toggleTimer: vi.fn(),
      toggleAlbumSelection: vi.fn(),
      startSlideshow: vi.fn(),
      startIndividualAlbumSlideshow: vi.fn(),
      pickAndDisplayNextMediaItem: vi.fn(),
      filterMedia: vi.fn(),
      selectWeightedRandom: vi.fn(),
    });

    (api.loadFileAsDataURL as Mock).mockResolvedValue({
      type: 'success',
      url: 'blob:...',
    });
    (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(
      () => 'http://stream...',
    );
    (api.getVideoMetadata as Mock).mockResolvedValue({});
  });

  it('should navigate when Ctrl + ArrowLeft is pressed, even if video is playing', async () => {
    mockRefs.isCurrentItemVideo.value = true;
    mockRefs.viewMode.value = 'player';

    const wrapper = mount(App, { attachTo: document.body });
    await nextTick();

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      ctrlKey: true,
    });
    document.dispatchEvent(event);

    expect(navigateMedia).toHaveBeenCalledWith(-1);
    wrapper.unmount();
  });

  it('should navigate when Ctrl + ArrowRight is pressed, even if video is playing', async () => {
    mockRefs.isCurrentItemVideo.value = true;
    mockRefs.viewMode.value = 'player';

    const wrapper = mount(App, { attachTo: document.body });
    await nextTick();

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      ctrlKey: true,
    });
    document.dispatchEvent(event);

    expect(navigateMedia).toHaveBeenCalledWith(1);
    wrapper.unmount();
  });

  it('should navigate when ArrowLeft is pressed on an Image', async () => {
    mockRefs.isCurrentItemVideo.value = false; // Image
    mockRefs.viewMode.value = 'player';

    const wrapper = mount(App, { attachTo: document.body });
    await nextTick();

    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
    document.dispatchEvent(event);

    expect(navigateMedia).toHaveBeenCalledWith(-1);
    wrapper.unmount();
  });

  it('should NOT navigate when ArrowLeft is pressed on a Video in Player mode', async () => {
    mockRefs.isCurrentItemVideo.value = true; // Video
    mockRefs.viewMode.value = 'player';

    const wrapper = mount(App, { attachTo: document.body });
    await nextTick();

    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
    document.dispatchEvent(event);

    expect(navigateMedia).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('should navigate when ArrowLeft is pressed on a Video in Grid mode', async () => {
    mockRefs.isCurrentItemVideo.value = true;
    mockRefs.viewMode.value = 'grid';

    const wrapper = mount(App, { attachTo: document.body });
    await nextTick();

    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
    document.dispatchEvent(event);

    expect(navigateMedia).toHaveBeenCalledWith(-1);
    wrapper.unmount();
  });
});
