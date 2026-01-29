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
import { reactive, toRefs } from 'vue';
import MediaGrid from '@/components/MediaGrid.vue';
import { api } from '@/api';
import { useLibraryStore } from '@/composables/useLibraryStore';
import { usePlayerStore } from '@/composables/usePlayerStore';
import { useUIStore } from '@/composables/useUIStore';

// Mock stores
vi.mock('@/composables/useLibraryStore');
vi.mock('@/composables/usePlayerStore');
vi.mock('@/composables/useUIStore');

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
  let mockLibraryState: any;
  let mockPlayerState: any;
  let mockUIState: any;

  beforeEach(() => {
    mockLibraryState = reactive({
      imageExtensionsSet: new Set(['.jpg', '.png']),
      videoExtensionsSet: new Set(['.mp4', '.webm']),
      supportedExtensions: {
        images: ['.jpg', '.png'],
        videos: ['.mp4', '.webm'],
      },
      gridMediaFiles: [], // Wait, gridMediaFiles is usually a computed or state? In useAppState it was state.
      // But now, where does MediaGrid get files?
      // MediaGrid usually takes items as props or gets them from store.
      // Checking MediaGrid implementation (memory): it uses useLibraryStore or similar?
      // If it uses useAppState.displayedMediaFiles, then that's in playerStore?
      // "gridMediaFiles" was a specific thing in useAppState usually representing the filtered list for grid?
      // I need to check where MediaGrid gets its data.
      // Assuming it uses displayedMediaFiles from playerStore or UIStore.
      // Let's assume it matches the old state structure but split.
      // The old test mock had `gridMediaFiles`.
      // I will put it in UIStore or PlayerStore based on where it moved.
      // Based on previous refactoring, `displayedMediaFiles` is in PlayerStore.
      // `gridMediaFiles` might be an internal alias or just `displayedMediaFiles`.
      // I'll check MediaGrid code if this assumption fails, but for now I'll mock `gridMediaFiles` on `mockUIState` or `mockPlayerState`.
      // Actually, typically `displayedMediaFiles` is what's displayed.
    });

    mockPlayerState = reactive({
      displayedMediaFiles: [],
      currentMediaIndex: 0,
      currentMediaItem: null,
      isSlideshowActive: false,
      isTimerRunning: false,
      // If gridMediaFiles was part of useAppState, it likely mapped to displayedMediaFiles or similar.
      // I'll add gridMediaFiles here to match old test expectation if MediaGrid uses it.
      // But typically strict refactoring means it uses `displayedMediaFiles`.
    });

    mockUIState = reactive({
      viewMode: 'grid',
      gridMediaFiles: [],
    });

    // We need to support `gridMediaFiles` if the component uses it.
    // If MediaGrid.vue was refactored, it probably uses `playerStore.state.displayedMediaFiles` or `uiStore...`.
    // I will mock `displayedMediaFiles` and ensure the test populates THAT instead of `gridMediaFiles`.
    // The tests used `mockState.gridMediaFiles = ...`. I will change that to `mockPlayerState.displayedMediaFiles = ...`.

    vi.clearAllMocks();
    (ResizeObserverMock as any).mock.calls = [];

    (useLibraryStore as Mock).mockReturnValue({
      state: mockLibraryState,
      ...toRefs(mockLibraryState),
    });

    (usePlayerStore as Mock).mockReturnValue({
      state: mockPlayerState,
      ...toRefs(mockPlayerState),
    });

    (useUIStore as Mock).mockReturnValue({
      state: mockUIState,
      ...toRefs(mockUIState),
    });

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
    const emptyState = wrapper.find('[role="status"]');
    expect(emptyState.exists()).toBe(true);
    expect(emptyState.attributes('aria-live')).toBe('polite');
    expect(wrapper.text()).toContain('No media files found');
    expect(wrapper.text()).toContain('Try selecting a different album');
  });

  it('renders grid items when gridMediaFiles has items', async () => {
    mockUIState.gridMediaFiles = [
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
    await flushPromises();
    await wrapper.vm.$nextTick();

    const items = wrapper.findAll('.grid-item');
    expect(items).toHaveLength(2);

    const img = items[0].find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toContain(
      encodeURIComponent('/path/to/image1.jpg'),
    );

    // Bolt Optimization: Video items now render an img (thumbnail) by default
    const videoImg = items[1].find('img');
    expect(videoImg.exists()).toBe(true);
    // It should point to the thumbnail generator output
    expect(videoImg.attributes('src')).toContain('thumb');
    expect(videoImg.attributes('src')).toContain(
      encodeURIComponent('/path/to/video1.mp4'),
    );
  });

  it('falls back to video tag when thumbnail loading fails', async () => {
    mockUIState.gridMediaFiles = [
      { path: '/path/to/video_fail.mp4', name: 'video_fail.mp4' },
    ];

    const wrapper = mountGrid();
    await flushPromises();

    // Trigger resize
    const calls = (ResizeObserverMock as any).mock.calls;
    const observerCallback = calls[calls.length - 1][0];
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await flushPromises();
    await wrapper.vm.$nextTick();

    const items = wrapper.findAll('.grid-item');
    expect(items).toHaveLength(1);

    // Initially should be img
    const img = items[0].find('img');
    expect(img.exists()).toBe(true);
    expect(items[0].find('video').exists()).toBe(false);

    // Simulate error
    await img.trigger('error');

    // Now should be video
    expect(items[0].find('img').exists()).toBe(false);
    expect(items[0].find('video').exists()).toBe(true);
    expect(items[0].find('video').attributes('src')).toContain(
      encodeURIComponent('/path/to/video_fail.mp4'),
    );
  });

  it('handles item click correctly', async () => {
    const item1 = { path: '/path/to/image1.jpg', name: 'image1.jpg' };
    mockUIState.gridMediaFiles = [item1];

    const wrapper = mountGrid();
    await flushPromises();

    // Trigger resize to render items
    const calls = (ResizeObserverMock as any).mock.calls;
    const observerCallback = calls[calls.length - 1][0];
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await flushPromises();
    await wrapper.vm.$nextTick();

    const item = wrapper.find('.grid-item');
    await item.trigger('click');

    expect(mockUIState.viewMode).toBe('player');
    expect(mockPlayerState.isSlideshowActive).toBe(true);
    expect(mockPlayerState.currentMediaIndex).toBe(0);
    expect(mockPlayerState.currentMediaItem).toEqual(
      expect.objectContaining(item1),
    );
  });

  it('passes correct index when clicking item in second row', async () => {
    // 3 items. If width=1000, items per row depends on logic.
    // 1000px width -> 3 cols (logic in component: w < 1024 -> 3)
    // Row 1: index 0, 1, 2
    // Row 2: index 3...
    const items = [
      { path: '0.jpg', name: '0.jpg' },
      { path: '1.jpg', name: '1.jpg' },
      { path: '2.jpg', name: '2.jpg' },
      { path: '3.jpg', name: '3.jpg' },
    ];
    mockUIState.gridMediaFiles = items;

    const wrapper = mountGrid();
    await flushPromises();

    // Trigger ResizeObserver (3 cols)
    const calls = (ResizeObserverMock as any).mock.calls;
    const observerCallback = calls[calls.length - 1][0];
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await flushPromises();
    await wrapper.vm.$nextTick();

    // Click item at index 3 (first item of second row)
    // Items are rendered via RecycleScroller slots.
    // We need to find the specific grid item.
    // The wrapper finds all .grid-item across all rows rendered by stub.
    const gridItems = wrapper.findAll('.grid-item');
    // We expect 4 items rendered
    expect(gridItems).toHaveLength(4);

    await gridItems[3].trigger('click');

    expect(mockPlayerState.currentMediaIndex).toBe(3);
    expect(mockPlayerState.currentMediaItem.path).toBe('3.jpg');
  });

  it('closes grid view when Close button is clicked', async () => {
    const wrapper = mountGrid();

    const closeButton = wrapper.find('button[title="Close Grid View"]');
    await closeButton.trigger('click');

    expect(mockUIState.viewMode).toBe('player');
  });

  // Replaced "infinite scroll" test with "renders all items virtually" check
  // Since we use chunking, checking that all items are passed to the scroller is sufficient
  it('passes all items to scroller (virtual scrolling)', async () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      path: `/path/item${i}.jpg`,
      name: `item${i}.jpg`,
    }));
    mockUIState.gridMediaFiles = items;

    const wrapper = mountGrid();
    await flushPromises();

    // Trigger resize (5 columns)
    const calls = (ResizeObserverMock as any).mock.calls;
    const observerCallback = calls[calls.length - 1][0];
    observerCallback([
      { contentRect: { width: 1400 }, contentBoxSize: [{ inlineSize: 1400 }] },
    ]);
    await flushPromises();
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
    mockUIState.gridMediaFiles = [
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
    await flushPromises();
    await wrapper.vm.$nextTick();

    const img = wrapper.find('img');
    expect(img.attributes('src')).toContain('with%20spaces');
  });

  it('handles files with no extension', async () => {
    mockUIState.gridMediaFiles = [
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
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('video').exists()).toBe(false);
  });

  it('handles tricky paths correctly (dots in dirs, dotfiles)', async () => {
    mockUIState.gridMediaFiles = [
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
    await flushPromises();
    await wrapper.vm.$nextTick();

    // Should render all grid items (placeholders), but only one image content
    expect(wrapper.findAll('.grid-item')).toHaveLength(3);
    expect(wrapper.findAll('img')).toHaveLength(1);
    const img = wrapper.find('img');
    expect(img.attributes('src')).toContain('image.jpg');
  });
});
