import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import MediaGrid from '../../../src/renderer/components/MediaGrid.vue';
import { useAppState } from '../../../src/renderer/composables/useAppState';
import { api } from '../../../src/renderer/api';

// Mock dependencies
vi.mock('../../../src/renderer/composables/useAppState');
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

// Mock RecycleScroller component since we can't easily test the virtual scrolling logic in JSDOM
// We just want to ensure it receives the correct props
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

interface MockState {
  gridMediaFiles: Array<{ path: string; name: string }>;
  displayedMediaFiles: Array<{ path: string; name: string }>;
  currentMediaIndex: number;
  currentMediaItem: { path: string; name: string } | null;
  viewMode: string;
  isSlideshowActive: boolean;
  isTimerRunning: boolean;
}

describe('MediaGrid.vue (Virtual Scrolling)', () => {
  let mockState: MockState;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      gridMediaFiles: [],
      displayedMediaFiles: [],
      currentMediaIndex: 0,
      currentMediaItem: null,
      viewMode: 'grid',
      isSlideshowActive: false,
      isTimerRunning: false,
    };

    (useAppState as any).mockReturnValue({
      state: mockState,
      imageExtensionsSet: { value: new Set(['.jpg', '.png']) },
      videoExtensionsSet: { value: new Set(['.mp4']) },
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
    mockState.gridMediaFiles = items;

    const wrapper = mount(MediaGrid, {
      global: {
        components: {
          RecycleScroller: RecycleScrollerStub,
        },
      },
    });

    await flushPromises();

    // Trigger ResizeObserver callback manually
    // We need to access the callback passed to the mock constructor
    const observerCallback = (ResizeObserverMock as any).lastCallback;

    // Simulate width < 640 (2 columns)
    observerCallback([
      { contentRect: { width: 500 }, contentBoxSize: [{ inlineSize: 500 }] },
    ]);
    await wrapper.vm.$nextTick();

    // Check computed property indirectly by looking at how items are chunked in the stub
    // With 10 items and 2 columns, we expect 5 rows
    const scroller = wrapper.findComponent(RecycleScrollerStub);
    expect(scroller.props('items')).toHaveLength(5);
    expect(scroller.props('items')[0].items).toHaveLength(2); // 2 items per row

    // Simulate width > 1280 (5 columns)
    observerCallback([
      { contentRect: { width: 1300 }, contentBoxSize: [{ inlineSize: 1300 }] },
    ]);
    await wrapper.vm.$nextTick();

    // With 10 items and 5 columns, we expect 2 rows
    // Re-find component because :key change might have re-created it
    const scrollerUpdated = wrapper.findComponent(RecycleScrollerStub);
    expect(scrollerUpdated.props('items')).toHaveLength(2);
    expect(scrollerUpdated.props('items')[0].items).toHaveLength(5); // 5 items per row
  });

  it('calculates row height based on width', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      path: `/path/to/img${i}.jpg`,
      name: `img${i}.jpg`,
    }));
    mockState.gridMediaFiles = items;

    const wrapper = mount(MediaGrid, {
      global: {
        components: {
          RecycleScroller: RecycleScrollerStub,
        },
      },
    });

    await flushPromises();

    const observerCallback = (ResizeObserverMock as any).lastCallback;

    // Width 1000px (3 cols), padding 32px (NOT SUBTRACTED), gap 16px
    // Available = 1000
    // Total gap = 16 * 2 = 32
    // Item width = (1000 - 32) / 3 = 322.66 -> floor(322)
    // Row height = 322 + 16 (gap) = 338
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await wrapper.vm.$nextTick();

    const scroller = wrapper.findComponent(RecycleScrollerStub);
    const height = scroller.props('itemSize');

    expect(height).toBeCloseTo(338, 0);
  });

  it('handles item clicks correctly', async () => {
    const item = { path: '/path/test.jpg', name: 'test.jpg' };
    mockState.gridMediaFiles = [item];

    const wrapper = mount(MediaGrid, {
      global: {
        components: {
          RecycleScroller: RecycleScrollerStub,
        },
      },
    });

    await flushPromises();

    // Simulate clicking the item in the first row
    const btn = wrapper.find('button[aria-label="View test.jpg"]');
    await btn.trigger('click');

    expect(mockState.currentMediaItem?.path).toBe(item.path);
    expect(mockState.viewMode).toBe('player');
  });
});
