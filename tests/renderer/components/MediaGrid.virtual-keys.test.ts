import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive, toRefs } from 'vue';
import MediaGrid from '../../../src/renderer/components/MediaGrid.vue';
import MediaGridItem from '../../../src/renderer/components/MediaGridItem.vue';
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

// A special stub for RecycleScroller that allows us to change the 'item' prop passed to the slot
// without unmounting the slot content container itself.
const RecycleScrollerStub = {
  name: 'RecycleScroller',
  template: `
    <div class="recycle-scroller-stub">
      <slot :item="currentItem"></slot>
    </div>
  `,
  data() {
    return {
      currentItem: { id: 'row-0', startIndex: 0 },
    };
  },
  props: ['items', 'itemSize', 'keyField'],
  methods: {
    updateItem(newItem: any) {
      (this as any).currentItem = newItem;
    },
  },
};

describe('MediaGrid.vue (Virtualization Keys)', () => {
  let mockLibraryState: any;
  let mockPlayerState: any;
  let mockUIState: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLibraryState = reactive({
      imageExtensionsSet: new Set(['.jpg', '.png']),
      videoExtensionsSet: new Set(['.mp4']),
      mediaUrlGenerator: (path: string) => `url://${path}`,
      thumbnailUrlGenerator: (path: string) => `thumb://${path}`,
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

  it('reuses MediaGridItem components when scrolling (recycling rows)', async () => {
    // Setup enough items for multiple rows
    const items = Array.from({ length: 20 }, (_, i) => ({
      path: `/path/img${i}.jpg`,
      name: `img${i}.jpg`,
      id: `img${i}`,
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

    // Trigger resize to set column count
    const observerCallback = (ResizeObserverMock as any).lastCallback;
    // 1000px width -> usually 3 columns (md:grid-cols-3) or 4 depending on breakpoints
    // In MediaGrid: < 768 is 2, < 1024 is 3. So 1000px is 3 columns.
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await wrapper.vm.$nextTick();

    // Verify initial render
    const scroller = wrapper.findComponent(RecycleScrollerStub);
    const mediaItems = wrapper.findAllComponents(MediaGridItem);

    // With 3 columns, row 0 has items 0, 1, 2.
    expect(mediaItems.length).toBe(3);
    const firstItemComponent = mediaItems[0];
    const initialVm = firstItemComponent.vm;

    // Simulate scrolling by updating the row passed to the slot
    // The RecycleScrollerStub exposes updateItem for this purpose.
    // Move to next row: startIndex should be 3 (cols=3)
    (scroller.vm as any).updateItem({ id: 'row-3', startIndex: 3 });

    await wrapper.vm.$nextTick();
    await flushPromises();

    // Verify updated render
    const updatedMediaItems = wrapper.findAllComponents(MediaGridItem);
    expect(updatedMediaItems.length).toBe(3);

    // The first item in the row should now display item index 3
    // But critically, the component instance should be the SAME as before
    const updatedFirstItemComponent = updatedMediaItems[0];

    // Check if the component instance was reused
    // We check internal UID to confirm it's the same instance
    expect(updatedFirstItemComponent.vm.$.uid).toBe(initialVm.$.uid);

    // Also verify props updated
    expect(updatedFirstItemComponent.props('item').path).toBe('/path/img3.jpg');
  });
});
