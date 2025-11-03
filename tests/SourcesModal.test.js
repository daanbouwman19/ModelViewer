import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import SourcesModal from '../src/renderer/components/SourcesModal.vue';
import { useAppState } from '../src/renderer/composables/useAppState.js';

// Mock the composables
vi.mock('../src/renderer/composables/useAppState.js');

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
      allModels: [],
      isSlideshowActive: false,
      displayedMediaFiles: [],
      currentMediaIndex: -1,
      currentMediaItem: null,
      globalMediaPoolForSelection: [],
    };

    mockRefs = {
      isSourcesModalVisible: ref(true),
      mediaDirectories: ref([
        { path: '/path/to/dir1', isActive: true },
        { path: '/path/to/dir2', isActive: false },
      ]),
      state: mockState,
      allModels: ref([]),
      modelsSelectedForSlideshow: ref({}),
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
    window.electronAPI.addMediaDirectory.mockResolvedValue([]);
    window.electronAPI.getMediaDirectories.mockResolvedValue([]);
    const wrapper = mount(SourcesModal);
    const buttons = wrapper.findAll('.modal-actions .action-button');
    const addButton = buttons[0];
    await addButton.trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.electronAPI.addMediaDirectory).toHaveBeenCalled();
  });

  it('should handle add directory cancellation', async () => {
    window.electronAPI.addMediaDirectory.mockResolvedValue(null);
    const wrapper = mount(SourcesModal);
    const buttons = wrapper.findAll('.modal-actions .action-button');
    const addButton = buttons[0];
    await addButton.trigger('click');
    // Should not call getMediaDirectories if user cancelled
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.electronAPI.getMediaDirectories).not.toHaveBeenCalled();
  });

  it('should call reindexMediaLibrary when reindex button clicked', async () => {
    window.electronAPI.reindexMediaLibrary.mockResolvedValue([]);
    window.electronAPI.getMediaDirectories.mockResolvedValue([]);
    const wrapper = mount(SourcesModal);
    const buttons = wrapper.findAll('.modal-actions .action-button');
    const reindexButton = buttons[1];
    await reindexButton.trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.electronAPI.reindexMediaLibrary).toHaveBeenCalled();
  });

  it('should reset slideshow state after reindex', async () => {
    mockState.isSlideshowActive = true;
    mockState.displayedMediaFiles = ['file1'];
    mockState.currentMediaIndex = 5;

    window.electronAPI.reindexMediaLibrary.mockResolvedValue([]);
    window.electronAPI.getMediaDirectories.mockResolvedValue([]);

    const wrapper = mount(SourcesModal);
    const buttons = wrapper.findAll('.modal-actions .action-button');
    const reindexButton = buttons[1];
    await reindexButton.trigger('click');

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockState.isSlideshowActive).toBe(false);
    expect(mockState.displayedMediaFiles).toEqual([]);
    expect(mockState.currentMediaIndex).toBe(-1);
  });
});
