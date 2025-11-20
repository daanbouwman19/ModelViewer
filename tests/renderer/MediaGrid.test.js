import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import MediaGrid from '../../src/renderer/components/MediaGrid.vue';
import { useAppState } from '../../src/renderer/composables/useAppState';

// Mock dependencies
vi.mock('../../src/renderer/composables/useAppState');
vi.mock('../../src/renderer/composables/useSlideshow', () => ({
  useSlideshow: () => ({}),
}));

describe('MediaGrid.vue', () => {
  const mockState = {
    gridMediaFiles: [],
    supportedExtensions: {
      images: ['.jpg', '.png'],
      videos: ['.mp4'],
    },
    currentMediaItem: null,
    displayedMediaFiles: [],
    currentMediaIndex: -1,
    viewMode: 'grid',
    isSlideshowActive: false,
    isTimerRunning: false,
  };

  beforeEach(() => {
    vi.mocked(useAppState).mockReturnValue({
      state: mockState,
    });
    mockState.gridMediaFiles = [];

    // Mock window.electronAPI
    global.window.electronAPI = {
      loadFile: vi
        .fn()
        .mockResolvedValue({
          type: 'http-url',
          url: 'http://localhost:3000/file.jpg',
        }),
      getServerPort: vi.fn().mockResolvedValue(3000),
    };
  });

  afterEach(() => {
    delete global.window.electronAPI;
  });

  it('renders empty state message when no files', () => {
    const wrapper = mount(MediaGrid);
    expect(wrapper.text()).toContain('No media files found in this album.');
  });

  it('renders grid items', () => {
    mockState.gridMediaFiles = [
      { path: '/path/to/image1.jpg', name: 'image1.jpg' },
      { path: '/path/to/video1.mp4', name: 'video1.mp4' },
    ];

    const wrapper = mount(MediaGrid);
    const items = wrapper.findAll('.group');
    expect(items.length).toBe(2);
  });

  it('renders image tag for images', () => {
    mockState.gridMediaFiles = [
      { path: '/path/to/image1.jpg', name: 'image1.jpg' },
    ];
    const wrapper = mount(MediaGrid);
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
  });

  it('renders video tag for videos', () => {
    mockState.gridMediaFiles = [
      { path: '/path/to/video1.mp4', name: 'video1.mp4' },
    ];
    const wrapper = mount(MediaGrid);
    const video = wrapper.find('video');
    expect(video.exists()).toBe(true);
    expect(wrapper.text()).toContain('VIDEO');
  });
});
