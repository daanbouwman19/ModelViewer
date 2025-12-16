import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, nextTick } from 'vue';
import App from '@/App.vue';
import { useAppState } from '@/composables/useAppState';
import { useSlideshow } from '@/composables/useSlideshow';

// Mock the composables
vi.mock('@/composables/useAppState.js');
vi.mock('@/composables/useSlideshow.js');

// Mock the child components
vi.mock('@/components/AlbumsList.vue', () => ({
  default: { template: '<div class="albums-list-mock">AlbumsList</div>' },
}));
vi.mock('@/components/MediaDisplay.vue', () => ({
  default: { template: '<div class="media-display-mock">MediaDisplay</div>' },
}));
vi.mock('@/components/MediaGrid.vue', () => ({
  default: { template: '<div class="media-grid-mock">MediaGrid</div>' },
}));
vi.mock('@/components/SourcesModal.vue', () => ({
  default: { template: '<div class="sources-modal-mock">SourcesModal</div>' },
}));
vi.mock('@/components/LoadingMask.vue', () => ({
  default: { template: '<div class="loading-mask-mock">LoadingMask</div>' },
}));
vi.mock('@/components/AmbientBackground.vue', () => ({
  default: {
    template: '<div class="ambient-background-mock">AmbientBackground</div>',
  },
}));

describe('App.vue', () => {
  let mockRefs: any;
  let initializeApp: Mock;
  let navigateMedia: Mock;
  let toggleSlideshowTimer: Mock;

  beforeEach(() => {
    initializeApp = vi.fn().mockResolvedValue(undefined);
    navigateMedia = vi.fn();
    toggleSlideshowTimer = vi.fn();

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
      supportedExtensions: ref({
        images: ['.jpg'],
        videos: ['.mp4'],
      }),
      globalMediaPoolForSelection: ref([]),
      totalMediaInPool: ref(0),
      slideshowTimerId: ref(null),
      isSourcesModalVisible: ref(false),
      mediaDirectories: ref([]),
      isScanning: ref(false),
      viewMode: ref('player'),
      isSmartPlaylistModalVisible: ref(false),
      smartPlaylists: ref([]),
      state: {},
      initializeApp,
      resetState: vi.fn(),
      stopSlideshow: vi.fn(),
    };

    (useAppState as Mock).mockReturnValue(mockRefs);

    (useSlideshow as Mock).mockReturnValue({
      navigateMedia,
      toggleSlideshowTimer,
      toggleAlbumSelection: vi.fn(),
      startSlideshow: vi.fn(),
      startIndividualAlbumSlideshow: vi.fn(),
      setFilter: vi.fn(),
      prevMedia: vi.fn(),
      nextMedia: vi.fn(),
      reapplyFilter: vi.fn(),
      pickAndDisplayNextMediaItem: vi.fn(),
      filterMedia: vi.fn(),
      selectWeightedRandom: vi.fn(),
    });
  });

  it('should render the app title', () => {
    const wrapper = mount(App);
    expect(wrapper.find('h1').text()).toBe('MediaPlayer');
  });

  it('should render AlbumsList component', () => {
    const wrapper = mount(App);
    expect(wrapper.find('.albums-list-mock').exists()).toBe(true);
  });

  it('should render MediaDisplay component when viewMode is player', () => {
    mockRefs.viewMode.value = 'player';
    const wrapper = mount(App);
    expect(wrapper.find('.media-display-mock').exists()).toBe(true);
    expect(wrapper.find('.media-grid-mock').exists()).toBe(false);
  });

  it('should render MediaGrid component when viewMode is grid', () => {
    mockRefs.viewMode.value = 'grid';
    const wrapper = mount(App);
    expect(wrapper.find('.media-grid-mock').exists()).toBe(true);
    expect(wrapper.find('.media-display-mock').exists()).toBe(false);
  });

  it('should render SourcesModal component', () => {
    const wrapper = mount(App);
    expect(wrapper.find('.sources-modal-mock').exists()).toBe(true);
  });

  it('should render LoadingMask when isScanning is true', async () => {
    mockRefs.isScanning.value = true;
    const wrapper = mount(App);
    await nextTick();
    expect(wrapper.find('.loading-mask-mock').exists()).toBe(true);
  });

  it('should NOT render LoadingMask when isScanning is false', async () => {
    mockRefs.isScanning.value = false;
    const wrapper = mount(App);
    await nextTick();
    expect(wrapper.find('.loading-mask-mock').exists()).toBe(false);
  });

  it('should call initializeApp on mount', async () => {
    mount(App);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(initializeApp).toHaveBeenCalled();
  });

  it('should handle left arrow key', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
    document.dispatchEvent(event);

    expect(navigateMedia).toHaveBeenCalledWith(-1);
    wrapper.unmount();
  });

  it('should handle right arrow key', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    document.dispatchEvent(event);

    expect(navigateMedia).toHaveBeenCalledWith(1);
    wrapper.unmount();
  });

  it('should handle space key for timer toggle', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const event = new KeyboardEvent('keydown', { key: ' ' });
    document.dispatchEvent(event);

    expect(toggleSlideshowTimer).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('should not handle keys when typing in input', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Create an input element and simulate event from it
    const input = document.createElement('input');
    document.body.appendChild(input);

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
    });
    Object.defineProperty(event, 'target', { value: input, enumerable: true });

    document.dispatchEvent(event);

    expect(navigateMedia).not.toHaveBeenCalled();

    document.body.removeChild(input);
    wrapper.unmount();
  });

  it('should remove event listener on unmount', async () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    const wrapper = mount(App);
    await new Promise((resolve) => setTimeout(resolve, 0));

    wrapper.unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'keydown',
      expect.any(Function),
    );
    removeEventListenerSpy.mockRestore();
  });
});
