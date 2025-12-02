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

    // Reset mocks and provide default success implementations
    vi.clearAllMocks();
    window.electronAPI.addMediaDirectory.mockReset().mockResolvedValue('/default/path');
    window.electronAPI.removeMediaDirectory.mockReset().mockResolvedValue(undefined);
    window.electronAPI.setDirectoryActiveState.mockReset().mockResolvedValue(undefined);
    window.electronAPI.getMediaDirectories.mockReset().mockResolvedValue([]);
    window.electronAPI.reindexMediaLibrary.mockReset().mockResolvedValue([]);
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

  it('should handle error when reindexing fails', async () => {
    const error = new Error('Reindex failed');
    window.electronAPI.reindexMediaLibrary.mockRejectedValue(error);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(SourcesModal);
    const buttons = wrapper.findAll('.modal-actions .action-button');
    const reindexButton = buttons[1]; // Apply Changes & Re-index

    await reindexButton.trigger('click');
    await flushPromises();

    expect(window.electronAPI.reindexMediaLibrary).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('Error re-indexing library:', error);
    expect(mockRefs.state.isScanning).toBe(false);

    consoleSpy.mockRestore();
  });

  it('should handle user cancelling directory selection', async () => {
    // Return null to simulate cancellation
    window.electronAPI.addMediaDirectory.mockResolvedValue(null);

    const wrapper = mount(SourcesModal);
    const buttons = wrapper.findAll('.modal-actions .action-button');
    const addButton = buttons[0]; // Add Media Directory

    await addButton.trigger('click');
    await flushPromises();

    expect(window.electronAPI.addMediaDirectory).toHaveBeenCalled();
    // No new directory should be added
    expect(mockRefs.mediaDirectories.value).toHaveLength(2);
  });

  it('should handle error when adding directory fails', async () => {
    const error = new Error('Add failed');
    window.electronAPI.addMediaDirectory.mockRejectedValue(error);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(SourcesModal);
    const buttons = wrapper.findAll('.modal-actions .action-button');
    const addButton = buttons[0];

    await addButton.trigger('click');
    await flushPromises();

    expect(consoleSpy).toHaveBeenCalledWith('Error adding media directory:', error);

    consoleSpy.mockRestore();
  });

  it('should handle error when toggling directory fails', async () => {
    const error = new Error('Toggle failed');
    window.electronAPI.setDirectoryActiveState.mockRejectedValue(error);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(SourcesModal);
    const checkbox = wrapper.findAll('.source-checkbox')[0];

    await checkbox.setValue(false);
    await flushPromises();

    expect(consoleSpy).toHaveBeenCalledWith('Error toggling directory active state:', error);

    consoleSpy.mockRestore();
  });

  it('should handle directory not found during toggle', async () => {
    // This simulates a race condition where the directory might have been removed
    const wrapper = mount(SourcesModal);

    // Manually call the handler with a path that doesn't exist in the list
    await wrapper.vm.handleToggleActive('/non-existent/path', true);

    // Expect no crash and no state change for existing directories
    expect(mockRefs.mediaDirectories.value[0].isActive).toBe(true);
    expect(mockRefs.mediaDirectories.value[1].isActive).toBe(false);
  });

  it('should handle error when removing directory fails', async () => {
    const error = new Error('Remove failed');
    window.electronAPI.removeMediaDirectory.mockRejectedValue(error);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(SourcesModal);
    const removeButton = wrapper.findAll('.remove-button')[0];

    await removeButton.trigger('click');
    await flushPromises();

    expect(consoleSpy).toHaveBeenCalledWith('Error removing directory:', error);

    consoleSpy.mockRestore();
  });

  it('should handle directory not found during remove', async () => {
    // This simulates a race condition where the directory might have been removed already
    const wrapper = mount(SourcesModal);

    // Manually call the handler with a path that doesn't exist in the list
    await wrapper.vm.handleRemove('/non-existent/path');

    // Expect list to remain unchanged
    expect(mockRefs.mediaDirectories.value).toHaveLength(2);
  });
});
