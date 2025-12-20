import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';
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
        <slot :item="item"></slot>
      </div>
    </div>
  `,
  props: ['items', 'itemSize', 'keyField'],
};

describe('MediaGrid.vue Coverage', () => {
  let mockState: any;

  beforeEach(() => {
    vi.resetAllMocks();
    (ResizeObserverMock as any).mock.calls = []; // Reset static mock calls
    mockState = reactive({
      gridMediaFiles: [],
      supportedExtensions: {
        images: ['.jpg', '.png'],
        videos: ['.mp4', '.mkv'],
        all: ['.jpg', '.png', '.mp4', '.mkv'],
      },
      viewMode: 'grid',
      displayedMediaFiles: [],
      currentMediaIndex: -1,
      currentMediaItem: null,
      isSlideshowActive: false,
      isTimerRunning: false,
    });

    (api.getMediaUrlGenerator as any).mockResolvedValue(
      (path: string) => `url://${path}`,
    );
    (api.getThumbnailUrlGenerator as any).mockResolvedValue(
      (path: string) => `thumb://${path}`,
    );

    (useAppState as any).mockReturnValue({
      state: mockState,
      imageExtensionsSet: {
        value: new Set(mockState.supportedExtensions.images),
      },
      videoExtensionsSet: {
        value: new Set(mockState.supportedExtensions.videos),
      },
    });
  });

  const mountGrid = () =>
    mount(MediaGrid, {
      global: {
        components: {
          RecycleScroller: RecycleScrollerStub,
        },
      },
    });

  it('getExtension edge cases: no dot', async () => {
    mockState.gridMediaFiles = [
      { name: 'file-no-ext', path: '/path/to/file-no-ext', viewCount: 0 },
    ];
    const wrapper = mountGrid();
    await flushPromises();

    // Trigger Resize
    const calls = (ResizeObserverMock as any).mock.calls;
    const observerCallback = calls[calls.length - 1][0];
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('video').exists()).toBe(false);
  });

  it('getExtension edge cases: dot in directory name', async () => {
    mockState.gridMediaFiles = [
      { name: 'file', path: '/path.with.dot/file', viewCount: 0 },
    ];
    const wrapper = mountGrid();
    await flushPromises();

    // Trigger Resize
    const calls = (ResizeObserverMock as any).mock.calls;
    const observerCallback = calls[calls.length - 1][0];
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('getExtension edge cases: dotfile', async () => {
    mockState.gridMediaFiles = [
      { name: '.gitignore', path: '/.gitignore', viewCount: 0 },
    ];
    const wrapper = mountGrid();
    await flushPromises();

    // Trigger Resize
    const calls = (ResizeObserverMock as any).mock.calls;
    const observerCallback = calls[calls.length - 1][0];
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('handleItemClick sets state correctly', async () => {
    const item = { name: 'img.jpg', path: '/img.jpg', viewCount: 0 };
    mockState.gridMediaFiles = [item];
    const wrapper = mountGrid();
    await flushPromises();

    // Trigger Resize
    const calls = (ResizeObserverMock as any).mock.calls;
    const observerCallback = calls[calls.length - 1][0];
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await wrapper.vm.$nextTick();

    await wrapper.find('button.grid-item').trigger('click');

    expect(mockState.viewMode).toBe('player');
    expect(mockState.isSlideshowActive).toBe(true);
    expect(mockState.currentMediaItem.path).toEqual(item.path);
  });

  it('closeGrid sets viewMode to player', async () => {
    const wrapper = mountGrid();
    await wrapper.find('button[title="Close Grid View"]').trigger('click');
    expect(mockState.viewMode).toBe('player');
  });

  it('uses getPosterUrl for videos', async () => {
    const item = { name: 'vid.mp4', path: '/vid.mp4', viewCount: 0 };
    mockState.gridMediaFiles = [item];
    const mockThumbGen = vi.fn().mockReturnValue('thumb.jpg');
    (api.getThumbnailUrlGenerator as any).mockResolvedValue(mockThumbGen);

    const wrapper = mountGrid();
    await flushPromises();

    // Trigger Resize
    const calls = (ResizeObserverMock as any).mock.calls;
    const observerCallback = calls[calls.length - 1][0];
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await wrapper.vm.$nextTick();
    await nextTick();

    const video = wrapper.find('video');
    expect(video.attributes('poster')).toBe('thumb.jpg');
    expect(mockThumbGen).toHaveBeenCalledWith('/vid.mp4');
  });

  it('updates chunking when allMediaFiles changes', async () => {
    mockState.gridMediaFiles = Array.from({ length: 50 }, (_, i) => ({
      name: `${i}.jpg`,
      path: `${i}.jpg`,
    }));
    const wrapper = mountGrid();
    await flushPromises();

    // Resize for 5 columns
    const calls = (ResizeObserverMock as any).mock.calls;
    const observerCallback = calls[calls.length - 1][0];
    observerCallback([
      { contentRect: { width: 1400 }, contentBoxSize: [{ inlineSize: 1400 }] },
    ]);
    await wrapper.vm.$nextTick();

    // 50 / 5 = 10 rows
    expect(
      wrapper.findComponent(RecycleScrollerStub).props('items'),
    ).toHaveLength(10);

    // Change data
    mockState.gridMediaFiles = [
      { name: 'new.jpg', path: 'new.jpg', viewCount: 0 },
    ];
    await nextTick();

    // 1 item / 5 cols = 1 row
    expect(
      wrapper.findComponent(RecycleScrollerStub).props('items'),
    ).toHaveLength(1);
  });

  it('handles api error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (api.getMediaUrlGenerator as any).mockRejectedValue(new Error('API Fail'));

    mountGrid();
    await flushPromises();

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to initialize media URL generators',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('getMediaUrl returns empty if generator not ready', async () => {
    // Delayed promise
    let resolveGen: any;
    (api.getMediaUrlGenerator as any).mockReturnValue(
      new Promise((r) => (resolveGen = r)),
    );

    mockState.gridMediaFiles = [{ name: 'img.jpg', path: '/img.jpg' }];
    const wrapper = mountGrid();
    await flushPromises();

    // Trigger Resize
    const calls = (ResizeObserverMock as any).mock.calls;
    const observerCallback = calls[calls.length - 1][0];
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await wrapper.vm.$nextTick();

    // Should be empty initially
    expect(wrapper.find('img').attributes('src')).toBe('');

    resolveGen(() => 'url');
    // We need to wait for the promise to resolve AND the watcher to run
    await flushPromises();
    await nextTick();

    expect(wrapper.find('img').attributes('src')).toBe('url');
  });

  it('getDisplayName fallback to path parsing', async () => {
    const item = { path: '/some/path/file.jpg' } as any;
    mockState.gridMediaFiles = [item];
    const wrapper = mountGrid();
    await flushPromises();

    // Trigger Resize
    const calls = (ResizeObserverMock as any).mock.calls;
    const observerCallback = calls[calls.length - 1][0];
    observerCallback([
      { contentRect: { width: 1000 }, contentBoxSize: [{ inlineSize: 1000 }] },
    ]);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('file.jpg');
  });
});
