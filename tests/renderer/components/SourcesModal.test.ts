import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import SourcesModal from '@/components/SourcesModal.vue';
import { useAppState } from '@/composables/useAppState';
import { api } from '@/api';

// Mock the composables
vi.mock('@/composables/useAppState');

// Mock the API module
// This intercepts calls to api.someMethod made by the component
vi.mock('@/api', () => ({
  api: {
    addMediaDirectory: vi.fn(),
    removeMediaDirectory: vi.fn(),
    setDirectoryActiveState: vi.fn(),
    getMediaDirectories: vi.fn(),
    reindexMediaLibrary: vi.fn(),
    startGoogleDriveAuth: vi.fn(),
    submitGoogleDriveAuthCode: vi.fn(),
    addGoogleDriveSource: vi.fn(),
  },
}));

describe('SourcesModal.vue', () => {
  let mockRefs: any;
  let mockState: any;

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
        {
          path: '/path/to/dir1',
          isActive: true,
          id: '1',
          name: 'dir1',
          type: 'local',
        },
        {
          path: '/path/to/dir2',
          isActive: false,
          id: '2',
          name: 'dir2',
          type: 'local',
        },
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

    // Return the mock refs when useAppState is called
    (useAppState as Mock).mockReturnValue(mockRefs);

    // Reset API mocks
    vi.clearAllMocks();

    // Default mock implementations
    (api.addMediaDirectory as Mock).mockResolvedValue('/default/path');
    (api.removeMediaDirectory as Mock).mockResolvedValue(undefined);
    (api.setDirectoryActiveState as Mock).mockResolvedValue(undefined);
    (api.getMediaDirectories as Mock).mockResolvedValue([]);
    (api.reindexMediaLibrary as Mock).mockResolvedValue([]);
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
    expect((checkboxes[0].element as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1].element as HTMLInputElement).checked).toBe(false);
  });

  it('should call setDirectoryActiveState when checkbox changed', async () => {
    const wrapper = mount(SourcesModal);
    const checkbox = wrapper.findAll('.source-checkbox')[0];
    await checkbox.setValue(false);
    expect(api.setDirectoryActiveState).toHaveBeenCalledWith(
      '/path/to/dir1',
      false,
    );
  });

  it('should call removeMediaDirectory when remove button clicked', async () => {
    const wrapper = mount(SourcesModal);
    const removeButton = wrapper.findAll('.remove-button')[0];
    await removeButton.trigger('click');
    expect(api.removeMediaDirectory).toHaveBeenCalledWith('/path/to/dir1');
  });

  it('should call addMediaDirectory when add button clicked', async () => {
    // Note: addMediaDirectory now triggers a DB refresh via getMediaDirectories
    (api.addMediaDirectory as Mock).mockResolvedValue('/new/path');
    (api.getMediaDirectories as Mock).mockResolvedValue([
      {
        path: '/new/path',
        isActive: true,
        id: '1',
        name: 'new',
        type: 'local',
      },
    ]);

    const wrapper = mount(SourcesModal);
    const buttons = wrapper.findAll('.modal-actions .action-button');
    // Button 0: Add Local, 1: Add Google, 2: Apply
    const addButton = buttons[0];
    expect(addButton.text()).toBe('Add Local Folder');

    await addButton.trigger('click');
    await flushPromises();
    expect(api.addMediaDirectory).toHaveBeenCalled();
    expect(api.getMediaDirectories).toHaveBeenCalled();
    expect(mockRefs.mediaDirectories.value).toContainEqual({
      path: '/new/path',
      isActive: true,
      id: '1',
      name: 'new',
      type: 'local',
    });
  });

  it('should call reindexMediaLibrary and select all albums when reindex button clicked', async () => {
    const newAlbums = [
      { name: 'newAlbum1', children: [] },
      { name: 'newAlbum2', children: [{ name: 'subAlbum', children: [] }] },
    ];
    (api.reindexMediaLibrary as Mock).mockResolvedValue(newAlbums);
    (api.getMediaDirectories as Mock).mockResolvedValue([]);

    const wrapper = mount(SourcesModal);
    const buttons = wrapper.findAll('.modal-actions .action-button');
    // Button 2 is "Apply Changes & Re-index"
    const reindexButton = buttons[2];
    expect(reindexButton.text()).toBe('Apply Changes & Re-index');

    await reindexButton.trigger('click');
    await flushPromises();

    expect(api.reindexMediaLibrary).toHaveBeenCalled();
    expect(mockState.allAlbums).toEqual(newAlbums);
    expect(mockState.albumsSelectedForSlideshow).toEqual({
      newAlbum1: true,
      newAlbum2: true,
      subAlbum: true,
    });
  });

  it('should handle error when reindexing fails', async () => {
    const error = new Error('Reindex failed');
    (api.reindexMediaLibrary as Mock).mockRejectedValue(error);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(SourcesModal);
    const buttons = wrapper.findAll('.modal-actions .action-button');
    const reindexButton = buttons[2]; // Apply Changes & Re-index

    await reindexButton.trigger('click');
    await flushPromises();

    expect(api.reindexMediaLibrary).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Error re-indexing library:',
      error,
    );
    expect(mockRefs.state.isScanning).toBe(false);

    consoleSpy.mockRestore();
  });

  it('should handle user cancelling directory selection', async () => {
    // Return null to simulate cancellation
    (api.addMediaDirectory as Mock).mockResolvedValue(null);

    const wrapper = mount(SourcesModal);
    const buttons = wrapper.findAll('.modal-actions .action-button');
    const addButton = buttons[0]; // Add Media Directory

    await addButton.trigger('click');
    await flushPromises();

    expect(api.addMediaDirectory).toHaveBeenCalled();
    // No new directory should be added
    expect(mockRefs.mediaDirectories.value).toHaveLength(2);
  });

  it('should handle error when adding directory fails', async () => {
    const error = new Error('Add failed');
    (api.addMediaDirectory as Mock).mockRejectedValue(error);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(SourcesModal);
    const buttons = wrapper.findAll('.modal-actions .action-button');
    const addButton = buttons[0];

    await addButton.trigger('click');
    await flushPromises();

    expect(consoleSpy).toHaveBeenCalledWith(
      'Error adding media directory:',
      error,
    );

    consoleSpy.mockRestore();
  });

  it('should handle error when toggling directory fails', async () => {
    const error = new Error('Toggle failed');
    (api.setDirectoryActiveState as Mock).mockRejectedValue(error);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(SourcesModal);
    const checkbox = wrapper.findAll('.source-checkbox')[0];

    await checkbox.setValue(false);
    await flushPromises();

    expect(consoleSpy).toHaveBeenCalledWith(
      'Error toggling directory active state:',
      error,
    );

    consoleSpy.mockRestore();
  });

  it('should handle directory not found during toggle', async () => {
    const wrapper = mount(SourcesModal);
    await (wrapper.vm as any).handleToggleActive('/non-existent/path', true);
    expect(mockRefs.mediaDirectories.value[0].isActive).toBe(true);
    expect(mockRefs.mediaDirectories.value[1].isActive).toBe(false);
  });

  it('should handle error when removing directory fails', async () => {
    const error = new Error('Remove failed');
    (api.removeMediaDirectory as Mock).mockRejectedValue(error);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(SourcesModal);
    const removeButton = wrapper.findAll('.remove-button')[0];

    await removeButton.trigger('click');
    await flushPromises();

    expect(consoleSpy).toHaveBeenCalledWith('Error removing directory:', error);

    consoleSpy.mockRestore();
  });

  it('should handle directory not found during remove', async () => {
    const wrapper = mount(SourcesModal);
    await (wrapper.vm as any).handleRemove('/non-existent/path');
    expect(mockRefs.mediaDirectories.value).toHaveLength(2);
  });
});
