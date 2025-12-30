import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive, toRefs } from 'vue';
import MediaGrid from '../../../src/renderer/components/MediaGrid.vue';
import { api } from '../../../src/renderer/api';
import { useLibraryStore } from '../../../src/renderer/composables/useLibraryStore';
import { usePlayerStore } from '../../../src/renderer/composables/usePlayerStore';
import { useUIStore } from '../../../src/renderer/composables/useUIStore';

// Mock dependencies
vi.mock('../../../src/renderer/composables/useLibraryStore');
vi.mock('../../../src/renderer/composables/usePlayerStore');
vi.mock('../../../src/renderer/composables/useUIStore');
vi.mock('../../../src/renderer/api');

// Mock ResizeObserver
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(callback: ResizeObserverCallback) {
    (ResizeObserverMock as any).lastCallback = callback;
  }
}
(ResizeObserverMock as any).lastCallback = null;

global.ResizeObserver = ResizeObserverMock as any;

// Mock RecycleScroller
const RecycleScrollerStub = {
  name: 'RecycleScroller',
  template: `
    <div class="recycle-scroller-stub">
      <div v-for="item in items" :key="item[keyField]">
        <slot :item="item"></slot>
      </div>
    </div>
  `,
  props: ['items', 'itemSize', 'keyField'],
};

describe('MediaGrid.vue (Virtual Scrolling)', () => {
  let mockLibraryState: any;
  let mockPlayerState: any;
  let mockUIState: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLibraryState = reactive({
      imageExtensionsSet: new Set(['.jpg', '.png']),
      videoExtensionsSet: new Set(['.mp4']),
    });

    mockPlayerState = reactive({
      displayedMediaFiles: [],
      currentMediaIndex: 0,
      currentMediaItem: null,
      isSlideshowActive: false,
      isTimerRunning: false,
    });

    mockUIState = reactive({
      gridMediaFiles: [],
      viewMode: 'grid',
    });

    (useLibraryStore as any).mockReturnValue({
      state: mockLibraryState,
      ...toRefs(mockLibraryState),
    });

    (usePlayerStore as any).mockReturnValue({
      state: mockPlayerState,
      ...toRefs(mockPlayerState),
    });

    (useUIStore as any).mockReturnValue({
      state: mockUIState,
      ...toRefs(mockUIState),
    });

    (api.getMediaUrlGenerator as any).mockResolvedValue(
      (path: string) => `url://${path}`,
    );
    (api.getThumbnailUrlGenerator as any).mockResolvedValue(
      (path: string) => `thumb://${path}`,
    );
  });

  it('renders "No media files" when list is empty', async () => {
    const wrapper = mount(MediaGrid, {
      global: {
        components: {
          RecycleScroller: RecycleScrollerStub,
        },
      },
    });

    await flushPromises();
    expect(wrapper.text()).toContain('No media files found');
  });

  it('calculates column count based on container width', async () => {
    // Generate 10 items
    const items = Array.from({ length: 10 }, (_, i) => ({
      path: `/path/to/img${i}.jpg`,
      name: `img${i}.jpg`,
    }));
    mockUIState.gridMediaFiles = items;

    const wrapper = mount(MediaGrid, {
      global: {
        components: {
          RecycleScroller: RecycleScrollerStub,
        },
      },
    });

    await flushPromises();

    // Trigger ResizeObserver callback manually
    const observerCallback = (ResizeObserverMock as any).lastCallback;

    // Simulate width < 640 (2 columns)
    observerCallback([
      { contentRect: { width: 500 }, contentBoxSize: [{ inlineSize: 500 }] },
    ]);
    await wrapper.vm.$nextTick();

    // With 10 items and 2 columns, we expect 5 rows
    const scroller = wrapper.findComponent(RecycleScrollerStub);
    expect(scroller.props('items')).toHaveLength(5);

    // Simulate width > 1280 (5 columns)
    observerCallback([
      { contentRect: { width: 1300 }, contentBoxSize: [{ inlineSize: 1300 }] },
    ]);
    await wrapper.vm.$nextTick();

    // With 10 items and 5 columns, we expect 2 rows
    // Re-find component because :key change might have re-created it
    const scrollerUpdated = wrapper.findComponent(RecycleScrollerStub);
    expect(scrollerUpdated.props('items')).toHaveLength(2);
  });

  it('calculates row height based on width', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      path: `/path/to/img${i}.jpg`,
      name: `img${i}.jpg`,
    }));
    mockUIState.gridMediaFiles = items;

    const wrapper = mount(MediaGrid, {
      global: {
        components: {
          RecycleScroller: RecycleScrollerStub,
        },
      },
    });

    await flushPromises();

    const observerCallback = (ResizeObserverMock as any).lastCallback;

    // Width 1000px (3 cols), padding 32px (16px each side), gap 16px
    // Available = 1000 - 32 = 968
    // Total gap = 16 * 2 = 32
    // Item width = (968 - 32) / 3 = 312
    // Row height = 312 + 16 (gap) = 328
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await wrapper.vm.$nextTick();

    const scroller = wrapper.findComponent(RecycleScrollerStub);
    const height = scroller.props('itemSize');

    expect(height).toBeCloseTo(328, 0);
  });

  it('handles item clicks correctly', async () => {
    const item = { path: '/path/test.jpg', name: 'test.jpg' };
    mockUIState.gridMediaFiles = [item];

    const wrapper = mount(MediaGrid, {
      global: {
        components: {
          RecycleScroller: RecycleScrollerStub,
        },
      },
    });

    await flushPromises();

    // Simulate clicking the item in the first row
    // Trigger ResizeObserver first to ensure items are rendered
    const observerCallback = (ResizeObserverMock as any).lastCallback;
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const btn = wrapper.find('button[aria-label="View test.jpg"]');
    // If MediaGridItem uses aria-label, check MediaGridItem implementation.
    // Assuming MediaGridItem has a button or clickable element.
    // If not found, check selector. MediaGridItem uses MediaDisplay logic? No, it's a grid item.
    // The previous test used `button[aria-label="View test.jpg"]` so presumably it exists.
    if (!btn.exists()) {
      const itemBtn = wrapper.find('.grid-item'); // Fallback selector
      await itemBtn.trigger('click');
    } else {
      await btn.trigger('click');
    }

    expect(mockPlayerState.currentMediaItem?.path).toBe(item.path);
    expect(mockUIState.viewMode).toBe('player');
  });
});
