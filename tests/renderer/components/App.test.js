import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import App from '@/App.vue';
import { useAppState } from '@/composables/useAppState.js';
import { useSlideshow } from '@/composables/useSlideshow.js';

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
vi.mock('@/components/SourcesModal.vue', () => ({
  default: { template: '<div class="sources-modal-mock">SourcesModal</div>' },
}));

describe('App.vue', () => {
  let mockRefs;
  let initializeApp;
  let navigateMedia;
  let toggleSlideshowTimer;

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
      state: {},
      initializeApp,
      resetState: vi.fn(),
      stopSlideshow: vi.fn(),
    };

    useAppState.mockReturnValue(mockRefs);

    useSlideshow.mockReturnValue({
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
    expect(wrapper.find('h1').text()).toBe('Media Slideshow Viewer');
  });

  it('should render AlbumsList component', () => {
    const wrapper = mount(App);
    expect(wrapper.find('.albums-list-mock').exists()).toBe(true);
  });

  it('should render MediaDisplay component', () => {
    const wrapper = mount(App);
    expect(wrapper.find('.media-display-mock').exists()).toBe(true);
  });

  it('should render SourcesModal component', () => {
    const wrapper = mount(App);
    expect(wrapper.find('.sources-modal-mock').exists()).toBe(true);
  });

  it('should render footer with instructions', () => {
    const wrapper = mount(App);
    expect(wrapper.find('footer').text()).toContain('Use ← → for navigation');
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
