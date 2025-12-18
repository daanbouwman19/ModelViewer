import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';
import MediaGrid from '../../../src/renderer/components/MediaGrid.vue';
import { useAppState } from '../../../src/renderer/composables/useAppState';
import { api } from '../../../src/renderer/api';

// Mock dependencies
vi.mock('../../../src/renderer/composables/useAppState');
vi.mock('../../../src/renderer/api');

describe('MediaGrid.vue', () => {
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

  describe('Edge Cases', () => {
    it('getExtension: no dot', () => {
      mockState.gridMediaFiles = [
        { name: 'file-no-ext', path: '/path/to/file-no-ext', viewCount: 0 },
      ];
      const wrapper = mount(MediaGrid);
      expect(wrapper.find('img').exists()).toBe(false);
      expect(wrapper.find('video').exists()).toBe(false);
    });

    it('getExtension: dot in directory name', () => {
      mockState.gridMediaFiles = [
        { name: 'file', path: '/path.with.dot/file', viewCount: 0 },
      ];
      const wrapper = mount(MediaGrid);
      expect(wrapper.find('img').exists()).toBe(false);
    });

    it('getExtension: dotfile', () => {
      mockState.gridMediaFiles = [
        { name: '.gitignore', path: '/.gitignore', viewCount: 0 },
      ];
      const wrapper = mount(MediaGrid);
      expect(wrapper.find('img').exists()).toBe(false);
    });

    it('getDisplayName fallback to path parsing', () => {
      const item = { path: '/some/path/file.jpg' } as any;
      mockState.gridMediaFiles = [item];
      const wrapper = mount(MediaGrid);
      expect(wrapper.text()).toContain('file.jpg');
    });
  });

  describe('Interactions', () => {
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
  });

  describe('Render Logic', () => {
    it('uses getPosterUrl for videos', async () => {
      const item = { name: 'vid.mp4', path: '/vid.mp4', viewCount: 0 };
      mockState.gridMediaFiles = [item];
      const mockThumbGen = vi.fn().mockReturnValue('thumb.jpg');
      (api.getThumbnailUrlGenerator as any).mockResolvedValue(mockThumbGen);

      const wrapper = mount(MediaGrid);
      await flushPromises();
      await nextTick();

      const video = wrapper.find('video');
      expect(video.attributes('poster')).toBe('thumb.jpg');
      expect(mockThumbGen).toHaveBeenCalledWith('/vid.mp4');
    });

    it('getMediaUrl returns empty if generator not ready', async () => {
      let resolveGen: any;
      (api.getMediaUrlGenerator as any).mockReturnValue(
        new Promise((r) => (resolveGen = r)),
      );

      mockState.gridMediaFiles = [{ name: 'img.jpg', path: '/img.jpg' }];
      const wrapper = mount(MediaGrid);

      expect(wrapper.find('img').attributes('src')).toBe('');

      resolveGen(() => 'url');
      await flushPromises();
      await nextTick();

      expect(wrapper.find('img').attributes('src')).toBe('url');
    });
  });

  describe('Scrolling & Pagination', () => {
    it('handles scroll logic (throttled)', async () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        name: `img${i}.jpg`,
        path: `/img${i}.jpg`,
        viewCount: 0,
      }));
      mockState.gridMediaFiles = items;

      const wrapper = mount(MediaGrid);
      await flushPromises();
      await nextTick();

      expect(wrapper.findAll('.grid-item').length).toBe(24); // BATCH_SIZE

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
      await new Promise((r) => setTimeout(r, 200)); // Wait for throttle
      await nextTick();

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

      mockState.gridMediaFiles = [
        { name: 'new.jpg', path: 'new.jpg', viewCount: 0 },
      ];

      await nextTick();
      await nextTick();

      expect(wrapper.findAll('.grid-item').length).toBe(1);
    });
  });

  it('handles api error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (api.getMediaUrlGenerator as any).mockRejectedValue(new Error('API Fail'));

    mount(MediaGrid);
    await flushPromises();

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to initialize media URL generators',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});
