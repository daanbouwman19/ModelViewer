import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import MediaDisplay from '@/components/MediaDisplay.vue';
import { useAppState } from '@/composables/useAppState';
import { useSlideshow } from '@/composables/useSlideshow';
import { api } from '@/api';

// Mock dependencies but keep MediaDisplay real (imported above)
vi.mock('@/composables/useAppState');
vi.mock('@/composables/useSlideshow');
vi.mock('@/api');
vi.mock('@/components/icons/VlcIcon.vue', () => ({
  default: { template: '<svg />' },
}));

describe('MediaDisplay Seeking Rules', () => {
  let mockRefs: any;

  beforeEach(() => {
    mockRefs = {
      mediaFilter: ref('All'),
      currentMediaItem: ref(null),
      displayedMediaFiles: ref([]),
      currentMediaIndex: ref(-1),
      isSlideshowActive: ref(false),
      isTimerRunning: ref(false),
      timerDuration: ref(30),
      supportedExtensions: ref({
        images: ['.jpg', '.png'],
        videos: ['.mp4'],
      }),
      // Computed sets as refs
      imageExtensionsSet: ref(new Set(['.jpg', '.png'])),
      videoExtensionsSet: ref(new Set(['.mp4'])),
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
      state: {},
      initializeApp: vi.fn(),
      resetState: vi.fn(),
      stopSlideshow: vi.fn(),
    };

    (useAppState as Mock).mockReturnValue(mockRefs);
    (useSlideshow as Mock).mockReturnValue({
      navigateMedia: vi.fn(),
      reapplyFilter: vi.fn(),
      pauseSlideshowTimer: vi.fn(),
      resumeSlideshowTimer: vi.fn(),
      setFilter: vi.fn(), // needed by template
      prevMedia: vi.fn(),
      nextMedia: vi.fn(),
      toggleTimer: vi.fn(),
      toggleAlbumSelection: vi.fn(),
      startSlideshow: vi.fn(),
      startIndividualAlbumSlideshow: vi.fn(),
      pickAndDisplayNextMediaItem: vi.fn(),
      filterMedia: vi.fn(),
      selectWeightedRandom: vi.fn(),
      toggleSlideshowTimer: vi.fn(),
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

  it('should seek -5s when ArrowLeft is pressed while playing video', async () => {
    mockRefs.currentMediaItem.value = { name: 'test.mp4', path: '/test.mp4' };

    // Mount with attachTo document to capture global keydown
    const wrapper = mount(MediaDisplay, { attachTo: document.body });
    await flushPromises();

    // Mock video element behavior
    const videoElement = { duration: 100, currentTime: 50, pause: vi.fn() };
    (wrapper.vm as any).videoElement = videoElement;

    // Dispatch event
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
    document.dispatchEvent(event);

    expect(videoElement.currentTime).toBe(45);
    wrapper.unmount();
  });

  it('should seek +5s when ArrowRight is pressed while playing video', async () => {
    mockRefs.currentMediaItem.value = { name: 'test.mp4', path: '/test.mp4' };
    const wrapper = mount(MediaDisplay, { attachTo: document.body });
    await flushPromises();

    const videoElement = { duration: 100, currentTime: 50, pause: vi.fn() };
    (wrapper.vm as any).videoElement = videoElement;

    const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    document.dispatchEvent(event);

    expect(videoElement.currentTime).toBe(55);
    wrapper.unmount();
  });

  it('should NOT seek if Ctrl is pressed (App.vue handles navigation)', async () => {
    mockRefs.currentMediaItem.value = { name: 'test.mp4', path: '/test.mp4' };
    const wrapper = mount(MediaDisplay, { attachTo: document.body });
    await flushPromises();

    const videoElement = { duration: 100, currentTime: 50 };
    (wrapper.vm as any).videoElement = videoElement;

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      ctrlKey: true,
    });
    document.dispatchEvent(event);

    expect(videoElement.currentTime).toBe(50);
    wrapper.unmount();
  });

  it('should NOT seek if current media is an Image', async () => {
    mockRefs.currentMediaItem.value = { name: 'test.jpg', path: '/test.jpg' };
    const wrapper = mount(MediaDisplay, { attachTo: document.body });
    await flushPromises();

    const videoElement = { duration: 100, currentTime: 50 };
    (wrapper.vm as any).videoElement = videoElement;

    const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    document.dispatchEvent(event);

    expect(videoElement.currentTime).toBe(50);
    wrapper.unmount();
  });
});
