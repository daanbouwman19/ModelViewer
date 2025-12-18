import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';
import App from '../../../src/renderer/App.vue';
import * as useAppState from '../../../src/renderer/composables/useAppState';
import * as useSlideshow from '../../../src/renderer/composables/useSlideshow';
import { api } from '../../../src/renderer/api';

vi.mock('../../../src/renderer/composables/useAppState');
vi.mock('../../../src/renderer/composables/useSlideshow');
vi.mock('../../../src/renderer/api');
vi.mock('../../../src/renderer/components/MediaGrid.vue', () => ({
  default: { template: '<div>Grid</div>' },
}));
vi.mock('../../../src/renderer/components/MediaDisplay.vue', () => ({
  default: { template: '<div>Display</div>' },
}));
vi.mock('../../../src/renderer/components/AlbumsList.vue', () => ({
  default: { name: 'AlbumsList', template: '<div>Albums</div>' },
}));
vi.mock('../../../src/renderer/components/LoadingMask.vue', () => ({
  default: { template: '<div>Loading</div>' },
}));
vi.mock('../../../src/renderer/components/AmbientBackground.vue', () => ({
  default: { template: '<div>BG</div>' },
}));
vi.mock('../../../src/renderer/components/SourcesModal.vue', () => ({
  default: { template: '<div>Sources</div>' },
}));
vi.mock('../../../src/renderer/components/SmartPlaylistModal.vue', () => ({
  default: {
    name: 'SmartPlaylistModal',
    template: '<div>SmartPlaylistModal</div>',
  },
}));

const mockState: any = {
  viewMode: 'grid',
  isSlideshowActive: false,
  currentMediaIndex: 0,
  displayedMediaFiles: [],
  gridMediaFiles: [],
  supportedExtensions: { images: [], videos: [] },
};

describe('App.vue', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // We must re-mock after resetModules if using doMock, but here we used top-level mock.
    // Top-level mocks persist, but imported modules are cleared.
    // We need to re-import App probably, or rely on dynamic import?
    // Actually standard vitest flow handles this if we just rely on the mock updating.

    vi.mocked(useAppState.useAppState).mockReturnValue({
      state: mockState,
      initializeApp: vi.fn(),
      loadAlbum: vi.fn(),
      toggleSlideshow: vi.fn(),
      mainVideoElement: ref(null),
      isScanning: ref(false),
      viewMode: ref('grid'),
      isSmartPlaylistModalVisible: ref(false),
      smartPlaylists: ref([]),
      playlistToEdit: ref(null),
    } as any);

    vi.mocked(useSlideshow.useSlideshow).mockReturnValue({
      navigateMedia: vi.fn(),
      toggleSlideshowTimer: vi.fn(),
      slideshowTimer: ref(null),
    } as any);

    (api as any).on = vi.fn();
    (api as any).off = vi.fn();

    // Reset state defaults
    mockState.viewMode = 'grid';
    mockState.displayedMediaFiles = [{ path: '1' }, { path: '2' }];
  });

  it('handles shortcuts', async () => {
    const wrapper = mount(App);
    await flushPromises();

    // Mock handlers from useSlideshow
    const { navigateMedia, toggleSlideshowTimer } = useSlideshow.useSlideshow();

    // ArrowLeft
    const leftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
    Object.defineProperty(leftEvent, 'target', { value: document.body });
    await document.dispatchEvent(leftEvent);
    expect(navigateMedia).toHaveBeenCalledWith(-1);

    // ArrowRight
    const rightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    Object.defineProperty(rightEvent, 'target', { value: document.body });
    await document.dispatchEvent(rightEvent);
    expect(navigateMedia).toHaveBeenCalledWith(1);

    // Space
    const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });
    Object.defineProperty(spaceEvent, 'target', { value: document.body });
    await document.dispatchEvent(spaceEvent);
    expect(toggleSlideshowTimer).toHaveBeenCalled();

    wrapper.unmount();
  });

  it('ignores shortcuts in textarea', async () => {
    mount(App);
    await flushPromises();

    const { navigateMedia } = useSlideshow.useSlideshow();

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
    });
    Object.defineProperty(event, 'target', {
      value: textarea,
      enumerable: true,
    });
    document.dispatchEvent(event);

    expect(navigateMedia).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it('toggles sidebar', async () => {
    const wrapper = mount(App);
    await flushPromises();

    const toggleBtn = wrapper.find('.icon-button');
    await toggleBtn.trigger('click');

    const albumsList = wrapper.findComponent({ name: 'AlbumsList' });
    // When sidebar is hidden (after 1 click from true default?), wait.
    // default showSidebar = true.
    // Click -> false.
    // Check that it's gone?
    // But findComponent returns a wrapper even if it doesn't exist? verify exists()
    expect(albumsList.exists()).toBe(false);

    expect(toggleBtn.attributes('aria-label')).toBe('Show Albums');
    expect(wrapper.text()).not.toContain('Hide Albums');

    await toggleBtn.trigger('click');
    expect(toggleBtn.attributes('aria-label')).toBe('Hide Albums');
  });

  it('closes sidebar via @close event from AlbumsList', async () => {
    const wrapper = mount(App);
    await flushPromises();

    // Ensure sidebar is shown
    expect(wrapper.findComponent({ name: 'AlbumsList' }).exists()).toBe(true);

    const albumsList = wrapper.findComponent({ name: 'AlbumsList' });
    albumsList.vm.$emit('close');
    await flushPromises();

    expect(wrapper.findComponent({ name: 'AlbumsList' }).exists()).toBe(false);
  });

  it('clears playlistToEdit via @close event from SmartPlaylistModal', async () => {
    const { playlistToEdit } = useAppState.useAppState();
    playlistToEdit.value = {
      id: 1,
      name: 'Test',
      criteria: '{}',
      createdAt: new Date().toISOString(),
    };

    const wrapper = mount(App);
    await flushPromises();

    const modal = wrapper.findComponent({ name: 'SmartPlaylistModal' });
    modal.vm.$emit('close');
    await flushPromises();

    expect(playlistToEdit.value).toBe(null);
  });
});
