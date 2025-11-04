import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import SourcesModal from '@/components/SourcesModal.vue';
import { useAppState } from '@/composables/useAppState.js';

// Mock the composables
vi.mock('@/composables/useAppState.js');

// Mock window.electronAPI
global.window.electronAPI = {
  addMediaDirectory: vi.fn(),
  removeMediaDirectory: vi.fn(),
  setDirectoryActiveState: vi.fn(),
  getMediaDirectories: vi.fn(),
  reindexMediaLibrary: vi.fn(),
};

describe('SourcesModal.vue', () => {
  let mockRefs;
  let mockState;

  beforeEach(() => {
    mockState = {
      allAlbums: [],
      isSlideshowActive: false,
      displayedMediaFiles: [],
      currentMediaIndex: -1,
      currentMediaItem: null,
      globalMediaPoolForSelection: [],
      albumsSelectedForSlideshow: {},
    };

    mockRefs = {
      isSourcesModalVisible: ref(true),
      mediaDirectories: ref([
        { path: '/path/to/dir1', isActive: true },
        { path: '/path/to/dir2', isActive: false },
      ]),
      state: mockState,
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
      initializeApp: vi.fn(),
      resetState: vi.fn(),
      stopSlideshow: vi.fn(),
    };

    useAppState.mockReturnValue(mockRefs);

    // Reset mocks
    vi.clearAllMocks();
  });

  it('should render modal when visible', () => {
    const wrapper = mount(SourcesModal);
    expect(wrapper.find('.modal-overlay').exists()).toBe(true);
    expect(wrapper.text()).toContain('Manage Media Sources');
  });

  it('should not render when not visible', () => {
    mockRefs.isSourcesModalVisible.value = false;
    const wrapper = mount(SourcesModal);
    expect(wrapper.find('.modal-overlay').exists()).toBe(false);
  });

  it('should display media directories', () => {
    const wrapper = mount(SourcesModal);
    expect(wrapper.text()).toContain('/path/to/dir1');
    expect(wrapper.text()).toContain('/path/to/dir2');
  });

  it('should show empty message when no directories', () => {
    mockRefs.mediaDirectories.value = [];
    const wrapper = mount(SourcesModal);
    expect(wrapper.text()).toContain('No media sources configured');
  });

  it('should close modal when close button clicked', async () => {
    const wrapper = mount(SourcesModal);
    const closeButton = wrapper.find('.close-button');
    await closeButton.trigger('click');
    expect(mockRefs.isSourcesModalVisible.value).toBe(false);
  });

  it('should close modal when clicking overlay', async () => {
    const wrapper = mount(SourcesModal);
    await wrapper.find('.modal-overlay').trigger('click.self');
    expect(mockRefs.isSourcesModalVisible.value).toBe(false);
  });

  it('should render checkboxes for directories', () => {
    const wrapper = mount(SourcesModal);
    const checkboxes = wrapper.findAll('.source-checkbox');
    expect(checkboxes.length).toBe(2);
    expect(checkboxes[0].element.checked).toBe(true);
    expect(checkboxes[1].element.checked).toBe(false);
  });

  it('should call setDirectoryActiveState when checkbox changed', async () => {
    window.electronAPI.setDirectoryActiveState.mockResolvedValue(undefined);
    const wrapper = mount(SourcesModal);
    const checkbox = wrapper.findAll('.source-checkbox')[0];
    await checkbox.setValue(false);
    expect(window.electronAPI.setDirectoryActiveState).toHaveBeenCalledWith(
      '/path/to/dir1',
      false,
    );
  });

  it('should call removeMediaDirectory when remove button clicked', async () => {
    window.electronAPI.removeMediaDirectory.mockResolvedValue(undefined);
    const wrapper = mount(SourcesModal);
    const removeButton = wrapper.findAll('.remove-button')[0];
    await removeButton.trigger('click');
    expect(window.electronAPI.removeMediaDirectory).toHaveBeenCalledWith(
      '/path/to/dir1',
    );
  });

  it('should call addMediaDirectory when add button clicked', async () => {
    window.electronAPI.addMediaDirectory.mockResolvedValue('/new/path');
    const wrapper = mount(SourcesModal);
    const buttons = wrapper.findAll('.modal-actions .action-button');
    const addButton = buttons[0];
    await addButton.trigger('click');
    await flushPromises();
    expect(window.electronAPI.addMediaDirectory).toHaveBeenCalled();
    expect(mockRefs.mediaDirectories.value).toContainEqual({
      path: '/new/path',
      isActive: true,
    });
  });

  it('should call reindexMediaLibrary and select all albums when reindex button clicked', async () => {
    const newAlbums = [
      { name: 'newAlbum1', children: [] },
      { name: 'newAlbum2', children: [{ name: 'subAlbum', children: [] }] },
    ];
    window.electronAPI.reindexMediaLibrary.mockResolvedValue(newAlbums);
    window.electronAPI.getMediaDirectories.mockResolvedValue([]);

    const wrapper = mount(SourcesModal);
    const buttons = wrapper.findAll('.modal-actions .action-button');
    const reindexButton = buttons[1];
    await reindexButton.trigger('click');
    await flushPromises();

    expect(window.electronAPI.reindexMediaLibrary).toHaveBeenCalled();
    expect(mockState.allAlbums).toEqual(newAlbums);
    expect(mockState.albumsSelectedForSlideshow).toEqual({
      newAlbum1: true,
      newAlbum2: true,
      subAlbum: true,
    });
  });
});
