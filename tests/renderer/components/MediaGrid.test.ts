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
vi.mock('@/composables/useAppState', async () => {
  const { ref } = await import('vue');
  return {
    useAppState: () => ({
      state: mockState,
      imageExtensionsSet: ref(new Set(['.jpg', '.png'])),
      videoExtensionsSet: ref(new Set(['.mp4', '.webm'])),
    }),
  };
});

// Mock api
vi.mock('@/api', () => ({
  api: {
    getMediaUrlGenerator: vi.fn(),
    getThumbnailUrlGenerator: vi.fn(),
  },
}));

// Mock ResizeObserver
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(callback: any) {
    (ResizeObserverMock as any).mock.calls.push([callback]);
  }
  static mock = {
    calls: [] as any[][],
  };
}
global.ResizeObserver = ResizeObserverMock as any;

// Stub for RecycleScroller
const RecycleScrollerStub = {
  name: 'RecycleScroller',
  template: `
    <div class="recycle-scroller-stub">
      <div v-for="item in items" :key="item[keyField]">
        <!-- Pass the item to the slot, simulating how RecycleScroller works -->
        <slot :item="item"></slot>
      </div>
    </div>
  `,
  props: ['items', 'itemSize', 'keyField'],
};

describe('MediaGrid.vue', () => {
  beforeEach(() => {
    mockState.gridMediaFiles = [];
    mockState.viewMode = 'grid';
    mockState.displayedMediaFiles = [];
    mockState.currentMediaItem = null;

    vi.clearAllMocks();
    (ResizeObserverMock as any).mock.calls = [];

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

  // Helper to mount with the stub
  const mountGrid = () =>
    mount(MediaGrid, {
      global: {
        components: {
          RecycleScroller: RecycleScrollerStub,
        },
      },
    });

  it('renders "No media files found" when gridMediaFiles is empty', () => {
    const wrapper = mountGrid();
    expect(wrapper.text()).toContain('No media files found in this album');
  });

  it('renders grid items when gridMediaFiles has items', async () => {
    mockState.gridMediaFiles = [
      { path: '/path/to/image1.jpg', name: 'image1.jpg' },
      { path: '/path/to/video1.mp4', name: 'video1.mp4' },
    ];

    const wrapper = mountGrid();
    await flushPromises();

    // Trigger ResizeObserver to ensure columns are calculated
    const calls = (ResizeObserverMock as any).mock.calls;
    const observerCallback = calls[calls.length - 1][0];
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await wrapper.vm.$nextTick();

    const items = wrapper.findAll('.grid-item');
    expect(items).toHaveLength(2);

    const img = items[0].find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toContain(
      encodeURIComponent('/path/to/image1.jpg'),
    );

    const video = items[1].find('video');
    expect(video.exists()).toBe(true);
    expect(video.attributes('src')).toContain(
      encodeURIComponent('/path/to/video1.mp4'),
    );
  });

  it('handles item click correctly', async () => {
    const item1 = { path: '/path/to/image1.jpg', name: 'image1.jpg' };
    mockState.gridMediaFiles = [item1];

    const wrapper = mountGrid();
    await flushPromises();

    // Trigger resize to render items
    const calls = (ResizeObserverMock as any).mock.calls;
    const observerCallback = calls[calls.length - 1][0];
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await wrapper.vm.$nextTick();

    const item = wrapper.find('.grid-item');
    await item.trigger('click');

    expect(mockState.viewMode).toBe('player');
    expect(mockState.isSlideshowActive).toBe(true);
    expect(mockState.currentMediaItem).toEqual(expect.objectContaining(item1));
    expect(mockState.displayedMediaFiles).toHaveLength(1);
  });

  it('closes grid view when Close button is clicked', async () => {
    const wrapper = mountGrid();

    const closeButton = wrapper.find('button[title="Close Grid View"]');
    await closeButton.trigger('click');

    expect(mockState.viewMode).toBe('player');
  });

  // Replaced "infinite scroll" test with "renders all items virtually" check
  // Since we use chunking, checking that all items are passed to the scroller is sufficient
  it('passes all items to scroller (virtual scrolling)', async () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      path: `/path/item${i}.jpg`,
      name: `item${i}.jpg`,
    }));
    mockState.gridMediaFiles = items;

    const wrapper = mountGrid();
    await flushPromises();

    // Trigger resize (5 columns)
    const calls = (ResizeObserverMock as any).mock.calls;
    const observerCallback = calls[calls.length - 1][0];
    observerCallback([
      { contentRect: { width: 1400 }, contentBoxSize: [{ inlineSize: 1400 }] },
    ]);
    await wrapper.vm.$nextTick();

    const scroller = wrapper.findComponent(RecycleScrollerStub);
    const passedItems = scroller.props('items');
    // 30 items / 5 cols = 6 rows
    expect(passedItems).toHaveLength(6);
  });

  it('handles generator initialization error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (api.getMediaUrlGenerator as Mock).mockRejectedValue(new Error('Failed'));

    mountGrid();
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

    const wrapper = mountGrid();
    await flushPromises();

    // Trigger resize
    const calls = (ResizeObserverMock as any).mock.calls;
    const observerCallback = calls[calls.length - 1][0];
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await wrapper.vm.$nextTick();

    const img = wrapper.find('img');
    expect(img.attributes('src')).toContain('with%20spaces');
  });

  it('handles files with no extension', async () => {
    mockState.gridMediaFiles = [
      { path: '/path/noextension', name: 'noextension' },
    ];
    const wrapper = mountGrid();
    await flushPromises();

    // Trigger resize
    const calls = (ResizeObserverMock as any).mock.calls;
    const observerCallback = calls[calls.length - 1][0];
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('video').exists()).toBe(false);
  });

  it('handles tricky paths correctly (dots in dirs, dotfiles)', async () => {
    mockState.gridMediaFiles = [
      { path: '/path.to/file', name: 'file' },
      { path: '/path/.config', name: '.config' },
      { path: '/path/image.jpg', name: 'image.jpg' },
    ];
    const wrapper = mountGrid();
    await flushPromises();

    // Trigger resize
    const calls = (ResizeObserverMock as any).mock.calls;
    const observerCallback = calls[calls.length - 1][0];
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await wrapper.vm.$nextTick();

    // Should render all grid items (placeholders), but only one image content
    expect(wrapper.findAll('.grid-item')).toHaveLength(3);
    expect(wrapper.findAll('img')).toHaveLength(1);
    const img = wrapper.find('img');
    expect(img.attributes('src')).toContain('image.jpg');
  });
});
