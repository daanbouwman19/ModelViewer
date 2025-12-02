import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import MediaGrid from '../../../src/renderer/components/MediaGrid.vue';
import { createMockElectronAPI } from '../mocks/electronAPI';

// Mock useAppState
const mockState = {
  gridMediaFiles: [] as { path: string; name: string }[],
  supportedExtensions: {
    images: ['.jpg', '.png'],
    videos: ['.mp4', '.webm'],
  },
  displayedMediaFiles: [],
  currentMediaIndex: 0,
  currentMediaItem: null,
  viewMode: 'grid',
  isSlideshowActive: false,
  isTimerRunning: false,
};

vi.mock('../../../src/renderer/composables/useAppState', () => ({
  useAppState: () => ({
    state: mockState,
  }),
}));

// Mock electronAPI
global.window.electronAPI = createMockElectronAPI();

describe('MediaGrid.vue', () => {
  beforeEach(() => {
    mockState.gridMediaFiles = [];
    mockState.viewMode = 'grid';
    vi.clearAllMocks();
    // Reset default success implementation
    (global.window.electronAPI.getServerPort as Mock).mockResolvedValue(1234);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders "No media files found" when gridMediaFiles is empty', () => {
    const wrapper = mount(MediaGrid);
    expect(wrapper.text()).toContain('No media files found in this album');
  });

  it('renders grid items when gridMediaFiles has items', async () => {
    mockState.gridMediaFiles = [
      { path: '/path/to/image1.jpg', name: 'image1.jpg' },
      { path: '/path/to/video1.mp4', name: 'video1.mp4' },
    ];

    const wrapper = mount(MediaGrid);
    await flushPromises(); // Wait for onMounted port fetching

    const items = wrapper.findAll('.grid-item');
    expect(items).toHaveLength(2);

    // Check image rendering
    const img = items[0].find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toContain('image1.jpg'); // Encoded path

    // Check video rendering
    const video = items[1].find('video');
    expect(video.exists()).toBe(true);
    expect(video.attributes('src')).toContain('video1.mp4');
  });

  it('handles item click correctly', async () => {
    const item1 = { path: '/path/to/image1.jpg', name: 'image1.jpg' };
    mockState.gridMediaFiles = [item1];

    const wrapper = mount(MediaGrid);
    await flushPromises();

    const item = wrapper.find('.grid-item');
    await item.trigger('click');

    expect(mockState.viewMode).toBe('player');
    expect(mockState.isSlideshowActive).toBe(true);
    expect(mockState.currentMediaItem).toEqual(item1);
    expect(mockState.displayedMediaFiles).toHaveLength(1);
  });

  it('closes grid view when Close button is clicked', async () => {
    const wrapper = mount(MediaGrid);

    const closeButton = wrapper.find('button');
    await closeButton.trigger('click');

    expect(mockState.viewMode).toBe('player');
  });

  it('infinite scroll loads more items', async () => {
    // Create more items than the initial visible count (24)
    const items = Array.from({ length: 30 }, (_, i) => ({
      path: `/path/item${i}.jpg`,
      name: `item${i}.jpg`,
    }));
    mockState.gridMediaFiles = items;

    const wrapper = mount(MediaGrid);
    await flushPromises();

    // Initially should show 24
    expect(wrapper.findAll('.grid-item')).toHaveLength(24);
    expect(wrapper.text()).toContain('Loading more...');

    // Mock scroll event
    const container = wrapper.find('.media-grid-container');

    // Simulate scrolling to bottom
    // We need to trick the scroll logic: scrollTop + clientHeight >= scrollHeight - 300
    Object.defineProperty(container.element, 'scrollTop', { value: 1000 });
    Object.defineProperty(container.element, 'clientHeight', { value: 500 });
    Object.defineProperty(container.element, 'scrollHeight', { value: 1600 });

    await container.trigger('scroll');

    // Wait for throttle (150ms) + re-render
    await new Promise((r) => setTimeout(r, 200));
    await wrapper.vm.$nextTick();

    // Should now show all 30 (24 + 6)
    expect(wrapper.findAll('.grid-item')).toHaveLength(30);
  });

  it('handles server port error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (global.window.electronAPI.getServerPort as Mock).mockRejectedValue(
      new Error('Failed'),
    );

    mount(MediaGrid);
    await flushPromises();

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to determine server port',
      expect.any(Error),
    );
  });

  it('generates correct URLs for encoded paths', async () => {
    mockState.gridMediaFiles = [
      { path: '/path/with spaces/image.jpg', name: 'image.jpg' },
    ];

    const wrapper = mount(MediaGrid);
    await flushPromises();

    const img = wrapper.find('img');
    // http://localhost:1234/%2Fpath%2Fwith%20spaces%2Fimage.jpg
    expect(img.attributes('src')).toContain('with%20spaces');
  });
});
