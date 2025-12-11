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
import MediaGrid from '@/components/MediaGrid.vue';
import { api } from '@/api';

// Shared mock state
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

// Mock useAppState
vi.mock('@/composables/useAppState', () => ({
  useAppState: () => ({
    state: mockState,
  }),
}));

// Mock api
vi.mock('@/api', () => ({
  api: {
    getMediaUrlGenerator: vi.fn(),
    getThumbnailUrlGenerator: vi.fn(),
  },
}));

describe('MediaGrid.vue', () => {
  beforeEach(() => {
    mockState.gridMediaFiles = [];
    mockState.viewMode = 'grid';

    vi.clearAllMocks();

    // Default success implementation for generators
    // Return a simple function that returns the path prefixed
    (api.getMediaUrlGenerator as Mock).mockResolvedValue(
      (path: string) => `http://localhost:1234/${encodeURIComponent(path)}`,
    );
    (api.getThumbnailUrlGenerator as Mock).mockResolvedValue(
      (path: string) =>
        `http://localhost:1234/thumb/${encodeURIComponent(path)}`,
    );
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
    await flushPromises(); // Wait for onMounted

    const items = wrapper.findAll('.grid-item');
    expect(items).toHaveLength(2);

    // Check image rendering
    const img = items[0].find('img');
    expect(img.exists()).toBe(true);
    // Our mock generator encodes paths
    expect(img.attributes('src')).toContain(
      encodeURIComponent('/path/to/image1.jpg'),
    );

    // Check video rendering
    const video = items[1].find('video');
    expect(video.exists()).toBe(true);
    expect(video.attributes('src')).toContain(
      encodeURIComponent('/path/to/video1.mp4'),
    );
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
    // Force update if needed or just wait for next tick
    await wrapper.vm.$nextTick();
    await flushPromises();

    // Should now show all 30
    expect(wrapper.findAll('.grid-item')).toHaveLength(30);
  });

  it('handles generator initialization error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (api.getMediaUrlGenerator as Mock).mockRejectedValue(new Error('Failed'));

    mount(MediaGrid);
    await flushPromises();

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to initialize media URL generators',
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
    // Our mock logic uses encodeURIComponent, so we expect encoded space
    expect(img.attributes('src')).toContain('with%20spaces');
  });
  it('handles files with no extension', async () => {
    mockState.gridMediaFiles = [
      { path: '/path/noextension', name: 'noextension' },
    ];
    const wrapper = mount(MediaGrid);
    await flushPromises();
    // Should not render img or video if extension not supported
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('video').exists()).toBe(false);
  });

  it('handles tricky paths correctly (dots in dirs, dotfiles)', async () => {
    mockState.gridMediaFiles = [
      { path: '/path.to/file', name: 'file' }, // Dot in dir, no file ext
      { path: '/path/.config', name: '.config' }, // Dotfile
      { path: '/path/image.jpg', name: 'image.jpg' }, // Normal
    ];
    const wrapper = mount(MediaGrid);
    await flushPromises();

    // Should render all grid items, but only one image
    expect(wrapper.findAll('.grid-item')).toHaveLength(3);

    // /path.to/file should NOT be an image
    // /path/.config should NOT be an image
    // /path/image.jpg SHOULD be an image
    expect(wrapper.findAll('img')).toHaveLength(1);
    const img = wrapper.find('img');
    expect(img.attributes('src')).toContain('image.jpg');
  });

  it('throttles scroll events', async () => {
    vi.useFakeTimers();
    const items = Array.from({ length: 100 }, (_, i) => ({
      path: `/p/${i}.jpg`,
      name: `${i}.jpg`,
    }));
    mockState.gridMediaFiles = items;

    const wrapper = mount(MediaGrid);
    await flushPromises();

    const container = wrapper.find('.media-grid-container');
    Object.defineProperty(container.element, 'scrollTop', { value: 1300 }); // 1300 + 500 = 1800 > 1700
    Object.defineProperty(container.element, 'clientHeight', { value: 500 });
    Object.defineProperty(container.element, 'scrollHeight', { value: 2000 });

    // Trigger multiple scrolls rapidly
    await container.trigger('scroll');
    await container.trigger('scroll');
    await container.trigger('scroll');

    // Advance by more than throttle limit (150ms)
    vi.advanceTimersByTime(300);
    await wrapper.vm.$nextTick();
    await flushPromises();

    expect(wrapper.findAll('.grid-item').length).toBeGreaterThan(24);
    vi.useRealTimers();
  });
});
