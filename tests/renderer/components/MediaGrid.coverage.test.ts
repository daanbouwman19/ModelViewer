import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';
import MediaGrid from '../../../src/renderer/components/MediaGrid.vue';
import { useAppState } from '../../../src/renderer/composables/useAppState';
import { api } from '../../../src/renderer/api';

// Mock dependencies
vi.mock('../../../src/renderer/composables/useAppState');
vi.mock('../../../src/renderer/api');

describe('MediaGrid.vue Coverage', () => {
  let mockState: any;

  beforeEach(() => {
    vi.resetAllMocks();
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

    // Default mocks for api
    (api.getMediaUrlGenerator as any).mockResolvedValue(
      (path: string) => `url://${path}`,
    );
    (api.getThumbnailUrlGenerator as any).mockResolvedValue(
      (path: string) => `thumb://${path}`,
    );

    (useAppState as any).mockReturnValue({ state: mockState });
  });

  it('getExtension edge cases: no dot', () => {
    mockState.gridMediaFiles = [
      { name: 'file-no-ext', path: '/path/to/file-no-ext', viewCount: 0 },
    ];
    const wrapper = mount(MediaGrid);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('video').exists()).toBe(false);
  });

  it('getExtension edge cases: dot in directory name', () => {
    mockState.gridMediaFiles = [
      { name: 'file', path: '/path.with.dot/file', viewCount: 0 },
    ];
    const wrapper = mount(MediaGrid);
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('getExtension edge cases: dotfile', () => {
    mockState.gridMediaFiles = [
      { name: '.gitignore', path: '/.gitignore', viewCount: 0 },
    ];
    const wrapper = mount(MediaGrid);
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('handleItemClick sets state correctly', async () => {
    const item = { name: 'img.jpg', path: '/img.jpg', viewCount: 0 };
    mockState.gridMediaFiles = [item];
    const wrapper = mount(MediaGrid);
    await flushPromises();

    await wrapper.find('button.grid-item').trigger('click');

    expect(mockState.viewMode).toBe('player');
    expect(mockState.isSlideshowActive).toBe(true);
    expect(mockState.currentMediaItem.path).toEqual(item.path);
  });

  it('closeGrid sets viewMode to player', async () => {
    const wrapper = mount(MediaGrid);
    await wrapper.find('button[title="Close Grid View"]').trigger('click');
    expect(mockState.viewMode).toBe('player');
  });

  it('uses getPosterUrl for videos', async () => {
    const item = { name: 'vid.mp4', path: '/vid.mp4', viewCount: 0 };
    mockState.gridMediaFiles = [item];
    const mockThumbGen = vi.fn().mockReturnValue('thumb.jpg');
    (api.getThumbnailUrlGenerator as any).mockResolvedValue(mockThumbGen);

    const wrapper = mount(MediaGrid);
    await flushPromises(); // Wait for onMounted to finish
    await nextTick(); // Wait for DOM update

    const video = wrapper.find('video');
    expect(video.attributes('poster')).toBe('thumb.jpg');
    expect(mockThumbGen).toHaveBeenCalledWith('/vid.mp4');
  });

  it('handles scroll logic (throttled)', async () => {
    // Generate many items
    const items = Array.from({ length: 100 }, (_, i) => ({
      name: `img${i}.jpg`,
      path: `/img${i}.jpg`,
      viewCount: 0,
    }));
    mockState.gridMediaFiles = items;

    const wrapper = mount(MediaGrid);
    await flushPromises();
    await nextTick();

    // Initially 24 items (BATCH_SIZE)
    expect(wrapper.findAll('.grid-item').length).toBe(24);

    const container = wrapper.find('.media-grid-container');

    // Mock scroll properties
    Object.defineProperty(container.element, 'scrollTop', {
      value: 1000,
      configurable: true,
    });
    Object.defineProperty(container.element, 'clientHeight', {
      value: 500,
      configurable: true,
    });
    Object.defineProperty(container.element, 'scrollHeight', {
      value: 1600,
      configurable: true,
    });

    await container.trigger('scroll');

    // Wait for throttle (150ms)
    await new Promise((r) => setTimeout(r, 200));
    await nextTick();

    // Should have loaded more
    expect(wrapper.findAll('.grid-item').length).toBe(48);
  });

  it('scroll logic does not exceed max files', async () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      name: `img${i}.jpg`,
      path: `/img${i}.jpg`,
      viewCount: 0,
    }));
    mockState.gridMediaFiles = items;

    const wrapper = mount(MediaGrid);
    await flushPromises();

    // Set visible count close to max
    (wrapper.vm as any).visibleCount = 28;

    const container = wrapper.find('.media-grid-container');
    Object.defineProperty(container.element, 'scrollTop', {
      value: 1000,
      configurable: true,
    });
    Object.defineProperty(container.element, 'clientHeight', {
      value: 500,
      configurable: true,
    });
    Object.defineProperty(container.element, 'scrollHeight', {
      value: 1600,
      configurable: true,
    });

    await container.trigger('scroll');
    await new Promise((r) => setTimeout(r, 200));
    await nextTick();

    // Should cap at 30
    expect(wrapper.findAll('.grid-item').length).toBe(30);
  });

  it('resets visible count when allMediaFiles changes', async () => {
    mockState.gridMediaFiles = Array.from({ length: 50 }, (_, i) => ({
      name: `${i}.jpg`,
      path: `${i}.jpg`,
    }));
    const wrapper = mount(MediaGrid);
    await flushPromises();
    await nextTick();

    const container = wrapper.find('.media-grid-container');
    Object.defineProperty(container.element, 'scrollTop', {
      value: 1000,
      configurable: true,
    });
    Object.defineProperty(container.element, 'clientHeight', {
      value: 500,
      configurable: true,
    });
    Object.defineProperty(container.element, 'scrollHeight', {
      value: 1600,
      configurable: true,
    });

    await container.trigger('scroll');
    await new Promise((r) => setTimeout(r, 200));
    await nextTick();

    expect(wrapper.findAll('.grid-item').length).toBe(48);

    // Change files - THIS should trigger watcher because mockState is reactive
    mockState.gridMediaFiles = [
      { name: 'new.jpg', path: 'new.jpg', viewCount: 0 },
    ];

    await nextTick(); // watcher triggers
    await nextTick(); // render updates

    expect(wrapper.findAll('.grid-item').length).toBe(1);

    // To verify it reset to 24
    mockState.gridMediaFiles = Array.from({ length: 100 }, (_, i) => ({
      name: `new${i}.jpg`,
      path: `new${i}.jpg`,
    }));
    await nextTick();
    await nextTick();
    expect(wrapper.findAll('.grid-item').length).toBe(24);
  });

  it('handles api error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (api.getMediaUrlGenerator as any).mockRejectedValue(new Error('API Fail'));

    // Mount component AFTER setting up the mock so onMounted triggers the error
    mount(MediaGrid);
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
    const wrapper = mount(MediaGrid);

    // Should be empty initially
    expect(wrapper.find('img').attributes('src')).toBe('');

    resolveGen(() => 'url');
    await flushPromises();
    await nextTick();

    expect(wrapper.find('img').attributes('src')).toBe('url');
  });

  it('getDisplayName fallback to path parsing', () => {
    // Create a file without name property (simulate old data or edge case)
    // Although type says name is string, at runtime it might be missing
    const item = { path: '/some/path/file.jpg' } as any;
    mockState.gridMediaFiles = [item];
    const wrapper = mount(MediaGrid);

    // Should find the text in the component
    expect(wrapper.text()).toContain('file.jpg');
  });
});
